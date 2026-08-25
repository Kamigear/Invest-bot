const { db, serverTimestamp } = require('./firebase');
const { Logger } = require('./logger');

const DEFAULT_LEADERBOARD_URL = 'https://boardleaders.rf.gd/';
const SNAPSHOT_LIMIT = parseInt(process.env.LEADERBOARD_ANALYTICS_SNAPSHOT_LIMIT, 10) || 220;

function normalizeName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function classKey(row) {
  return `${row.grade}::${normalizeName(row.name)}`;
}

function toDateKey(timestamp) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parsePoints(raw) {
  const cleaned = String(raw || '').replace(/[^\d-]/g, '');
  return cleaned ? Number(cleaned) : 0;
}

async function scrapeLeaderboard(page, sourceUrl) {
  await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('.board-section'));
    const sourceSections = sections.length ? sections : Array.from(document.querySelectorAll('[id^="grade-"]'));

    const rows = [];
    sourceSections.forEach(section => {
      const idGrade = String(section.id || '').match(/grade-(\d+)/i);
      const headingGrade = (section.querySelector('h2')?.innerText || '').match(/kelas\s*(\d+)/i);
      const grade = idGrade ? Number(idGrade[1]) : headingGrade ? Number(headingGrade[1]) : null;
      if (!grade) return;

      section.querySelectorAll('table tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length < 3) return;

        const rank = parseInt((cells[0].innerText || '').replace(/[^\d]/g, ''), 10) || null;
        const name = (cells[1].querySelector('span')?.innerText || cells[1].innerText || '').trim();
        const totalText = cells[2].innerText || '';
        const total = parseInt(totalText.replace(/[^\d-]/g, ''), 10) || 0;

        if (name) {
          rows.push({ grade, rank, name, total });
        }
      });
    });

    return rows;
  });
}

function findBaseline(snapshots, targetMs) {
  const sorted = snapshots
    .filter(s => Number.isFinite(s.scrapedAtMs))
    .sort((a, b) => b.scrapedAtMs - a.scrapedAtMs);

  return sorted.find(s => s.scrapedAtMs <= targetMs) || sorted[sorted.length - 1] || null;
}

function mapSnapshot(snapshot) {
  const map = new Map();
  for (const row of snapshot?.classes || []) {
    map.set(classKey(row), row);
  }
  return map;
}

function growthAgainst(row, baselineMap) {
  const previous = baselineMap.get(classKey(row));
  return previous ? row.total - parsePoints(previous.total) : null;
}

function summarizeGrade(rows, grade) {
  const scoped = rows.filter(row => grade == null || row.grade === grade);
  const totalPoints = scoped.reduce((sum, row) => sum + row.total, 0);
  const growth24h = scoped.reduce((sum, row) => sum + (row.growth24h || 0), 0);
  const sorted = [...scoped].sort((a, b) => b.total - a.total);

  return {
    grade: grade == null ? 'all' : grade,
    classCount: scoped.length,
    totalPoints,
    growth24h,
    topClass: sorted[0] || null,
    avgGrowth24h: scoped.length ? Number((growth24h / scoped.length).toFixed(2)) : 0
  };
}

function buildAnalytics(currentClasses, previousSnapshots, sourceUrl, scrapedAtMs) {
  const oneDay = findBaseline(previousSnapshots, scrapedAtMs - 24 * 60 * 60 * 1000);
  const sevenDays = findBaseline(previousSnapshots, scrapedAtMs - 7 * 24 * 60 * 60 * 1000);
  const thirtyDays = findBaseline(previousSnapshots, scrapedAtMs - 30 * 24 * 60 * 60 * 1000);
  const oldest = previousSnapshots.length > 0
    ? [...previousSnapshots].sort((a, b) => (a.scrapedAtMs || 0) - (b.scrapedAtMs || 0))[0]
    : null;

  const baseline24h = mapSnapshot(oneDay);
  const baseline7d = mapSnapshot(sevenDays);
  const baseline30d = mapSnapshot(thirtyDays);
  const baselineAll = mapSnapshot(oldest);

  const rows = currentClasses.map(row => {
    const growth24h = growthAgainst(row, baseline24h);
    const growth7d = growthAgainst(row, baseline7d);
    const growth30d = growthAgainst(row, baseline30d);
    const growthAll = growthAgainst(row, baselineAll);
    const trend = growth24h == null ? 'unknown' : growth24h > 0 ? 'up' : growth24h < 0 ? 'down' : 'flat';

    return {
      ...row,
      key: classKey(row),
      growth24h,
      growth7d,
      growth30d,
      growthAll,
      trend
    };
  });

  const topBy = (field) => [...rows]
    .filter(row => row[field] != null)
    .sort((a, b) => b[field] - a[field])
    .slice(0, 10);

  // Build point history per class from snapshots (daily timeline)
  const allSnapshots = [...previousSnapshots, { classes: currentClasses, scrapedAtMs }];
  const pointHistory = {};
  for (const snap of allSnapshots) {
    for (const cls of snap.classes || []) {
      const key = classKey(cls);
      if (!pointHistory[key]) pointHistory[key] = [];
      pointHistory[key].push({
        date: toDateKey(snap.scrapedAtMs || snap.scrapedAt),
        total: cls.total,
        scrapedAt: snap.scrapedAtMs
      });
    }
  }
  // Sort each class's history by date and keep the LATEST snapshot per date (overriding earlier runs today)
  for (const key of Object.keys(pointHistory)) {
    const byDate = {};
    for (const entry of pointHistory[key]) {
      byDate[entry.date] = entry; // latest run today overrides earlier runs today
    }
    pointHistory[key] = Object.values(byDate).sort((a, b) => a.scrapedAt - b.scrapedAt);
  }

  return {
    sourceUrl,
    scrapedAt: new Date(scrapedAtMs).toISOString(),
    scrapedAtMs,
    snapshotCount: previousSnapshots.length + 1,
    baselines: {
      growth24h: oneDay ? oneDay.scrapedAt : null
    },
    gradeSummary: [null, 10, 11, 12].map(grade => summarizeGrade(rows, grade)),
    classes: rows.sort((a, b) => b.total - a.total),
    topGrowth24h: topBy('growth24h'),
    pointHistory
  };
}

async function fetchPreviousSnapshots() {
  const snap = await db.collection('leaderboardSnapshots')
    .orderBy('scrapedAtMs', 'desc')
    .limit(SNAPSHOT_LIMIT)
    .get();

  return snap.docs.map(doc => doc.data());
}

async function runLeaderboardAnalytics(pageFactory) {
  const enabled = process.env.LEADERBOARD_ANALYTICS_ENABLED !== 'false' && process.env.LEADERBOARD_ANALYTICS_ENABLED !== '0';
  if (!enabled) {
    Logger.info('Leaderboard analytics dilewati (fitur dinonaktifkan)', { task: 'LEADERBOARD_ANALYTICS' });
    return { status: 'SKIPPED', task: 'LEADERBOARD_ANALYTICS' };
  }

  const sourceUrl = process.env.LEADERBOARD_URL || DEFAULT_LEADERBOARD_URL;
  const scrapedAtMs = Date.now();
  let browser;

  try {
    Logger.info('Mengambil snapshot leaderboard', { task: 'LEADERBOARD_ANALYTICS', sourceUrl });
    const setup = await pageFactory();
    browser = setup.browser;

    const currentClasses = await scrapeLeaderboard(setup.page, sourceUrl);
    if (!currentClasses.length) {
      throw new Error('Tidak ada data kelas yang terbaca dari leaderboard.');
    }

    const previousSnapshots = await fetchPreviousSnapshots();
    const analytics = buildAnalytics(currentClasses, previousSnapshots, sourceUrl, scrapedAtMs);

    // Document ID per hari (snap_YYYY-MM-DD) agar run berkala (misal 1 jam sekali) saling override sampai tengah malam
    const todayDateStr = toDateKey(scrapedAtMs);
    const snapshotId = `snap_${todayDateStr}`;

    await db.collection('leaderboardSnapshots').doc(snapshotId).set({
      id: snapshotId,
      date: todayDateStr,
      sourceUrl,
      scrapedAt: analytics.scrapedAt,
      scrapedAtMs,
      classes: currentClasses,
      createdAt: serverTimestamp()
    });

    await db.collection('botState').doc('leaderboardAnalytics').set({
      ...analytics,
      generatedAt: serverTimestamp()
    });

    // Catat point history & snapshot secara lokal setelah semua task analytics selesai
    saveLocalPointHistory(analytics);

    Logger.success('Leaderboard analytics berhasil diperbarui (snapshot harian di-override)', {
      task: 'LEADERBOARD_ANALYTICS',
      snapshotId,
      classes: currentClasses.length,
      snapshotCount: analytics.snapshotCount
    });

    return { status: 'COMPLETED', task: 'LEADERBOARD_ANALYTICS', classes: currentClasses.length, analytics };
  } catch (error) {
    Logger.error(`Leaderboard analytics gagal: ${error.message}`, {
      task: 'LEADERBOARD_ANALYTICS',
      error: error.message
    });
    return { status: 'ERROR', task: 'LEADERBOARD_ANALYTICS', error: error.message };
  } finally {
    if (browser) {
      await browser.close();
      Logger.info('Browser leaderboard analytics ditutup', { task: 'LEADERBOARD_ANALYTICS' });
    }
  }
}

const fs = require('fs');
const path = require('path');

function saveLocalPointHistory(analytics) {
  try {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const historyFilePath = path.join(logsDir, 'point_history.json');
    let historyData = { snapshots: [], pointHistory: {}, lastUpdated: null };

    if (fs.existsSync(historyFilePath)) {
      try {
        const raw = fs.readFileSync(historyFilePath, 'utf8');
        historyData = JSON.parse(raw);
      } catch (_) { /* create fresh if parse error */ }
    }

    historyData.lastUpdated = new Date().toISOString();
    historyData.snapshotCount = analytics.snapshotCount;
    historyData.pointHistory = analytics.pointHistory || {};

    const todayDateStr = toDateKey(analytics.scrapedAtMs || Date.now());
    const newSnapshot = {
      date: todayDateStr,
      scrapedAt: analytics.scrapedAt,
      scrapedAtMs: analytics.scrapedAtMs,
      classes: (analytics.classes || []).map(c => ({ grade: c.grade, name: c.name, total: c.total }))
    };

    if (!Array.isArray(historyData.snapshots)) historyData.snapshots = [];

    // Override snapshot lokal jika tanggal yang sama sudah ada hari ini
    const existingIdx = historyData.snapshots.findIndex(s => s.date === todayDateStr || toDateKey(s.scrapedAtMs) === todayDateStr);
    if (existingIdx >= 0) {
      historyData.snapshots[existingIdx] = newSnapshot;
    } else {
      historyData.snapshots.push(newSnapshot);
    }

    if (historyData.snapshots.length > 300) {
      historyData.snapshots = historyData.snapshots.slice(-300);
    }

    fs.writeFileSync(historyFilePath, JSON.stringify(historyData, null, 2), 'utf8');
    Logger.info(`Point history dicatat secara lokal di ${historyFilePath}`, { task: 'LEADERBOARD_ANALYTICS' });
  } catch (err) {
    Logger.error(`Gagal menyimpan point history lokal: ${err.message}`, { task: 'LEADERBOARD_ANALYTICS' });
  }
}

module.exports = {
  runLeaderboardAnalytics,
  buildAnalytics,
  saveLocalPointHistory
};
