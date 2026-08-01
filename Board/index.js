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
// TUGAS 2: UPDATE NAMA REALTIME (UI AUTOMATION)
// ==========================================
async function runTask2() {
  await waitForTurn("TUGAS 2");
  isBrowserBusy = true;

  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  // Format 12 Jam (AM/PM)
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; 
  
  const timeString = `${hours}:${minutes} ${ampm}`;
  const dynamicName = `${PREFIX_NAME}, ${timeString}`;

  console.log("\n-------------------------------------------");
  console.log(`--- [TUGAS 2] UPDATE NAMA (${timeString}) ---`);
  console.log("-------------------------------------------");
  
  let browser;
  try {
    const setup = await openBrowser();
    browser = setup.browser;
    const page = setup.page;

    console.log("[TUGAS 2] Membuka halaman login rep_panel.php...");
    await page.goto('https://boardleaders.rf.gd/rep_panel.php', { waitUntil: 'networkidle2', timeout: 60000 });

    console.log("[TUGAS 2] Mengisi data login...");
    await page.waitForSelector('select[name="class_id"]', { visible: true, timeout: 15000 });
    await page.select('select[name="class_id"]', '4');
    await page.type('input[name="password"]', '104anakmrkalebyangkerenbngtwowamazinggantengnice');
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }), 
      page.click('button[name="login"]')
    ]);

    const loginFailed = await page.evaluate(() => {
      return document.body.innerText.includes('Invalid credential configuration profile');
    });

    if (loginFailed) {
      console.log("[TUGAS 2 ERROR] Login Ditolak! Password salah atau class_id tidak cocok.");
      return; 
    }
    console.log("[TUGAS 2] Login Sukses! Berada di Dashboard.");

    console.log(`[TUGAS 2] Mengetik nama baru: "${dynamicName}"...`);
    await page.waitForSelector('input[name="new_name"]', { visible: true, timeout: 10000 });
    
    await page.$eval('input[name="new_name"]', el => el.value = '');
    await page.type('input[name="new_name"]', dynamicName);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('button[name="change_name"]') 
    ]);

    console.log(`[TUGAS 2 SUKSES] Nama berhasil diperbarui menjadi "${dynamicName}" di server!`);

    // Ambil saldo aktual dari homepage
    console.log("[TUGAS 2] Mengambil saldo aktual dari homepage...");
    await page.goto('https://boardleaders.rf.gd/', { waitUntil: 'networkidle2', timeout: 60000 });
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
      console.log(`[TUGAS 2] Saldo terdeteksi: ${balance}`);
      await db.collection('botState').doc('balance').set({
        balance: balance,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } else {
      console.log("[TUGAS 2 WARNING] Saldo tidak ditemukan di homepage.");
    }

  } catch (e) {
    console.error(`[TUGAS 2 CRITICAL ERROR]: ${e.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log("[TUGAS 2 INFO] Browser ditutup.\n");
    }
    isBrowserBusy = false; 
  }
}

// ==========================================
// SISTEM PENJADWALAN SINKRONISASI
// ==========================================
async function loopTask1() {
  while (true) {
    await runTask1();
    console.log(`[SISTEM] Tugas 1 (Klaim Poin) istirahat 60 menit...`);
    await sleep(60 * 60 * 1000); 
  }
}

async function loopTask2() {
  while (true) {
    // Jalankan tugas update nama
    await runTask2();

    // Hitung sisa milidetik menuju awal menit berikutnya agar sinkron sempurna dengan jam
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    
    console.log(`[SISTEM] Tugas 2 sinkronisasi: menunggu ${Math.round(msUntilNextMinute / 1000)} detik ke menit berikutnya...`);
    await sleep(msUntilNextMinute);
  }
}

// ==========================================
// START PROGRAM
// ==========================================
function start() {
  console.log("=== Bot Aktif ===");
  console.log("Memulai eksekusi paralel & cron job...\n");
  sendAlert(`🤖 Combined Invest & Leaderboard Bot started!\nSchedule: ${cronSchedule}`);

  // 1. Jalankan loop Puppeteer harian/menit
  loopTask1();

  setTimeout(() => {
    loopTask2();
  }, 15000);

  // 2. Jadwalkan investment cron job Firebase harian
  cron.schedule(cronSchedule, () => {
    console.log(`[${new Date().toISOString()}] Running daily investment job...`);
    runDailyJob();
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
