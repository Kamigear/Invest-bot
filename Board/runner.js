/**
 * =============================================================================
 * runner.js — One-Shot Task Runner for GitHub Actions / Cron CLI
 * =============================================================================
 * Penggunaan:
 *   node Board/runner.js claim_daily -> Rutinitas harian (Analytics Kemarin -> Klaim Streak 30+, Perk, Easter Egg)
 *   node Board/runner.js analytics   -> Leaderboard Scrape & Analytics (Hari Ini)
 *   node Board/runner.js decision    -> Decision Engine -> (jika YES) Invest -> Analytics
 *   node Board/runner.js invest      -> Eksekusi investasi terjadwal -> Analytics
 *   node Board/runner.js auto        -> Smart Self-Healing & Catch-up (Anti-Skip)
 *
 * Alur Rutinitas Harian (01:00 WIB):
 *   1. Analytics Kemarin : Snapshot leaderboard sebelum klaim (milik hari sebelumnya)
 *   2. Claim Daily       : Task 1 (Easter Egg) -> Task 2 (Daily Login)
 *   3. Decision & Invest : Decision Engine -> (jika YES) Invest
 *   4. Analytics Hari Ini: Snapshot leaderboard pasca klaim & invest (milik hari ini)
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

function getYesterdayWibDate(d = new Date()) {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  const prevDate = new Date(dateObj.getTime() - 24 * 60 * 60 * 1000);
  return getWibDate(prevDate);
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
    // 1. Task 3 (Leaderboard Analytics Milik Hari Sebelumnya) - SEBELUM KLAIM
    // Menjalankan analytics sebelum klaim agar snapshot mencatat hasil bersih penutupan hari kemarin
    const prevDay = getYesterdayWibDate();
    Logger.info(`Memulai Task 3: Leaderboard Analytics hari sebelumnya (${prevDay}) sebelum klaim...`);
    const analyticsResult = await runTask3({ targetDate: prevDay, isPreviousDay: true });
    if (analyticsResult && analyticsResult.status === 'ERROR') {
      throw new Error(`Leaderboard Analytics hari sebelumnya gagal: ${analyticsResult.error || 'Unknown error'}`);
    }
    Logger.info(`Hasil Leaderboard Analytics hari sebelumnya (${prevDay}):`, { status: analyticsResult?.status || 'DONE' });

    // Tunggu 3 detik agar sesi browser analytics tertutup sempurna sebelum membuka sesi klaim
    await sleep(3000);

    // 2. Task 1: Scrape dashboard & claim Easter Egg jika hari Minggu/jadwalnya
    Logger.info('Memulai Task 1 (Easter Egg & Dashboard Scrape)...');
    await runTask1();

    // 3. Task 2: Claim Daily Login Reward (Streak 30+)
    Logger.info('Memulai Task 2 (Daily Login Reward)...');
    await runTask2();

    // Catat keberhasilan ke Firestore agar mode auto tidak claim dobel dan bisa catch-up jika delay
    await markDailyClaimSuccess();

    // Kirim notifikasi ntfy bahwa claim daily berhasil dengan jam asli
    await sendAlert(
      `🌅 Claim Daily Selesai (${getWibTimeStr()})\n` +
      `📊 Analytics Kemarin (${prevDay}) dicatat & ✅ Daily Login & Easter Egg Berhasil Di Claim`
    );

    Logger.banner('RUNNER: CLAIM DAILY SELESAI DENGAN SUKSES');
  } catch (err) {
    Logger.critical('RUNNER: Terjadi kesalahan pada Claim Daily', { error: err.message });
    await sendAlert(`❌ RUNNER CLAIM DAILY ERROR: ${err.message}`);
    process.exit(1);
  }
}

async function runAnalytics() {
  Logger.banner('RUNNER: LEADERBOARD ANALYTICS DIMULAI');
  try {
    const today = getWibDate();
    const result = await runTask3({ targetDate: today, isPreviousDay: false });
    Logger.info('Hasil Task 3 Analytics:', { status: result?.status || 'DONE', date: today });
    Logger.banner('RUNNER: LEADERBOARD ANALYTICS SELESAI DENGAN SUKSES');
  } catch (err) {
    Logger.critical('RUNNER: Terjadi kesalahan pada Leaderboard Analytics', { error: err.message });
    await sendAlert(`❌ RUNNER ANALYTICS ERROR: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Analytics ulang setelah Decision/Invest selesai (snapshot leaderboard terbaru milik hari ini).
 * Sengaja NON-FATAL: claim & invest yang sudah sukses tidak boleh dianggap gagal
 * hanya karena analytics error.
 */
async function runPostDecisionAnalytics() {
  try {
    const today = getWibDate();
    Logger.info(`Menjalankan Task 3 (Leaderboard Analytics) pasca Decision/Invest (milik hari ini: ${today})...`);
    await sleep(3000); // jeda agar sesi browser invest tertutup sempurna
    const result = await runTask3({ targetDate: today, isPreviousDay: false });
    Logger.info('Hasil Analytics pasca Decision:', { status: result?.status || 'DONE', date: today });
  } catch (err) {
    Logger.warning('Analytics pasca Decision gagal (non-fatal):', { error: err.message });
    await sendAlert(`⚠️ Analytics pasca Decision gagal: ${err.message}`);
  }
}

async function runDecision() {
  Logger.banner('RUNNER: DECISION ENGINE DIMULAI (01:00 WIB Routine)');
  try {
    // 1. Tarik snapshot leaderboard terbaru setelah klaim (milik hari ini)
    // agar Decision Engine membaca saldo kas dan income hari ini yang SUDAH mencakup hasil klaim harian!
    const today = getWibDate();
    Logger.info(`Menjalankan Task 3 (Leaderboard Analytics) pasca klaim (${today}) sebelum Decision Engine...`);
    await runTask3({ targetDate: today, isPreviousDay: false });
    await sleep(2000);

    // 2. Evaluasi keputusan investasi menggunakan data saldo pasca klaim
    const result = await evaluateAndDecide();
    Logger.info('Hasil Decision Engine:', { decision: result.decision, reason: result.reason, amount: result.amount });

    // 3. Jika keputusan YA, langsung eksekusi transaksi investasi
    if (result && result.decision === 'YES') {
      Logger.info('Keputusan YA terkonfirmasi -> Menjalankan eksekusi investasi langsung...');
      await sleep(2000);
      await runInvest();

      // 4. Analytics ulang pasca investasi jika terjadi transaksi invest
      await runPostDecisionAnalytics();
    }

    Logger.banner('RUNNER: DECISION ENGINE SELESAI DENGAN SUKSES');
    return result;
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
    return jobResult;
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
  } else if (arg === 'full_run' || arg === 'all' || arg === 'routine' || arg === 'simulate') {
    Logger.banner('RUNNER: FULL RUN / SIMULASI RUTINITAS LENGKAP DIMULAI');
    Logger.info('Menjalankan seluruh alur tanpa batasan jam/status (Analytics Kemarin -> Claim -> Decision/Invest -> Analytics Hari Ini)');

    // 1. Claim Daily (Task 3 Analytics Kemarin -> Task 1 Easter Egg + Task 2 Streak Login)
    await runClaimDaily();

    // 2. Tunggu 3 detik agar browser tertutup sempurna
    await sleep(3000);

    // 3. Decision Engine & eksekusi invest jika YA (sudah termasuk analytics pasca decision)
    Logger.info('Melanjutkan ke Decision Engine & Eksekusi Investasi...');
    await runDecision();

    Logger.banner('RUNNER: FULL RUN / SIMULASI SELESAI DENGAN SUKSES');
  } else if (arg === 'invest') {
    // Mode invest berdiri sendiri -> tidak lewat runDecision(), jadi analytics dijalankan di sini
    await runInvest();
    await runPostDecisionAnalytics();
  } else if (arg === 'analytics') {
    await runAnalytics();
  } else if (arg === 'decision') {
    await runDecision();
  } else if (arg === 'auto') {
    // Mode Auto: Smart Unified Daily Routine (01:00 WIB) & Catch-Up Logic
    // Flag ini true bila analytics sudah jalan (lewat runClaimDaily atau runDecision)
    let analyticsAlreadyRan = false;

    // 1. Cek & Jalankan Rutinitas Harian jika jam >= 01:00 WIB dan belum diklaim hari ini
    if (wibHour >= 1) {
      const alreadyClaimed = await isDailyClaimDoneToday();
      if (!alreadyClaimed) {
        Logger.info(`Rutinitas Harian belum dijalankan hari ini (${getWibDate()}) -> Menjalankan Claim Daily & Easter Egg`);
        await runClaimDaily();
        analyticsAlreadyRan = true;

        // Tunggu 3 detik agar sesi browser daily reward tertutup sempurna
        await sleep(3000);

        // Lanjutkan dengan Decision Engine & Eksekusi Investasi (+ analytics pasca decision)
        Logger.info('Melanjutkan langsung ke Decision Engine setelah Claim Daily...');
        await runDecision();
      } else {
        Logger.info(`Claim Daily sudah sukses dicatat untuk hari ini (${getWibDate()}).`);

        // Jika Claim Daily sudah selesai tapi Decision Engine belum sempat dievaluasi
        const decisionDone = await isDecisionDoneToday();
        if (!decisionDone) {
          Logger.info(`Decision Engine belum dievaluasi untuk hari ini (${getWibDate()}) -> Menjalankan Decision Engine (Catch-up)`);
          await runDecision();
          analyticsAlreadyRan = true; // analytics sudah dijalankan di dalam runDecision()
        } else {
          Logger.info(`Decision Engine sudah dievaluasi untuk hari ini (${getWibDate()}).`);
        }
      }
    } else {
      Logger.info(`Belum memasuki jadwal Rutinitas Harian (jam saat ini: ${wibHour}:00 WIB, jadwal: >= 01:00 WIB)`);
    }

    // 2. Hourly Analytics hanya jika belum dijalankan oleh rutinitas di atas
    if (!analyticsAlreadyRan) {
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