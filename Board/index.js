require('dotenv').config();
const cron = require('node-cron');
const puppeteer = require('puppeteer');
const { runDailyJob } = require('./executor');
const { sendAlert } = require('./alert');
const { db, serverTimestamp } = require('./firebase');

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
    console.log(`[SISTEM] ${taskName} sedang mengantre, menunggu sesi browser lain selesai...`);
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
// Membaca saldo aktual, menyimpannya ke Firebase, lalu mengklaim poin
// ==========================================
async function runTask1() {
  await waitForTurn("TUGAS 1");
  isBrowserBusy = true;
  
  console.log("\n===========================================");
  console.log("--- [TUGAS 1] MEMULAI PROSES CEK SALDO & KLAIM EASTER EGG ---");
  console.log("===========================================");
  
  let browser;
  try {
    const setup = await openBrowser();
    browser = setup.browser;
    const page = setup.page;

    console.log("[INFO] [TUGAS 1] Membuka halaman utama...");
    await page.goto('https://boardleaders.rf.gd/', { waitUntil: 'networkidle2', timeout: 60000 });

    // ── Ambil saldo aktual sebelum klaim ──────────────────────────
    console.log("[INFO] [TUGAS 1] Memindai saldo terkini dari tabel klasemen...");
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
      console.log(`[SUKSES] [TUGAS 1] Saldo saat ini berhasil ditarik: ${balance}`);
      await db.collection('botState').doc('balance').set({
        balance: balance,
        lastUpdated: serverTimestamp()
      }, { merge: true });
      console.log("[INFO] [TUGAS 1] Saldo berhasil disimpan/diperbarui ke Firebase.");
    } else {
      console.log("[PERINGATAN] [TUGAS 1] Gagal menemukan data saldo untuk prefix yang ditentukan.");
    }

    // ── Klaim Easter Egg ──────────────────────────────────────────
    console.log("[INFO] [TUGAS 1] Mencari elemen tombol Easter Egg...");
    await page.waitForSelector('.easter-egg', { visible: true, timeout: 30000 });
    await page.click('.easter-egg');
    
    console.log("[INFO] [TUGAS 1] Mengisi formulir klaim...");
    await page.waitForSelector('#eggModal', { visible: true, timeout: 10000 });
    await page.select('select[name="class_id"]', '4');
    await page.type('input[name="rep_password"]', '104anakmrkalebyangkerenbngtwowamazinggantengnice');
    await page.click('button[name="claim_egg"]');
    
    console.log("[INFO] [TUGAS 1] Formulir klaim terkirim. Menunggu respons server...");
    await sleep(3000); 
    
    const alertText = await page.evaluate(() => {
      const el = document.querySelector('.alert');
      return el ? el.innerText.trim() : null;
    });

    if (alertText) {
      console.log(`[INFO] [TUGAS 1] Respons server: "${alertText}"`);
    } else {
      console.log("[SUKSES] [TUGAS 1] Proses klaim selesai (Tidak ada pesan error/peringatan dari server).");
    }
  } catch (e) {
    console.error(`[ERROR] [TUGAS 1] Proses terhenti karena kesalahan: ${e.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log("[INFO] [TUGAS 1] Sesi browser ditutup dan memori dibebaskan.\n");
    }
    isBrowserBusy = false; 
  }
}

// ==========================================
// SISTEM PENJADWALAN & START PROGRAM
// ==========================================
function start() {
  console.log("=== SISTEM BOT OTOMATISASI AKTIF ===");
  console.log(`Menunggu jadwal eksekusi berjalan... (Jadwal Cron: ${cronSchedule})\n`);
  sendAlert(`🤖 Bot berhasil dinyalakan!\nJadwal eksekusi: ${cronSchedule}\nMengeksekusi run pertama saat boot...`);

  // FITUR OVERRIDE: Jalankan satu kali saat bot baru dinyalakan
  console.log("\n[SISTEM] Mengeksekusi rutinitas awal saat booting...");
  (async () => {
    try {
      await runTask1();
      await runDailyJob();
      console.log("[SISTEM] Rutinitas awal selesai. Bot kembali ke mode siaga (Cron).\n");
    } catch (err) {
      console.error("[ERROR] Terjadi kesalahan saat rutinitas awal:", err);
    }
  })();

  // Mode Siaga: Satu cron untuk mengeksekusi urutan tugas harian sesuai jadwal
  cron.schedule(cronSchedule, async () => {
    console.log(`\n[${new Date().toISOString()}] === MEMULAI RUTINITAS HARIAN BOT ===`);
    await runTask1();    // Cek saldo & Klaim Easter Egg
    await runDailyJob(); // Cek jadwal investasi di Firebase -> eksekusi jika ada
    console.log(`[${new Date().toISOString()}] === RUTINITAS HARIAN SELESAI ===\n`);
  });
}

process.on('uncaughtException', (error) => {
  console.error('[CRITICAL ERROR] Uncaught Exception:', error);
  sendAlert(`❌ BOT CRASH (Mendadak Berhenti): ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
  sendAlert(`❌ BOT CRASH (Proses Ditolak): ${reason}`);
});

process.on('SIGINT', () => {
  console.log("\n[SISTEM] Proses bot dihentikan secara manual (SIGINT).");
  process.exit(0);
});

if (require.main === module) {
  start();
}

module.exports = { start };
