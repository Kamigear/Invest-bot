/**
 * =============================================================================
 * runner.js — One-Shot Task Runner for GitHub Actions / Cron CLI
 * =============================================================================
 * Penggunaan:
 *   node Board/runner.js claim_daily -> Rutinitas harian (Klaim Streak 30+, Perk, Easter Egg, Analytics)
 *   node Board/runner.js analytics   -> Rutinitas tiap 1 jam (Leaderboard Scrape & Analytics)
 *   node Board/runner.js decision    -> Rutinitas jam 23:00 WIB (Automated Decision Engine)
 *   node Board/runner.js invest      -> Eksekusi investasi terjadwal jika ada
 *   node Board/runner.js auto        -> Smart Self-Healing & Catch-up (Anti-Skip)
 * =============================================================================
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Logger } = require('./logger');
const { runTask1, runTask2, runTask3, runDailyJobWithLock } = require('./index');
const { evaluateAndDecide } = require('./decisionEngine');
const { sendAlert } = require('./alert');
const { getDoc, setDoc, serverTimestamp } = require('./firebase');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getWibDate(d = new Date()) {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
}

function getWibTimeStr() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const wib = new Date(utc + (7 * 3600000));
  const hh = String(wib.getHours()).padStart(2, '0');
  const mm = String(wib.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} WIB`;
}

async function isDailyClaimDoneToday() {
  try {
    const today = getWibDate();
    const doc = await getDoc('botState/claimDailyStatus');
    if (doc.exists && doc.data().lastClaimDate === today && doc.data().status === 'SUCCESS') {
      return true;
    }
  } catch (err) {
    Logger.warning('Gagal membaca claimDailyStatus dari Firestore:', { error: err.message });
  }
  return false;
}

async function markDailyClaimSuccess() {
  try {
    const today = getWibDate();
    await setDoc('botState/claimDailyStatus', {
      lastClaimDate: today,
      status: 'SUCCESS',
      lastClaimedAt: serverTimestamp(),
      timeWib: getWibTimeStr()
    }, { merge: true });
    Logger.info(`Status claim daily untuk ${today} berhasil dicatat di Firestore`);
  } catch (err) {
    Logger.warning('Gagal mencatat claimDailyStatus ke Firestore:', { error: err.message });
  }
}

async function isDecisionDoneToday() {
  try {
    const today = getWibDate();
    const entryId = `inv_${today}`;
    const [schedDoc, decisionDoc] = await Promise.all([
      getDoc(`schedules/${entryId}`).catch(() => null),
      getDoc('botState/decisionLog').catch(() => null)
    ]);
    if (schedDoc && schedDoc.exists) return true;
    if (decisionDoc && decisionDoc.exists && decisionDoc.data() && decisionDoc.data()[today]) return true;
  } catch (err) {
    Logger.warning('Gagal membaca status decision dari Firestore:', { error: err.message });
  }
  return false;
}

async function runClaimDaily() {
  Logger.banner(`RUNNER: CLAIM DAILY DIMULAI (${getWibTimeStr()})`);
  try {
    // 1. Task 1: Scrape dashboard & claim Easter Egg jika hari Minggu/jadwalnya
    Logger.info('Memulai Task 1 (Easter Egg & Dashboard Scrape)...');
    await runTask1();

    // 2. Task 2: Claim Daily Login Reward (Streak 30+)
    Logger.info('Memulai Task 2 (Daily Login Reward)...');
    await runTask2();

    // 3. Task 3: Sinkronisasi awal leaderboard analytics
    Logger.info('Menjalankan Task 3 (Leaderboard Analytics)...');
    await runTask3();

    // Catat keberhasilan ke Firestore agar mode auto tidak claim dobel dan bisa catch-up jika delay
    await markDailyClaimSuccess();

    // Kirim notifikasi ntfy bahwa claim daily berhasil dengan jam asli
    await sendAlert(
      `🌅 Claim Daily Selesai (${getWibTimeStr()})\n` +
      `✅ Daily Login & Easter Egg Berhasil Di Claim`
    );

    Logger.banner('RUNNER: CLAIM DAILY SELESAI DENGAN SUKSES');
  } catch (err) {
    Logger.critical('RUNNER: Terjadi kesalahan pada Claim Daily', { error: err.message });
    await sendAlert(`❌ RUNNER CLAIM DAILY ERROR: ${err.message}`);
    process.exit(1);
  }
}

async function runAnalytics() {
  Logger.banner('RUNNER: HOURLY ANALYTICS DIMULAI');
  try {
    const result = await runTask3();
    Logger.info('Hasil Task 3 Analytics:', { status: result?.status || 'DONE' });
    Logger.banner('RUNNER: HOURLY ANALYTICS SELESAI DENGAN SUKSES');
  } catch (err) {
    Logger.critical('RUNNER: Terjadi kesalahan pada Hourly Analytics', { error: err.message });
    await sendAlert(`❌ RUNNER ANALYTICS ERROR: ${err.message}`);
    process.exit(1);
  }
}

async function runDecision() {
  Logger.banner('RUNNER: DECISION ENGINE DIMULAI (23:00 WIB Routine)');
  try {
    const result = await evaluateAndDecide();
    Logger.info('Hasil Decision Engine:', { decision: result.decision, reason: result.reason, amount: result.amount });
    Logger.banner('RUNNER: DECISION ENGINE SELESAI DENGAN SUKSES');
  } catch (err) {
    Logger.critical('RUNNER: Terjadi kesalahan pada Decision Engine', { error: err.message });
    await sendAlert(`❌ RUNNER DECISION ERROR: ${err.message}`);
    process.exit(1);
  }
}

async function runInvest() {
  Logger.banner('RUNNER: EKSEKUSI INVESTASI DIMULAI');
  try {
    const jobResult = await runDailyJobWithLock();
    Logger.info('Hasil Eksekusi Investasi:', { status: jobResult?.status || 'NONE' });
    Logger.banner('RUNNER: EKSEKUSI INVESTASI SELESAI');
  } catch (err) {
    Logger.critical('RUNNER: Terjadi kesalahan pada eksekusi investasi', { error: err.message });
    await sendAlert(`❌ RUNNER INVEST ERROR: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const arg = (process.argv[2] || 'auto').toLowerCase();

  // Hitung jam WIB saat ini (UTC + 7)
  const nowUtc = new Date();
  const wibHour = (nowUtc.getUTCHours() + 7) % 24;

  Logger.info(`Runner dijalankan dengan arg: "${arg}" | Jam WIB saat ini: ${wibHour}:00 WIB (${getWibDate()})`);

  if (arg === 'claim_daily' || arg === 'claim-daily' || arg === 'harvest') {
    await runClaimDaily();
  } else if (arg === 'invest') {
    await runInvest();
  } else if (arg === 'analytics') {
    await runAnalytics();
  } else if (arg === 'decision') {
    await runDecision();
  } else if (arg === 'auto') {
    // Mode Auto: Smart Self-Healing & Catch-Up Logic
    let dailyClaimExecuted = false;

    // 1. Cek & Jalankan Claim Daily jika jam >= 04:00 WIB dan belum diklaim hari ini
    if (wibHour >= 4) {
      const alreadyClaimed = await isDailyClaimDoneToday();
      if (!alreadyClaimed) {
        Logger.info(`Claim Daily belum sukses hari ini (${getWibDate()}) -> Menjalankan Claim Daily (Scheduled / Catch-up)`);
        await runClaimDaily();
        dailyClaimExecuted = true;
      } else {
        Logger.info(`Claim Daily sudah sukses dicatat untuk hari ini (${getWibDate()}).`);
      }
    } else {
      Logger.info(`Belum memasuki jadwal Claim Daily (jam saat ini: ${wibHour}:00 WIB, jadwal: >= 04:00 WIB)`);
    }

    // 2. Cek & Jalankan Decision Engine jika jam >= 23:00 WIB dan belum dievaluasi hari ini
    if (wibHour >= 23) {
      const decisionDone = await isDecisionDoneToday();
      if (!decisionDone) {
        Logger.info(`Decision Engine belum dievaluasi untuk hari ini (${getWibDate()}) -> Menjalankan Decision Engine`);
        await runDecision();
      } else {
        Logger.info(`Decision Engine sudah dievaluasi untuk hari ini (${getWibDate()}).`);
      }
    }

    // 3. Jalankan Hourly Analytics jika belum dieksekusi di runClaimDaily
    // (runClaimDaily sudah menjalankan runTask3 di dalamnya)
    if (!dailyClaimExecuted) {
      Logger.info('Menjalankan Hourly Leaderboard Analytics...');
      await runAnalytics();
    }
  } else {
    Logger.error(`Argumen tidak dikenali: "${arg}". Pilihan yang valid: claim_daily, invest, decision, analytics, auto`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
