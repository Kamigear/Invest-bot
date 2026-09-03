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

const KNOWN_CLASS_MAP = [
  { id: '1', grade: 10, namePatterns: ['10_1km', 'maranthon', '10-1'] },
  { id: '2', grade: 10, namePatterns: ['10-2', 'class 10-2'] },
  { id: '3', grade: 10, namePatterns: ['993-7', 'kent', 'gunawan'] },
  { id: '4', grade: 10, namePatterns: ['kaleb', 'mr kaleb', 'class mr kaleb'] },
  { id: '5', grade: 10, namePatterns: ['10-5', 'class 10-5'] },
  { id: '6', grade: 10, namePatterns: ['10-6'] },
  { id: '7', grade: 10, namePatterns: ['10-7'] },
  { id: '8', grade: 11, namePatterns: ['mie gacoan', 'gacoan'] },
  { id: '9', grade: 11, namePatterns: ['dubai', 'labubu', '11-b'] },
  { id: '10', grade: 12, namePatterns: ['nasipadang', 'cabeijo', 'kol'] },
  { id: '11', grade: 12, namePatterns: ['12-b', 'class 12-b'] },
  { id: '13', grade: 0,  namePatterns: ['admin'] }
];

function resolveClassId(row) {
  if (row.classId != null && String(row.classId).trim() !== '') {
    return String(row.classId).trim();
  }
  const norm = normalizeName(row.name);
  for (const item of KNOWN_CLASS_MAP) {
    for (const pat of item.namePatterns) {
      if (norm.includes(pat)) {
        return item.id;
      }
    }
  }
  return null;
}

function classKey(row) {
  const cid = resolveClassId(row);
  if (cid) {
    return `id::${cid}`;
  }
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
  await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const rows = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('.board-section'));
    const sourceSections = sections.length ? sections : Array.from(document.querySelectorAll('[id^="grade-"]'));

    const parsedRows = [];
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
          parsedRows.push({ grade, rank, name, total });
        }
      });
    });

    return parsedRows;
  });

  // Dynamically fetch rep_panel.php options if possible to attach classId (value)
  let selectOptions = [];
  try {
    const panelUrl = process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php';
    await page.goto(panelUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    selectOptions = await page.evaluate(() => {
      const select = document.querySelector('select[name="class_id"]');
      if (!select) return [];
      return Array.from(select.querySelectorAll('option'))
        .map(opt => ({
          value: opt.value ? opt.value.trim() : '',
          text: opt.innerText ? opt.innerText.trim() : ''
        }))
        .filter(o => o.value);
    });
  } catch (_) { /* continue if rep_panel unreachable */ }

  return rows.map(r => {
    const norm = normalizeName(r.name);
    const matchedOpt = selectOptions.find(o => normalizeName(o.text) === norm);
    const cid = matchedOpt ? matchedOpt.value : resolveClassId(r);
    return {
      ...r,
      classId: cid || null
    };
  });
}

function findBaseline(snapshots, targetMs) {
  if (!snapshots || snapshots.length === 0) return null;
  const sorted = snapshots
    .filter(s => Number.isFinite(s.scrapedAtMs))
    .sort((a, b) => b.scrapedAtMs - a.scrapedAtMs);

  if (sorted.length === 0) return null;

  // 1. Try exact date match (e.g. 7 days ago date string)
  const targetDateStr = toDateKey(targetMs);
  const sameDateSnap = sorted.find(s => toDateKey(s.scrapedAtMs) === targetDateStr);
  if (sameDateSnap) return sameDateSnap;

  // 2. Try latest snapshot <= targetMs
  const olderSnap = sorted.find(s => s.scrapedAtMs <= targetMs);
  if (olderSnap) return olderSnap;

  // 3. Fallback: if targetMs is older than all recorded snapshots (e.g. 7d requested but only 4d exist), return oldest snapshot
  return sorted[sorted.length - 1];
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
      classes: (analytics.classes || []).map(c => ({ classId: c.classId || resolveClassId(c), grade: c.grade, name: c.name, total: c.total }))
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
