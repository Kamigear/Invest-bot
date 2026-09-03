/**
 * =============================================================================
 * runner.js — One-Shot Task Runner for GitHub Actions / Cron CLI
 * =============================================================================
 * Penggunaan:
 *   node Board/runner.js harvest    -> Rutinitas jam 06:00 WIB (Klaim Login Streak, Perk, Easter Egg, Invest jika ada jadwal)
 *   node Board/runner.js analytics  -> Rutinitas tiap 1 jam (Leaderboard Scrape & Analytics)
 *   node Board/runner.js decision   -> Rutinitas jam 23:00 WIB (Automated Decision Engine)
 *   node Board/runner.js auto       -> Deteksi otomatis berdasarkan jam WIB sekarang
 * =============================================================================
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Logger } = require('./logger');
const { runTask1, runTask2, runTask3, runDailyJobWithLock } = require('./index');
const { evaluateAndDecide } = require('./decisionEngine');
const { sendAlert } = require('./alert');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runClaimDaily() {
  Logger.banner('RUNNER: CLAIM DAILY DIMULAI (04:00 WIB Routine)');
  try {
    // 1. Task 1: Scrape dashboard & claim Easter Egg jika hari Minggu/jadwalnya
    Logger.info('Memulai Task 1 (Easter Egg & Dashboard Scrape)...');
    await runTask1();

    // 2. Task 2: Claim Daily Login Reward (Streak 30+)
    Logger.info('Memulai Task 2 (Daily Login Reward)...');
    await runTask2();

    // Beri jeda 3 detik agar Chromium tertutup sempurna sebelum eksekusi berikutnya
    await sleep(3000);

    // 3. Daily Job: Eksekusi investasi HANYA jika ada jadwal dari Decision Engine tadi malam
    Logger.info('Memeriksa jadwal investasi hari ini...');
    const jobResult = await runDailyJobWithLock();
    Logger.info('Hasil Daily Job Investasi:', { status: jobResult?.status || 'NONE' });

    // 4. Task 3: Sinkronisasi awal leaderboard analytics
    Logger.info('Menjalankan Task 3 (Leaderboard Analytics)...');
    await runTask3();

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

  Logger.info(`Runner dijalankan dengan arg: "${arg}" | Jam WIB saat ini: ${wibHour}:00 WIB`);

  if (arg === 'claim_daily' || arg === 'claim-daily' || arg === 'harvest') {
    await runClaimDaily();
  } else if (arg === 'invest') {
    await runInvest();
  } else if (arg === 'analytics') {
    await runAnalytics();
  } else if (arg === 'decision') {
    await runDecision();
  } else if (arg === 'auto') {
    // Mode Auto: Deteksi berdasarkan jam WIB saat ini
    if (wibHour === 4) {
      Logger.info('Jam 04:00 WIB terdeteksi -> Menjalankan Claim Daily');
      await runClaimDaily();
    } else if (wibHour === 23) {
      Logger.info('Jam 23:00 WIB terdeteksi -> Menjalankan Decision Engine');
      await runDecision();
    } else {
      Logger.info(`Jam ${wibHour}:00 WIB terdeteksi -> Menjalankan Hourly Analytics`);
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
