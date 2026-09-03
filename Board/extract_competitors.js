#!/usr/bin/env node
/**
 * ==============================================================================
 * COMPETITOR GROWTH EXTRACTOR & ANALYZER (Orange Pi CLI)
 * ==============================================================================
 * Script mandiri untuk mengekstrak data realtime leaderboard kompetisi,
 * menghitung kecepatan pertumbuhan (growth rate 24h, 7d, all-time),
 * membandingkan gap poin terhadap kelas kita, dan menghasilkan tabel Markdown
 * yang siap dimasukkan ke AI penganalisis portofolio.
 *
 * Penggunaan di Orange Pi:
 *   node extract_competitors.js                  # Tampilan tabel terminal lengkap
 *   node extract_competitors.js --markdown       # Format tabel Markdown untuk AI
 *   node extract_competitors.js --grade 10       # Filter grade tertentu (10/11/12)
 *   node extract_competitors.js --json           # Output JSON mentah
 *   node extract_competitors.js --save           # Simpan hasil ke competitor_report.md
 * ==============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// ─── KONFIGURASI DEFAULT ──────────────────────────────────────────────────────
const LEADERBOARD_URL = process.env.LEADERBOARD_URL || 'https://boardleaders.rf.gd/';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUR_CLASS_ID = process.env.REP_CLASS_ID || '4';
const OUR_CLASS_NAME_PATTERNS = ['kaleb', 'mr kaleb', 'class mr kaleb'];

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

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────
function normalizeName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function resolveClassId(row) {
  if (row.classId != null && String(row.classId).trim() !== '') {
    return String(row.classId).trim();
  }
  const norm = normalizeName(row.name);
  for (const item of KNOWN_CLASS_MAP) {
    for (const pat of item.namePatterns) {
      if (norm.includes(pat)) return item.id;
    }
  }
  return null;
}

function classKey(row) {
  const cid = resolveClassId(row);
  if (cid) return `id::${cid}`;
  return `${row.grade}::${normalizeName(row.name)}`;
}

function isOurClass(row) {
  const cid = resolveClassId(row);
  if (cid && cid === String(OUR_CLASS_ID)) return true;
  const norm = normalizeName(row.name);
  return OUR_CLASS_NAME_PATTERNS.some(p => norm.includes(p));
}

function parsePoints(raw) {
  const cleaned = String(raw || '').replace(/[^\d-]/g, '');
  return cleaned ? Number(cleaned) : 0;
}

function toDateKey(timestamp) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── FIREBASE / LOCAL HISTORY RETRIEVAL ────────────────────────────────────────
async function fetchSnapshotsFromFirebase() {
  try {
    const { db } = require('./firebase');
    const snap = await db.collection('leaderboardSnapshots')
      .orderBy('scrapedAtMs', 'desc')
      .limit(60)
      .get();
    return snap.docs.map(d => d.data());
  } catch (err) {
    // Graceful fallback jika Firebase credentials tidak ada di local environment
    return null;
  }
}

function fetchLocalHistory() {
  try {
    const historyPath = path.join(__dirname, 'logs', 'point_history.json');
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, 'utf8');
      const data = JSON.parse(raw);
      return data.snapshots || [];
    }
  } catch (_) {}
  return [];
}

function findHistoricalBaseline(snapshots, targetOffsetMs, scrapedAtMs) {
  if (!snapshots || snapshots.length === 0) return new Map();
  const targetMs = scrapedAtMs - targetOffsetMs;
  
  const sorted = snapshots
    .filter(s => Number.isFinite(s.scrapedAtMs))
    .sort((a, b) => b.scrapedAtMs - a.scrapedAtMs);

  if (sorted.length === 0) return new Map();

  // 1. Exact date key match
  const targetDateStr = toDateKey(targetMs);
  let matchedSnap = sorted.find(s => toDateKey(s.scrapedAtMs) === targetDateStr);

  // 2. Nearest older snapshot <= targetMs
  if (!matchedSnap) {
    matchedSnap = sorted.find(s => s.scrapedAtMs <= targetMs);
  }

  // 3. Fallback to oldest snapshot
  if (!matchedSnap && sorted.length > 0) {
    matchedSnap = sorted[sorted.length - 1];
  }

  const map = new Map();
  if (matchedSnap && matchedSnap.classes) {
    for (const c of matchedSnap.classes) {
      map.set(classKey(c), parsePoints(c.total));
    }
  }
  return map;
}

// ─── LIVE LEADERBOARD SCRAPER ─────────────────────────────────────────────────
async function scrapeLiveLeaderboard() {
  console.log(`\x1b[36m[INFO]\x1b[0m Membuka browser Puppeteer (${CHROMIUM_PATH})...`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  console.log(`\x1b[36m[INFO]\x1b[0m Mengakses leaderboard: ${LEADERBOARD_URL}`);
  await page.goto(LEADERBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

  const rows = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('.board-section')).length
      ? Array.from(document.querySelectorAll('.board-section'))
      : Array.from(document.querySelectorAll('[id^="grade-"]'));

    const list = [];
    sections.forEach(section => {
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
          list.push({ grade, rank, name, total });
        }
      });
    });

    return list;
  });

  // Ambil mapping nama kelas ke classId dari rep_panel jika memungkinkan
  let selectOptions = [];
  try {
    const panelUrl = process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php';
    await page.goto(panelUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    selectOptions = await page.evaluate(() => {
      const select = document.querySelector('select[name="class_id"]');
      if (!select) return [];
      return Array.from(select.querySelectorAll('option'))
        .map(opt => ({ value: opt.value ? opt.value.trim() : '', text: opt.innerText ? opt.innerText.trim() : '' }))
        .filter(o => o.value);
    });
  } catch (_) {}

  await browser.close();

  return rows.map(r => {
    const norm = normalizeName(r.name);
    const matched = selectOptions.find(o => normalizeName(o.text) === norm);
    return {
      ...r,
      classId: matched ? matched.value : resolveClassId(r)
    };
  });
}

// ─── ANALYTICS ENGINE ─────────────────────────────────────────────────────────
function calculateAnalytics(currentRows, snapshots, nowMs) {
  const map24h = findHistoricalBaseline(snapshots, 24 * 60 * 60 * 1000, nowMs);
  const map3d  = findHistoricalBaseline(snapshots, 3 * 24 * 60 * 60 * 1000, nowMs);
  const map7d  = findHistoricalBaseline(snapshots, 7 * 24 * 60 * 60 * 1000, nowMs);

  // Temukan kelas kita
  const ourClass = currentRows.find(isOurClass) || { total: 0, rank: null, name: 'Class Mr Kaleb' };

  return currentRows.map(row => {
    const key = classKey(row);
    const prev24h = map24h.get(key);
    const prev3d  = map3d.get(key);
    const prev7d  = map7d.get(key);

    const growth24h = prev24h !== undefined ? row.total - prev24h : null;
    const growth3d  = prev3d  !== undefined ? row.total - prev3d  : null;
    const growth7d  = prev7d  !== undefined ? row.total - prev7d  : null;

    const dailyPace = growth7d !== null ? Number((growth7d / 7).toFixed(1)) : (growth24h !== null ? growth24h : 0);
    const gapToUs = row.total - ourClass.total;

    // Hitung kecepatan kejar-mengejar
    let overtakeEstimate = 'N/A';
    if (!isOurClass(row) && ourClass.total > 0) {
      const ourPace = (ourClass.growth7d !== undefined && ourClass.growth7d !== null)
        ? (ourClass.growth7d / 7)
        : (ourClass.growth24h || 0);
      const paceDiff = dailyPace - ourPace;
      
      if (gapToUs > 0) {
        overtakeEstimate = paceDiff > 0 ? `Tertinggal +${Math.round(paceDiff)} Pt/hari` : `Mendekat (-${Math.round(Math.abs(paceDiff))} Pt/hari)`;
      } else {
        overtakeEstimate = paceDiff > 0 ? `Akan tersalip dlm ~${Math.round(Math.abs(gapToUs) / paceDiff)} hr` : 'Aman (Pace Lebih Rendah)';
      }
    }

    return {
      ...row,
      key,
      isSelf: isOurClass(row),
      growth24h,
      growth3d,
      growth7d,
      dailyPace,
      gapToUs,
      overtakeEstimate
    };
  });
}

// ─── FORMATTERS ───────────────────────────────────────────────────────────────
function formatConsoleTable(analyzedRows, gradeFilter) {
  const filtered = gradeFilter ? analyzedRows.filter(r => String(r.grade) === String(gradeFilter)) : analyzedRows;
  
  console.log('\n\x1b[1m\x1b[35m' + '═'.repeat(96) + '\x1b[0m');
  console.log(`\x1b[1m\x1b[32m 📊 LEADERBOARD & COMPETITOR GROWTH REPORT (Live Orange Pi Scan)\x1b[0m`);
  console.log(`\x1b[90m Waktu Scan: ${new Date().toLocaleString('id-ID')} | Total Kelas: ${filtered.length}\x1b[0m`);
  console.log('\x1b[1m\x1b[35m' + '═'.repeat(96) + '\x1b[0m');

  const headers = [
    'Rnk'.padEnd(4),
    'Grd'.padEnd(4),
    'Nama Kelas'.padEnd(24),
    'Total Poin'.padStart(11),
    'Growth 24h'.padStart(12),
    'Growth 7d'.padStart(11),
    'Pace/Hari'.padStart(11),
    'Gap dgn Kita'.padStart(14)
  ];
  console.log('\x1b[1m\x1b[37m' + headers.join(' | ') + '\x1b[0m');
  console.log('\x1b[90m' + '─'.repeat(96) + '\x1b[0m');

  filtered.forEach(r => {
    const isUs = r.isSelf;
    const highlight = isUs ? '\x1b[1m\x1b[33m' : (r.rank <= 3 ? '\x1b[32m' : '\x1b[0m');
    const reset = '\x1b[0m';

    const rankStr = `#${r.rank || '?'}`.padEnd(4);
    const gradeStr = `K${r.grade}`.padEnd(4);
    const nameStr = (isUs ? `★ ${r.name}` : r.name).slice(0, 22).padEnd(24);
    const totalStr = `${r.total.toLocaleString('id-ID')} Pt`.padStart(11);
    
    const g24Sign = (r.growth24h > 0 ? '+' : '');
    const g24Str = (r.growth24h != null ? `${g24Sign}${r.growth24h} Pt` : 'N/A').padStart(12);
    
    const g7Sign = (r.growth7d > 0 ? '+' : '');
    const g7Str = (r.growth7d != null ? `${g7Sign}${r.growth7d} Pt` : 'N/A').padStart(11);
    
    const paceStr = (r.dailyPace ? `+${r.dailyPace} Pt` : '0 Pt').padStart(11);
    
    const gapSign = (r.gapToUs > 0 ? '+' : '');
    const gapStr = (isUs ? '0 (KITA)' : `${gapSign}${r.gapToUs} Pt`).padStart(14);

    console.log(`${highlight}${rankStr} | ${gradeStr} | ${nameStr} | ${totalStr} | ${g24Str} | ${g7Str} | ${paceStr} | ${gapStr}${reset}`);
  });

  console.log('\x1b[1m\x1b[35m' + '═'.repeat(96) + '\x1b[0m\n');
}

function generateMarkdownSnippet(analyzedRows, gradeFilter) {
  const filtered = gradeFilter ? analyzedRows.filter(r => String(r.grade) === String(gradeFilter)) : analyzedRows;
  
  let md = `## 📊 DATA KOMPETITOR & GROWTH VELOCITY (Live Snapshot: ${new Date().toISOString().split('T')[0]})\n\n`;
  md += `| Peringkat | Kelas | Grade | Total Poin Saat Ini | Pertumbuhan 24 Jam | Pertumbuhan 7 Hari | Laju Rata-rata/Hari | Selisih (Gap) dg Kelas Kami |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  filtered.forEach(r => {
    const isUs = r.isSelf;
    const nameFormatted = isUs ? `**${r.name} (KELAS KAMI)**` : r.name;
    const g24 = r.growth24h != null ? `${r.growth24h > 0 ? '+' : ''}${r.growth24h} Pt` : 'N/A';
    const g7 = r.growth7d != null ? `${r.growth7d > 0 ? '+' : ''}${r.growth7d} Pt` : 'N/A';
    const pace = `+${r.dailyPace} Pt/hari`;
    const gap = isUs ? '0 (Baseline)' : `${r.gapToUs > 0 ? '+' : ''}${r.gapToUs} Pt`;

    md += `| #${r.rank} | ${nameFormatted} | Kelas ${r.grade} | **${r.total.toLocaleString('id-ID')} Pt** | ${g24} | ${g7} | ${pace} | ${gap} |\n`;
  });

  md += `\n> *Data diekstrak otomatis via Puppeteer di OrangePi. Siap digunakan langsung dalam prompt AI analisis.*`;
  return md;
}

// ─── MAIN RUNNER ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isMarkdownOnly = args.includes('--markdown');
  const isJson = args.includes('--json');
  const shouldSave = args.includes('--save');
  
  const gradeIdx = args.indexOf('--grade');
  const gradeFilter = gradeIdx !== -1 ? args[gradeIdx + 1] : null;

  try {
    const liveRows = await scrapeLiveLeaderboard();
    if (!liveRows || liveRows.length === 0) {
      console.error('\x1b[31m[ERROR] Gagal mendapatkan data baris dari leaderboard.\x1b[0m');
      process.exit(1);
    }

    // Ambil riwayat
    let snapshots = await fetchSnapshotsFromFirebase();
    if (!snapshots || snapshots.length === 0) {
      snapshots = fetchLocalHistory();
    }

    const nowMs = Date.now();
    const analyzed = calculateAnalytics(liveRows, snapshots, nowMs);

    if (isJson) {
      console.log(JSON.stringify(analyzed, null, 2));
      return;
    }

    const markdownOutput = generateMarkdownSnippet(analyzed, gradeFilter);

    if (isMarkdownOnly) {
      console.log(markdownOutput);
    } else {
      formatConsoleTable(analyzed, gradeFilter);
      console.log('\x1b[33m[TIP]\x1b[0m Untuk mencetak format Markdown yang siap di-copypaste ke AI, gunakan flag: \x1b[1mnode extract_competitors.js --markdown\x1b[0m');
    }

    if (shouldSave) {
      const outputPath = path.join(__dirname, 'competitor_report.md');
      fs.writeFileSync(outputPath, markdownOutput, 'utf8');
      console.log(`\x1b[32m[SUKSES]\x1b[0m File Markdown berhasil disimpan ke: ${outputPath}`);
    }

  } catch (error) {
    console.error('\x1b[31m[CRITICAL ERROR]\x1b[0m', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
