const puppeteer = require('puppeteer');

// ==================== CONFIGURATION (MOCK TEST) ====================
const CONFIG = {
  // 1. Target
  TARGET_CLASS: "Class Mr Kalebbbbb", // Nama kelas kamu
  
  // 2. Mode Simulasi
  TEST_DURATION_SECONDS: 15,         // Berapa lama simulasi ini berjalan (detik)
  POLLING_INTERVAL_MIN_MS: 100,      // Minimal jeda refresh
  POLLING_INTERVAL_MAX_MS: 250,      // Maksimal jeda refresh (diacak agar tidak tabrakan)
  SESSION_OFFSET_MS: 200,            // Jeda pembuka antar sesi sebelum mulai polling
  NUM_SESSIONS: 5,                   // Gunakan 3 sesi untuk melihat efek offset dan acak

  // 3. Autentikasi & Sistem
  CLASS_ID: process.env.REP_CLASS_ID || '4',
  PASSWORD: process.env.REP_PASSWORD || '104anakmrkalebyangkerenbngtwowamazinggantengnice',
  PANEL_URL: process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php',
  CHROMIUM_PATH: process.env.CHROMIUM_PATH || null
};
// ===================================================================

async function executeMockSession(browser, sessionId) {
  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // ----------------------------------------------------------------
    // FASE 1: LOGIN TEST
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
    console.log(`[Session ${sessionId}] ✅ Login berhasil!`);

    page.on('dialog', async dialog => {
      console.log(`[Session ${sessionId}] ⚠️ Muncul Dialog: "${dialog.message()}" -> Di-klik OK otomatis.`);
      await dialog.accept(); 
    });

    // ----------------------------------------------------------------
    // FASE 2: MOCK SNIPING (Langsung Eksekusi tanpa nunggu jam)
    // ----------------------------------------------------------------
    
    // OFFSET PEMBUKA: Membuat jeda agar sesi tidak refresh di waktu yang sama persis
    const initialOffset = (sessionId - 1) * CONFIG.SESSION_OFFSET_MS;
    console.log(`[Session ${sessionId}] ⏳ Menunggu offset pembuka selama ${initialOffset}ms...`);
    await new Promise(r => setTimeout(r, initialOffset));

    console.log(`[Session ${sessionId}] 🧪 MEMULAI MOCK TEST selama ${CONFIG.TEST_DURATION_SECONDS} detik...`);
    
    const endTime = Date.now() + (CONFIG.TEST_DURATION_SECONDS * 1000);

    while (Date.now() < endTime) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded' }); 
        
        // Ambil Data
        const auctionData = await page.evaluate(() => {
          const spans = Array.from(document.querySelectorAll('#content-auction p span'));
          const holderSpan = spans.find(span => span.style.color === 'rgb(226, 232, 240)' || span.style.color === '#e2e8f0');
          const input = document.querySelector('input[name="bid_amount"]');
          
          return {
            currentHolder: holderSpan ? holderSpan.innerText.trim() : 'Tidak ditemukan',
            minBid: input ? parseInt(input.min) : 0
          };
        });

        console.log(`[Session ${sessionId}] 📊 Info Live -> Pemegang: "${auctionData.currentHolder}" | Min Bid: ${auctionData.minBid} Pt`);

        const isOurClassWinning = auctionData.currentHolder.includes(CONFIG.TARGET_CLASS);

        if (!isOurClassWinning) {
          console.log(`[Session ${sessionId}] 🎯 [MOCK ACTION] Mengisi kolom bid dengan angka: ${auctionData.minBid}`);
          // Tetap isi input text untuk memastikan elemen bisa dimanipulasi
          await page.$eval('input[name="bid_amount"]', (el, val) => el.value = val, auctionData.minBid);
          
          // --- BAGIAN INI DIMATIKAN UNTUK TESTING ---
          // await page.click('button[name="place_bid"]'); 
          console.log(`[Session ${sessionId}] 🛑 [AMAN] Tombol "Place Bid" TIDAK ditekan.`);
          // ------------------------------------------

        } else {
          console.log(`[Session ${sessionId}] ℹ️ Kelas kita ("${CONFIG.TARGET_CLASS}") sedang memimpin. Standby.`);
        }

        // INTERVAL ACAK: Menghindari sesi sinkron di loop berikutnya
        const randomInterval = Math.floor(
          Math.random() * (CONFIG.POLLING_INTERVAL_MAX_MS - CONFIG.POLLING_INTERVAL_MIN_MS + 1)
        ) + CONFIG.POLLING_INTERVAL_MIN_MS;
        
        console.log(`[Session ${sessionId}] ⏱️ Menunggu jeda acak: ${randomInterval}ms`);
        await new Promise(r => setTimeout(r, randomInterval));

      } catch (err) {
        console.error(`[Session ${sessionId}] ⚠️ Error saat membaca DOM: ${err.message}`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`[Session ${sessionId}] 🏁 Waktu Mock Test habis.`);

  } catch (error) {
    console.error(`[Session ${sessionId}] ❌ Error Fatal: ${error.message}`);
  }
}

// ==================== ORCHESTRATOR ====================
async function runMockBot() {
  let browser;
  try {
    const launchOptions = {
      headless: "new", 
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--blink-settings=imagesEnabled=false' 
      ]
    };

    if (CONFIG.CHROMIUM_PATH) {
      launchOptions.executablePath = CONFIG.CHROMIUM_PATH;
    }

    browser = await puppeteer.launch(launchOptions);

    console.log(`🚀 MENJALANKAN MODE MOCK TEST / SIMULASI AMAN...`);

    const sessions = [];
    for (let i = 1; i <= CONFIG.NUM_SESSIONS; i++) {
      sessions.push(executeMockSession(browser, i));
      
      // Jeda 1.5 detik ini HANYA untuk proses login awal agar server tidak menolak 
      // request login yang bertubi-tubi. Polling lelang diatur oleh OFFSET di atas.
      await new Promise(r => setTimeout(r, 1500)); 
    }

    await Promise.all(sessions);
    console.log("🏁 Simulasi selesai dilakukan.");

  } catch (error) {
    console.error(`❌ Critical error: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log("ℹ️ Browser ditutup.");
    }
  }
}

// Jalankan bot simulasi
runMockBot();