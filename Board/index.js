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
    console.log(`[ANTREAN] ${taskName} menunggu giliran...`);
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
// TUGAS 1: KLAIM EASTER EGG (SETIAP 60 MENIT)
// Sekaligus membaca saldo aktual dan menyimpannya ke Firebase
// ==========================================
async function runTask1() {
  await waitForTurn("TUGAS 1");
  isBrowserBusy = true;
  
  console.log("\n===========================================");
  console.log("--- [TUGAS 1] MULAI KLAIM EASTER EGG ---");
  console.log("===========================================");
  
  let browser;
  try {
    const setup = await openBrowser();
    browser = setup.browser;
    const page = setup.page;

    console.log("[TUGAS 1] Mengakses target...");
    await page.goto('https://boardleaders.rf.gd/', { waitUntil: 'networkidle2', timeout: 60000 });

    // ── Ambil saldo aktual sebelum klaim ──────────────────────────
    console.log("[TUGAS 1] Membaca saldo aktual dari homepage...");
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
      console.log(`[TUGAS 1] Saldo terdeteksi: ${balance}`);
      await db.collection('botState').doc('balance').set({
        balance: balance,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } else {
      console.log("[TUGAS 1 WARNING] Saldo tidak ditemukan di homepage.");
    }

    // ── Klaim Easter Egg ──────────────────────────────────────────
    console.log("[TUGAS 1] Mencari tombol easter-egg...");
    await page.waitForSelector('.easter-egg', { visible: true, timeout: 30000 });
    await page.click('.easter-egg');
    
    await page.waitForSelector('#eggModal', { visible: true, timeout: 10000 });
    await page.select('select[name="class_id"]', '4');
    await page.type('input[name="rep_password"]', '104anakmrkalebyangkerenbngtwowamazinggantengnice');
    await page.click('button[name="claim_egg"]');
    
    console.log("[TUGAS 1] Form dikirim. Mengecek respon...");
    await sleep(3000); 
    
    const alertText = await page.evaluate(() => {
      const el = document.querySelector('.alert');
      return el ? el.innerText.trim() : null;
    });

    if (alertText) {
      console.log(`[TUGAS 1 PESAN SERVER]: "${alertText}"`);
    } else {
      console.log("[TUGAS 1 SUKSES] Poin berhasil diklaim!");
    }
  } catch (e) {
    console.error(`[TUGAS 1 ERROR]: ${e.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log("[TUGAS 1 INFO] Browser ditutup.\n");
    }
    isBrowserBusy = false; 
  }
}

// ==========================================
// SISTEM PENJADWALAN
// ==========================================

// ==========================================
// START PROGRAM
// ==========================================
function start() {
  console.log("=== Bot Aktif ===");
  console.log(`Memulai eksekusi... (Jadwal: ${cronSchedule})\n`);
  sendAlert(`🤖 Invest Bot started!\nJadwal: ${cronSchedule}`);

  // Satu cron untuk semua tugas harian
  cron.schedule(cronSchedule, async () => {
    console.log(`[${new Date().toISOString()}] === Menjalankan semua tugas harian ===`);
    await runTask1();    // Klaim Easter Egg + baca saldo → simpan ke Firebase
    await runDailyJob(); // Cek jadwal Firebase → invest jika ada
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  sendAlert(`❌ Bot FATAL CRASH: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  sendAlert(`❌ Bot FATAL REJECTION: ${reason}`);
});

process.on('SIGINT', () => {
  console.log("\nBot dihentikan.");
  process.exit(0);
});

if (require.main === module) {
  start();
}

module.exports = { start };
