require('dotenv').config();
const cron = require('node-cron');
const puppeteer = require('puppeteer');
const { runDailyJob } = require('./executor');
const { sendAlert } = require('./alert');
const { db, serverTimestamp } = require('./firebase');
const { claimDailyReward } = require('./dailyReward');
const { Logger } = require('./logger');

// ==========================================
// PENGATURAN & ENVS
// ==========================================
const PREFIX_NAME = process.env.PREFIX_NAME || "Class Mr Kalebbbbbbb";
const cronSchedule = process.env.BOT_CRON_SCHEDULE || '0 6 * * *';

// ==========================================
// SISTEM KONTROL & ANTREAN (MUTEX)
// ==========================================
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let isBrowserBusy = false;

async function waitForTurn(taskName) {
  if (isBrowserBusy) {
    Logger.warning(`${taskName} sedang mengantre, menunggu sesi browser lain selesai...`, { taskName });
  }
  while (isBrowserBusy) {
    await sleep(1000);
  }
}

async function openBrowser() {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer'
    ]
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  return { browser, page };
}

// ==========================================
// TUGAS 1: CEK SALDO & KLAIM EASTER EGG
// ==========================================
async function runTask1() {
  await waitForTurn("TUGAS_1");
  isBrowserBusy = true;

  Logger.info("Memulai proses cek saldo & klaim easter egg", { task: "TUGAS_1" });

  let browser;
  try {
    const setup = await openBrowser();
    browser = setup.browser;
    const page = setup.page;

    Logger.info("Membuka halaman utama", { task: "TUGAS_1", url: "https://boardleaders.rf.gd/" });

    await page.goto('https://boardleaders.rf.gd/', { waitUntil: 'networkidle2', timeout: 60000 });

    Logger.info("Memindai saldo terkini dari tabel klasemen", { task: "TUGAS_1", prefix: PREFIX_NAME });

    const balance = await page.evaluate((prefix) => {
      const rows = Array.from(document.querySelectorAll('tr'));
      for (const row of rows) {
        if (row.innerText.includes(prefix)) {
          const strong = row.querySelector('strong');
          return strong ? parseInt(strong.innerText.replace(/\./g, '')) : null;
        }
      }
      return null;
    }, PREFIX_NAME);

    if (balance !== null) {
      Logger.success(`Saldo berhasil ditarik: ${balance}`, { task: "TUGAS_1", balance });
      await db.collection('botState').doc('balance').set({
        balance: balance,
        lastUpdated: serverTimestamp()
      }, { merge: true });
      Logger.info("Saldo berhasil disimpan ke Firebase", { task: "TUGAS_1", collection: "botState/balance" });
    } else {
      Logger.warning("Gagal menemukan data saldo untuk prefix yang ditentukan", { task: "TUGAS_1", prefix: PREFIX_NAME });
    }

    Logger.info("Mencari elemen tombol Easter Egg", { task: "TUGAS_1" });
    await page.waitForSelector('.easter-egg', { visible: true, timeout: 30000 });
    await page.click('.easter-egg');

    Logger.info("Mengisi formulir klaim", { task: "TUGAS_1" });
    await page.waitForSelector('#eggModal', { visible: true, timeout: 10000 });
    await page.select('select[name="class_id"]', '4');
    await page.type('input[name="rep_password"]', '104anakmrkalebyangkerenbngtwowamazinggantengnice');
    await page.click('button[name="claim_egg"]');

    Logger.info("Formulir klaim terkirim, menunggu respons server", { task: "TUGAS_1" });
    await sleep(3000);

    const alertText = await page.evaluate(() => {
      const el = document.querySelector('.alert');
      return el ? el.innerText.trim() : null;
    });

    if (alertText) {
      Logger.info(`Respons server: "${alertText}"`, { task: "TUGAS_1", response: alertText });
    } else {
      Logger.success("Proses klaim selesai (tidak ada pesan error/peringatan)", { task: "TUGAS_1" });
    }
  } catch (error) {
    Logger.error(`Proses terhenti karena kesalahan: ${error.message}`, { task: "TUGAS_1", error: error.message });
  } finally {
    if (browser) {
      await browser.close();
      Logger.info("Sesi browser ditutup dan memori dibersihkan", { task: "TUGAS_1" });
    }
    isBrowserBusy = false;
  }
}

// ==========================================
// TUGAS 2: KLAIM DAILY REWARD
// ==========================================
async function runTask2() {
  await waitForTurn("TUGAS_2");
  isBrowserBusy = true;

  Logger.info("Memulai proses klaim daily reward", { task: "TUGAS_2" });

  const DAILY_REWARD_ENABLED = process.env.DAILY_REWARD_ENABLED !== 'false' && process.env.DAILY_REWARD_ENABLED !== '0';
  if (!DAILY_REWARD_ENABLED) {
    Logger.info("Daily reward dilewati (fitur dinonaktifkan)", { task: "TUGAS_2", enabled: false });
    isBrowserBusy = false;
    return;
  }

  try {
    const result = await claimDailyReward();

    if (result.success) {
      if (result.alreadyClaimed) {
        Logger.success("Daily reward sudah diklaim hari ini", { task: "TUGAS_2", alreadyClaimed: true });
      } else {
        Logger.success(`Daily reward berhasil diklaim: ${result.data}`, { task: "TUGAS_2", data: result.data });
      }
    } else {
      Logger.error(`Gagal klaim daily reward: ${result.error}`, { task: "TUGAS_2", error: result.error });
      await sendAlert(`❌ Daily reward gagal diklaim: ${result.error}`);
    }
  } catch (error) {
    Logger.critical(`Proses terhenti karena kesalahan: ${error.message}`, { task: "TUGAS_2", error: error.message });
    await sendAlert(`❌ TUGAS 2 ERROR: ${error.message}`);
  } finally {
    isBrowserBusy = false;
    Logger.info("Selesai", { task: "TUGAS_2" });
  }
}

// ==========================================
// SISTEM PENJADWALAN & START PROGRAM
// ==========================================
function start() {
  Logger.info("Sistem bot otomatisasi aktif", { cronSchedule });
  sendAlert(`Bot berhasil dinyalakan!\nJadwal eksekusi: ${cronSchedule}\nMengeksekusi run pertama saat boot...`);

  Logger.info("Mengeksekusi rutinitas awal saat booting", { phase: "boot" });

  (async () => {
    try {
      await runTask1();
      await runTask2();
      await runDailyJob();
      Logger.success("Rutinitas awal selesai. Bot kembali ke mode siaga (Cron)", { phase: "boot" });
    } catch (error) {
      Logger.critical("Terjadi kesalahan saat rutinitas awal", { phase: "boot", error: error.message });
    }
  })();

  cron.schedule(cronSchedule, async () => {
    Logger.info("=== MEMULAI RUTINITAS HARIAN BOT ===", { triggeredAt: new Date().toISOString() });
    await runTask1();
    await runTask2();
    await runDailyJob();
    Logger.info("=== RUTINITAS HARIAN SELESAI ===", { triggeredAt: new Date().toISOString() });
  });
}

process.on('uncaughtException', (error) => {
  Logger.critical("Bot crash (mendadak berhenti)", { error: error.message });
  sendAlert(`❌ BOT CRASH (Mendadak Berhenti): ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.critical("Bot crash (proses ditolak)", { reason, promise: promise.toString() });
  sendAlert(`❌ BOT CRASH (Proses Ditolak): ${reason}`);
});

process.on('SIGINT', () => {
  Logger.info("Proses bot dihentikan secara manual (SIGINT)", { signal: "SIGINT" });
  process.exit(0);
});

if (require.main === module) {
  start();
}

module.exports = { start, runTask1, runTask2 };
