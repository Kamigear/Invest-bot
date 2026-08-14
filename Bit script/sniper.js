const puppeteer = require('puppeteer');

// ==================== CONFIGURATION ====================
const CONFIG = {
  // 1. Target & Budget
  TARGET_CLASS: "Class Mr Kalebbbbb", // Nama kelas kamu (pastikan tulisannya sama persis)
  MAX_BUDGET: 100,                    
  
  // 2. Waktu Eksekusi & Polling
  // Format: YYYY-MM-DDTHH:MM:SS+07:00 (+07:00 adalah zona waktu WIB)
  TARGET_TIME: "2026-08-14T19:00:00+07:00", 
  SNIPE_START_SECONDS: 15,            // Berapa detik sebelum waktu habis bot mulai mode spam/sniping
  POLLING_INTERVAL_MIN_MS: 100,       // Minimal jeda refresh
  POLLING_INTERVAL_MAX_MS: 250,       // Maksimal jeda refresh (diacak agar tidak tabrakan)
  SESSION_OFFSET_MS: 200,             // Jeda pembuka antar sesi sebelum mulai polling

  // 3. Simulasi Browser
  NUM_SESSIONS: 5,                    // Jumlah browser/tab incognito yang akan berjalan bersamaan

  // 4. Autentikasi & Sistem
  CLASS_ID: process.env.REP_CLASS_ID || '4',
  PASSWORD: process.env.REP_PASSWORD || '104anakmrkalebyangkerenbngtwowamazinggantengnice',
  PANEL_URL: process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php',
  CHROMIUM_PATH: process.env.CHROMIUM_PATH || null
};
// =======================================================

const TARGET_TIME_MS = new Date(CONFIG.TARGET_TIME).getTime();
let isOurClassWinning = false; // Flag global agar tidak bentrok antar session

async function executeSniperSession(browser, sessionId) {
  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // ----------------------------------------------------------------
    // FASE 1: LOGIN
    // ----------------------------------------------------------------
    console.log(`[Session ${sessionId}] ℹ️ Membuka halaman login...`);
    await page.goto(CONFIG.PANEL_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('select[name="class_id"]', { visible: true, timeout: 15000 });
    await page.select('select[name="class_id"]', CONFIG.CLASS_ID);
    await page.type('input[name="password"]', CONFIG.PASSWORD);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('button[name="login"]')
    ]);

    const loginFailed = await page.evaluate(() => document.body.innerText.includes('Invalid credential'));
    if (loginFailed) {
      console.error(`[Session ${sessionId}] ❌ Login Ditolak! Cek class_id atau password.`);
      return;
    }
    console.log(`[Session ${sessionId}] ✅ Login sukses. Menunggu waktu sniping...`);

    // Handle javascript confirm() dialog secara otomatis
    page.on('dialog', async dialog => {
      await dialog.accept(); 
    });

    // ----------------------------------------------------------------
    // FASE 2: WAITING (Standby sampai H-X detik)
    // ----------------------------------------------------------------
    while (true) {
      const timeLeft = TARGET_TIME_MS - Date.now();
      if (timeLeft <= (CONFIG.SNIPE_START_SECONDS * 1000)) { 
        console.log(`[Session ${sessionId}] ⚠️ Masuk zona eksekusi!`);
        break;
      }
      await new Promise(r => setTimeout(r, 1000)); // Cek setiap 1 detik saat standby
    }

    // ----------------------------------------------------------------
    // FASE 3: SNIPING (Polling Data & Eksekusi Bid)
    // ----------------------------------------------------------------
    
    // OFFSET PEMBUKA: Membuat jeda agar sesi tidak refresh di waktu yang sama persis
    const initialOffset = (sessionId - 1) * CONFIG.SESSION_OFFSET_MS;
    console.log(`[Session ${sessionId}] ⏳ Menunggu offset pembuka selama ${initialOffset}ms...`);
    await new Promise(r => setTimeout(r, initialOffset));

    while (Date.now() < TARGET_TIME_MS) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded' }); 
        
        const auctionData = await page.evaluate(() => {
          const spans = Array.from(document.querySelectorAll('#content-auction p span'));
          const holderSpan = spans.find(span => span.style.color === 'rgb(226, 232, 240)' || span.style.color === '#e2e8f0');
          const input = document.querySelector('input[name="bid_amount"]');
          
          return {
            currentHolder: holderSpan ? holderSpan.innerText.trim() : '',
            minBid: input ? parseInt(input.min) : 0
          };
        });

        isOurClassWinning = auctionData.currentHolder.includes(CONFIG.TARGET_CLASS);

        if (!isOurClassWinning) {
          if (auctionData.minBid > 0 && auctionData.minBid <= CONFIG.MAX_BUDGET) {
            console.log(`[Session ${sessionId}] 🎯 Target terkunci! Mengambil dari "${auctionData.currentHolder}" dengan bid ${auctionData.minBid} Pt`);
            
            await page.$eval('input[name="bid_amount"]', (el, val) => el.value = val, auctionData.minBid);
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {}),
              page.click('button[name="place_bid"]')
            ]);
            
            console.log(`[Session ${sessionId}] ✅ Bid sebesar ${auctionData.minBid} Pt berhasil dikirim!`);
          } else {
            console.error(`[Session ${sessionId}] ❌ Gagal bid. Minimal poin (${auctionData.minBid}) melebihi MAX_BUDGET (${CONFIG.MAX_BUDGET})`);
          }
        } else {
          console.log(`[Session ${sessionId}] ℹ️ Kelas kita sudah memegang bid tertinggi. Standby...`);
        }

        // INTERVAL ACAK: Menghindari sesi sinkron di loop berikutnya
        const randomInterval = Math.floor(
          Math.random() * (CONFIG.POLLING_INTERVAL_MAX_MS - CONFIG.POLLING_INTERVAL_MIN_MS + 1)
        ) + CONFIG.POLLING_INTERVAL_MIN_MS;
        
        await new Promise(r => setTimeout(r, randomInterval));

      } catch (err) {
        await new Promise(r => setTimeout(r, 200)); // Abaikan error minor saat reload
      }
    }

    console.log(`[Session ${sessionId}] 🏁 Waktu lelang habis.`);

  } catch (error) {
    console.error(`[Session ${sessionId}] ❌ Error: ${error.message}`);
  }
}

// ==================== ORCHESTRATOR ====================
async function runAuctionBot() {
  let browser;
  try {
    const launchOptions = {
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--blink-settings=imagesEnabled=false' 
      ]
    };

    // Gunakan executablePath hanya jika di-setting di CONFIG
    if (CONFIG.CHROMIUM_PATH) {
      launchOptions.executablePath = CONFIG.CHROMIUM_PATH;
    }

    browser = await puppeteer.launch(launchOptions);

    console.log(`🚀 Memulai Orkestrasi Auction Sniper untuk ${CONFIG.TARGET_CLASS}...`);
    console.log(`🕒 Waktu penutupan: ${CONFIG.TARGET_TIME}`);
    console.log(`⚔️ Mulai serangan: ${CONFIG.SNIPE_START_SECONDS} detik sebelum ditutup.`);

    const sessions = [];
    for (let i = 1; i <= CONFIG.NUM_SESSIONS; i++) {
      sessions.push(executeSniperSession(browser, i));
      await new Promise(r => setTimeout(r, 1500)); // Staggered login
    }

    await Promise.all(sessions);
    console.log("🏁 Semua sesi sniper telah selesai.");

  } catch (error) {
    console.error(`❌ Critical error di Orchestrator: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log("ℹ️ Browser ditutup.");
    }
  }
}

// Jalankan bot
runAuctionBot();