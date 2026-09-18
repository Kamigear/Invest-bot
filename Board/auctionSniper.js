'use strict';

require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { getChromiumPath } = require('./browserHelper');

// ==========================================
// 1. LOAD CONFIGURATION
// ==========================================
const CONFIG_FILE = path.join(__dirname, 'auctionConfig.json');
let config = {
  repPanelUrl: process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php',
  classId: process.env.REP_CLASS_ID || '4',
  password: process.env.REP_PASSWORD || '104anakmrkalebyangkerenbngtwowamazinggantengnice',
  myClassName: process.env.PREFIX_NAME || 'Class Mr Kalebbbbb',
  workerCount: 3,
  startBiddingCountdownSeconds: 15,
  targetEndTime: '19:00:00',
  timezone: 'Asia/Jakarta',
  maxBidLimit: 1500,
  bidStrategy: 'PROXY_1_PERCENT', // 'PROXY_1_PERCENT' | 'ADD_POINTS' | 'MIN_LEGAL_BID'
  addPoints: 10,
  percentIncrement: 1.01,
  pollIntervalMs: 200,
  headless: true,
  dryRun: false
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    config = { ...config, ...fileConfig };
  } catch (err) {
    console.error('[CONFIG] Gagal membaca auctionConfig.json, menggunakan konfigurasi default:', err.message);
  }
}

// Command-line argument overrides
const args = process.argv.slice(2);
if (args.includes('--dry-run')) config.dryRun = true;
if (args.includes('--test')) config.isTestMode = true;
if (args.includes('--headless-false') || args.includes('--no-headless')) config.headless = false;

// ANSI Colors for console
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

function log(tag, msg, color = C.white) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour12: false, timeZone: 'Asia/Jakarta' });
  console.log(`${C.cyan}[${timeStr} WIB]${C.reset} ${color}[${tag}]${C.reset} ${msg}`);
}

// ==========================================
// 2. SHARED STATE ACROSS WORKERS
// ==========================================
const sharedState = {
  auctionId: null,
  itemName: null,
  highestBid: 0,
  holderClass: null,
  minBid: 0,
  currentScore: 0,
  isMyClassHolding: false,
  lastUpdatedBy: null,
  lastUpdateTime: 0,
  lastBidPlaced: 0,
  lastDispatchedBid: 0,
  lastBidTriggeredBy: null,
  lastBidTime: 0,
  auctionFinished: false,
  totalBidsSent: 0
};

// ==========================================
// 3. HELPER: TIME CALCULATION
// ==========================================
function getTargetTimeMillis() {
  const now = new Date();
  const timeZone = config.timezone || 'Asia/Jakarta';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;

  const [hh, mm, ss] = config.targetEndTime.split(':').map(Number);
  const targetIso = `${y}-${m}-${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+07:00`;
  return new Date(targetIso).getTime();
}

function getRemainingSeconds() {
  return (getTargetTimeMillis() - Date.now()) / 1000;
}

// ==========================================
// 4. CALCULATE SMART BID AMOUNT
// ==========================================
function calculateNextBid(currentHighest, minAllowed, currentScore) {
  // Batas minimal mutlak yang sah (1% Proxy perk, min input dari server, atau minimal +1)
  const minRequired1Pct = Math.ceil(currentHighest * (config.percentIncrement || 1.01));
  const absoluteMinLegal = Math.max(minAllowed || 0, minRequired1Pct, currentHighest + 1);

  let bid = 0;

  if (config.bidStrategy === 'AUTO' || !config.bidStrategy) {
    const step = parseInt(config.addPoints, 10) || 10;
    // ═══════════════════════════════════════════════════════════════
    // STRATEGI AUTO (Hybrid Smart Switch):
    // 1. Saat harga rendah: Gunakan loncatan +addPoints (+10 Pt) agar lawan kaget.
    // 2. Saat harga sudah tinggi (di mana 1% > addPoints, misal harga 2000 Pt):
    //    Otomatis switch ke +1% Proxy Bidder (2020 Pt) agar penawaran tidak ditolak server!
    // ═══════════════════════════════════════════════════════════════
    bid = Math.max(absoluteMinLegal, currentHighest + step);
  } else if (config.bidStrategy === 'PROXY_1_PERCENT') {
    bid = absoluteMinLegal;
  } else if (config.bidStrategy === 'ADD_POINTS') {
    const step = parseInt(config.addPoints, 10) || 1;
    bid = Math.max(absoluteMinLegal, currentHighest + step);
  } else if (config.bidStrategy === 'MIN_LEGAL_BID') {
    bid = absoluteMinLegal;
  } else {
    // Default fallback: AUTO
    bid = Math.max(absoluteMinLegal, currentHighest + (parseInt(config.addPoints, 10) || 10));
  }

  // ═══════════════════════════════════════════════════════════════
  // GUARD 1: BATASI BID KE maxBidLimit JIKA MELEBIHI — TAPI MASIH LEGAL
  // Contoh: addPoints=20, maxBidLimit=150, harga=140 → target=160,
  //         tapi 150 >= min legal, jadi bid dikap ke 150, bukan ditolak.
  // Hanya tolak total jika maxBidLimit sendiri di bawah absoluteMinLegal.
  // ═══════════════════════════════════════════════════════════════
  if (config.maxBidLimit && bid > config.maxBidLimit) {
    if (config.maxBidLimit >= absoluteMinLegal) {
      // Masih bisa bid sampai batas maksimal config — cap di sini
      bid = config.maxBidLimit;
    }
    // Jika maxBidLimit < absoluteMinLegal, biarkan bid > maxBidLimit
    // agar guard di runWorkerLoop memblokir dan mencatat log penolakan.
  }

  // ═══════════════════════════════════════════════════════════════
  // GUARD 2: BATASI BID AGAR TIDAK MELEBIHI POIN/SALDO SAAT ITU JUGA
  // ═══════════════════════════════════════════════════════════════
  if (currentScore && currentScore > 0) {
    if (bid > currentScore) {
      if (currentScore >= absoluteMinLegal) {
        // Jika saldo masih cukup untuk minimal legal bid, sesuaikan bid pas sebesar saldo
        bid = currentScore;
      }
      // Jika currentScore < absoluteMinLegal, biarkan bid > currentScore
      // agar guard di runWorkerLoop memblokir sepenuhnya dan mencatat penolakan bid.
    }
  }

  return bid;
}

// ==========================================
// 5. SCRAPE AUCTION STATE FROM DOM (Standby)
// ==========================================
async function scrapeAuction(page) {
  return await page.evaluate((myClassName) => {
    const auctionTab = document.querySelector('#content-auction');
    if (!auctionTab) {
      return { found: false, error: 'Tab #content-auction tidak ditemukan di DOM' };
    }

    const text = auctionTab.innerText || '';

    const itemEl = auctionTab.querySelector('h4');
    const itemName = itemEl ? itemEl.innerText.trim() : 'Unknown Item';

    const bidMatch = text.match(/Bid Tertinggi:\s*(\d+)\s*Pt/i) || text.match(/(\d+)\s*Pt/i);
    const highestBid = bidMatch ? parseInt(bidMatch[1], 10) : 0;

    const classMatch = text.match(/Milik kelas:\s*([^\n\r]+)/i);
    let holderClass = classMatch ? classMatch[1].trim() : 'Unknown';
    holderClass = holderClass.replace(/\s+/g, ' ');

    const form = auctionTab.querySelector('#bidForm') || auctionTab.querySelector('form');
    let auctionId = null;
    let minBid = highestBid + 1;
    let currentScore = 0;

    if (form) {
      const idInput = form.querySelector('input[name="auction_id"]');
      if (idInput) auctionId = idInput.value;

      const bidInput = form.querySelector('input[name="bid_amount"]');
      if (bidInput) {
        const parsedMin = parseInt(bidInput.getAttribute('min') || bidInput.value, 10);
        if (!isNaN(parsedMin)) minBid = parsedMin;
      }

      const onsubmitAttr = form.getAttribute('onsubmit') || '';
      const scoreMatch = onsubmitAttr.match(/confirmBid\s*\(\s*this\s*,\s*(\d+)\s*\)/);
      if (scoreMatch) currentScore = parseInt(scoreMatch[1], 10);
    }

    if (!currentScore) {
      const bodyText = document.body ? document.body.innerText : '';
      const ptMatch = bodyText.match(/Point\s*Tersedia\s*:\s*(\d+)/i);
      if (ptMatch) currentScore = parseInt(ptMatch[1], 10);
    }

    const cleanMy = myClassName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanHolder = holderClass.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isMyClassHolding = cleanHolder.includes(cleanMy) || cleanMy.includes(cleanHolder)
      || holderClass.toLowerCase().includes('kalebb');

    return { found: true, itemName, highestBid, holderClass, auctionId, minBid, currentScore, isMyClassHolding };
  }, config.myClassName);
}

// ==========================================
// 5b. FAST FETCH SCRAPE (Critical Window)
// Menghindari page.reload() yang lambat (1-3 detik)
// fetch() di dalam browser context hanya butuh ~50-250ms
// ==========================================
async function fastFetchScrape(page) {
  return await page.evaluate(async (panelUrl, myClassName) => {
    try {
      const resp = await fetch(panelUrl, { cache: 'no-store' });
      if (!resp.ok) return { found: false, error: `HTTP ${resp.status}` };
      const html = await resp.text();

      const itemMatch = html.match(/<h4[^>]*>([^<]+)<\/h4>/i);
      const itemName = itemMatch ? itemMatch[1].trim() : 'Unknown Item';

      const bidMatch = html.match(/Bid Tertinggi:\s*<[^>]*>\s*(\d+)\s*Pt/i)
        || html.match(/Bid Tertinggi:[^<]*(\d+)\s*Pt/i);
      const highestBid = bidMatch ? parseInt(bidMatch[1], 10) : 0;

      const classMatch = html.match(/Milik kelas:\s*<[^>]*>([^<]+)<\/span>/i)
        || html.match(/Milik kelas:\s*([^\n\r<]+)/i);
      const holderClass = classMatch ? classMatch[1].trim() : 'Unknown';

      const auctionIdMatch = html.match(/name=["']auction_id["'][^>]*value=["'](\d+)["']/i)
        || html.match(/value=["'](\d+)["'][^>]*name=["']auction_id["']/i);
      const auctionId = auctionIdMatch ? auctionIdMatch[1] : null;

      const minBidMatch = html.match(/name=["']bid_amount["'][^>]*min=["'](\d+)["']/i);
      const minBid = minBidMatch ? parseInt(minBidMatch[1], 10) : highestBid + 1;

      const scoreMatch = html.match(/confirmBid\s*\(\s*this\s*,\s*(\d+)\s*\)/);
      let currentScore = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
      if (!currentScore) {
        const ptMatch = html.match(/Point\s*Tersedia:\s*<[^>]*>\s*(\d+)\s*Point/i)
          || html.match(/Point\s*Tersedia:[^0-9]*(\d+)\s*Point/i);
        if (ptMatch) currentScore = parseInt(ptMatch[1], 10);
      }

      const cleanMy = myClassName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanHolder = holderClass.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isMyClassHolding = cleanHolder.includes(cleanMy) || cleanMy.includes(cleanHolder)
        || holderClass.toLowerCase().includes('kalebb');

      return { found: true, itemName, highestBid, holderClass, auctionId, minBid, currentScore, isMyClassHolding };
    } catch (e) {
      return { found: false, error: e.message };
    }
  }, config.repPanelUrl, config.myClassName);
}

// ==========================================
// 6. EXECUTE INSTANT BID INSIDE PAGE CONTEXT
// ==========================================
async function placeBid(page, workerId, bidAmount, auctionId) {
  if (config.dryRun) {
    log(`WORKER-${workerId}`, `[DRY-RUN] Simulasi bid: ${bidAmount} Pt (Auction ID: ${auctionId})`, C.magenta);
    sharedState.lastBidPlaced = bidAmount;
    sharedState.lastBidTime = Date.now();
    sharedState.totalBidsSent++;
    return true;
  }

  log(`WORKER-${workerId}`, `🚀 MENGIRIM BID ${C.bold}${bidAmount} Pt${C.reset}...`, C.bgGreen);

  try {
    const result = await page.evaluate(async (amount, aId, panelUrl) => {
      // ═══════════════════════════════════════════════════════
      // LIVE GUARD DOM: PERIKSA POIN AKTUAL SAAT INI SEBELUM KIRIM
      // ═══════════════════════════════════════════════════════
      let liveScore = 0;
      const form = document.querySelector('#bidForm') || document.querySelector('form');
      if (form) {
        const onsubmitAttr = form.getAttribute('onsubmit') || '';
        const scoreMatch = onsubmitAttr.match(/confirmBid\s*\(\s*this\s*,\s*(\d+)\s*\)/);
        if (scoreMatch) liveScore = parseInt(scoreMatch[1], 10);
      }
      if (!liveScore) {
        const bodyText = document.body ? document.body.innerText : '';
        const ptMatch = bodyText.match(/Point\s*Tersedia\s*:\s*(\d+)/i);
        if (ptMatch) liveScore = parseInt(ptMatch[1], 10);
      }

      if (liveScore > 0 && amount > liveScore) {
        return {
          success: false,
          blockedByGuard: true,
          liveScore: liveScore,
          reason: `Bid ${amount} Pt melebihi saldo saat ini (${liveScore} Pt)!`
        };
      }

      // Try fetch POST first (fastest, no page reload)
      try {
        const formData = new FormData();
        formData.set('place_bid', '1');
        formData.set('bid_amount', String(amount));
        if (aId) formData.set('auction_id', String(aId));

        const resp = await fetch(panelUrl, {
          method: 'POST',
          body: formData
        });
        return { success: resp.ok, status: resp.status };
      } catch (fetchErr) {
        // Fallback: inject into DOM form and submit
        if (!form) return { success: false, reason: 'Form tidak ditemukan' };

        const amountInput = form.querySelector('input[name="bid_amount"]');
        if (amountInput) amountInput.value = amount;
        const idInput = form.querySelector('input[name="auction_id"]');
        if (idInput && aId) idInput.value = aId;
        form.onsubmit = null;

        let submitBtn = form.querySelector('input[name="place_bid"]');
        if (!submitBtn) {
          submitBtn = document.createElement('input');
          submitBtn.type = 'hidden';
          submitBtn.name = 'place_bid';
          submitBtn.value = '1';
          form.appendChild(submitBtn);
        }
        form.submit();
        return { success: true, fallback: true };
      }
    }, bidAmount, auctionId, config.repPanelUrl);

    if (result && result.blockedByGuard) {
      if (result.liveScore > 0) sharedState.currentScore = result.liveScore;
      log(`WORKER-${workerId}`, `🛑 ${C.bgRed}[GUARD SALDO TERPICU]${C.reset} ${result.reason}. Pengiriman bid DIBATALKAN.`, C.red);
      return false;
    }

    sharedState.lastBidPlaced = bidAmount;
    sharedState.lastBidTime = Date.now();
    sharedState.totalBidsSent++;

    log(`WORKER-${workerId}`, `✅ Bid ${bidAmount} Pt dikirim! (HTTP ${result.status || 'fallback'})`, C.green);
    return true;
  } catch (err) {
    log(`WORKER-${workerId}`, `❌ Gagal bid: ${err.message}`, C.red);
    return false;
  }
}

// ==========================================
// 7. WORKER SESSION INITIALIZER & LOGIN
// ==========================================
async function initWorker(browser, workerId) {
  log(`WORKER-${workerId}`, `Menginisialisasi sesi & membuka halaman...`, C.blue);

  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  await page.goto(config.repPanelUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const needsLogin = await page.evaluate(() => !!document.querySelector('select[name="class_id"]'));
  if (needsLogin) {
    log(`WORKER-${workerId}`, `Login dengan Class ID: ${config.classId}...`, C.yellow);
    await page.select('select[name="class_id"]', String(config.classId));
    await page.type('input[name="password"]', config.password);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
      page.click('button[name="login"]')
    ]);
    await new Promise(r => setTimeout(r, 1000));
  }

  await page.evaluate(() => {
    if (typeof switchTab === 'function') {
      switchTab('auction');
    } else {
      const btn = document.querySelector('#btn-auction');
      if (btn) btn.click();
    }
  });

  // Baca state awal lelang & saldo poin
  const initialData = await scrapeAuction(page).catch(() => null);
  if (initialData && initialData.currentScore > 0 && (!sharedState.currentScore || sharedState.currentScore === 0)) {
    sharedState.currentScore = initialData.currentScore;
    log(`WORKER-${workerId}`, `Saldo Poin terdeteksi: ${C.bold}${sharedState.currentScore} Pt${C.reset}`, C.green);
  }

  log(`WORKER-${workerId}`, `Siap memantau lelang!`, C.green);
  return { context, page };
}

// ==========================================
// 8. WORKER RUNTIME LOOP (RADAR SWEEP INTERLEAVED)
// ==========================================
async function runWorkerLoop(page, workerId, staggerOffsetMs, totalWorkers) {
  // Stagger awal agar worker terdistribusi merata di timeline
  await new Promise(r => setTimeout(r, staggerOffsetMs));

  log(`WORKER-${workerId}`, `Memulai radar sweep loop (Offset: ${staggerOffsetMs}ms)...`, C.cyan);

  while (!sharedState.auctionFinished) {
    const remainingSec = getRemainingSeconds();

    if (remainingSec <= -5) {
      sharedState.auctionFinished = true;
      log(`WORKER-${workerId}`, `🏁 Waktu lelang berakhir. Menghentikan bot.`, C.yellow);
      break;
    }

    // Tentukan fase SEBELUM melakukan IO apapun
    const inCountdownWindow = remainingSec <= config.startBiddingCountdownSeconds && remainingSec > -2;

    try {
      let scraped = null;

      if (inCountdownWindow) {
        // CRITICAL WINDOW — Fast in-page fetch()
        scraped = await fastFetchScrape(page);
      } else {
        // STANDBY PHASE — reload biasa
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.evaluate(() => {
          const btn = document.querySelector('#btn-auction');
          if (btn && typeof switchTab === 'function' && !btn.classList.contains('active')) {
            switchTab('auction');
          }
        }).catch(() => {});
        scraped = await scrapeAuction(page);
      }

      // Update shared state jika scrape berhasil
      if (scraped && scraped.found) {
        sharedState.auctionId        = scraped.auctionId;
        sharedState.itemName         = scraped.itemName;
        sharedState.highestBid       = scraped.highestBid;
        sharedState.holderClass      = scraped.holderClass;
        sharedState.minBid           = scraped.minBid;
        if (scraped.currentScore !== undefined && scraped.currentScore !== null && scraped.currentScore > 0) {
          sharedState.currentScore   = scraped.currentScore;
        }
        sharedState.isMyClassHolding = scraped.isMyClassHolding;
        sharedState.lastUpdatedBy    = workerId;
        sharedState.lastUpdateTime   = Date.now();
      }

      // ── STATUS LOG ──
      const nowRemaining = getRemainingSeconds();
      const holderDisplay = sharedState.isMyClassHolding
        ? `${C.green}👑 KELAS KITA (${sharedState.holderClass})${C.reset}`
        : `${C.red}⚔ LAWAN (${sharedState.holderClass})${C.reset}`;
      const secDisplay = nowRemaining > 0
        ? `${nowRemaining.toFixed(1)}s tersisa`
        : `${Math.abs(nowRemaining).toFixed(1)}s LEWAT`;
      const statusTag = inCountdownWindow ? `${C.bgRed}[CRITICAL WINDOW]${C.reset}` : `[STANDBY]`;

      if (inCountdownWindow || Math.floor(nowRemaining) % 5 === 0) {
        const saldoDisplay = sharedState.currentScore > 0
          ? `${C.green}${sharedState.currentScore} Pt${C.reset}`
          : `${C.yellow}Memuat...${C.reset}`;
        log(`WORKER-${workerId}`,
          `${statusTag} Item: ${C.bold}${sharedState.itemName || 'Auction'}${C.reset} | ` +
          `Top Bid: ${C.bold}${sharedState.highestBid} Pt${C.reset} | ` +
          `Saldo: ${saldoDisplay} | ` +
          `Holder: ${holderDisplay} | Sisa: ${C.yellow}${secDisplay}${C.reset}`
        );
      }

      // ── FIRST RESPONDER BIDDING LOGIC ──
      if (inCountdownWindow) {
        if (sharedState.isMyClassHolding) {
          // Kelas kita memegang penawaran tertinggi — tidak perlu bid
        } else {
          const minRequired1Pct = Math.ceil(sharedState.highestBid * (config.percentIncrement || 1.01));
          const absoluteMinLegal = Math.max(sharedState.minBid || 0, minRequired1Pct, sharedState.highestBid + 1);

          // ═══════════════════════════════════════════════════════
          // GUARD 1: CEK APAKAH SALDO MENCUKUPI UNTUK MINIMUM BID
          // ═══════════════════════════════════════════════════════
          if (sharedState.currentScore > 0 && absoluteMinLegal > sharedState.currentScore) {
            log(`WORKER-${workerId}`,
              `🛑 ${C.bgRed}[GUARD SALDO: POIN TIDAK CUKUP]${C.reset} ` +
              `Min legal bid (${absoluteMinLegal} Pt) melebihi saldo saat ini (${sharedState.currentScore} Pt). Bot berhenti bid agar tidak berutang!`,
              C.red
            );
          } else {
            const targetBid = calculateNextBid(sharedState.highestBid, sharedState.minBid, sharedState.currentScore);

            // ═══════════════════════════════════════════════════════
            // GUARD 2: CEK APAKAH TARGET BID MELEBIHI SALDO SAAT ITU JUGA
            // ═══════════════════════════════════════════════════════
            if (sharedState.currentScore > 0 && targetBid > sharedState.currentScore) {
              log(`WORKER-${workerId}`,
                `🛑 ${C.bgRed}[GUARD SALDO: TARGET BID MELEBIHI SALDO]${C.reset} ` +
                `Target bid (${targetBid} Pt) melebihi saldo saat ini (${sharedState.currentScore} Pt). Bot berhenti bid!`,
                C.red
              );
            } else if (targetBid > config.maxBidLimit) {
              // Ini hanya terpicu jika maxBidLimit < absoluteMinLegal (tidak bisa dikap, harus ditolak)
              log(`WORKER-${workerId}`,
                `🛑 ${C.bgRed}MAX BID LIMIT DI BAWAH MINIMUM LEGAL!${C.reset} ` +
                `Harga minimal sah (${targetBid} Pt) sudah melebihi batas konfigurasi (${config.maxBidLimit} Pt). Bot berhenti bid!`,
                C.red
              );
            } else {
              // ═══════════════════════════════════════════════════════
              // FIRST RESPONDER ATOMIC TRIGGER:
              // Hanya worker PERTAMA yang mendeteksi perubahan harga ini
              // yang akan menembak bid. Worker lain yang mengecek setelahnya
              // melihat bid sudah di-dispatch dan tetap standby memantau
              // jika ada lawan yang menimpa lagi.
              // ═══════════════════════════════════════════════════════
              const isNewHigherBidNeeded = targetBid > sharedState.lastDispatchedBid || (Date.now() - sharedState.lastBidTime > 2500);

              if (isNewHigherBidNeeded) {
                // Klaim eksekusi secara instan
                sharedState.lastDispatchedBid = targetBid;
                sharedState.lastBidPlaced = targetBid;
                sharedState.lastBidTime = Date.now();
                sharedState.isMyClassHolding = true; // Kunci optimistik
                sharedState.lastBidTriggeredBy = workerId;

                log(`WORKER-${workerId}`,
                  `⚡ ${C.bgYellow}${C.bold}[FIRST RESPONDER]${C.reset} Terdeteksi lawan (${sharedState.holderClass}: ${sharedState.highestBid} Pt)! Mengambil giliran menimpa ke ${targetBid} Pt (Saldo: ${sharedState.currentScore} Pt)...`,
                  C.yellow
                );

                await placeBid(page, workerId, targetBid, sharedState.auctionId);
              }
            }
          }
        }
      }

    } catch (loopErr) {
      log(`WORKER-${workerId}`, `Peringatan: ${loopErr.message}`, C.yellow);
    }

    // ── ASYNCHRONOUS JITTERED POLLING INTERVAL ──
    // Setiap worker memiliki interval yang sedikit berbeda + random micro-jitter
    // agar siklus polling antar worker SELALU saling silang (interleaved)
    // dan tidak pernah menyatu dalam detik yang sama.
    let sleepTime;
    if (inCountdownWindow) {
      // Worker 1 ~70ms, Worker 2 ~100ms, Worker 3 ~130ms (+ 0-20ms jitter)
      const baseCritical = 70 + ((workerId - 1) * 30);
      const jitter = Math.floor(Math.random() * 20);
      sleepTime = baseCritical + jitter;
    } else {
      // Standby phase: base ~200ms + offset per worker
      const baseStandby = Math.max(150, config.pollIntervalMs);
      const workerOffset = (workerId - 1) * 40;
      const jitter = Math.floor(Math.random() * 30);
      sleepTime = baseStandby + workerOffset + jitter;
    }

    await new Promise(r => setTimeout(r, sleepTime));
  }
}

// ==========================================
// 9. MAIN RUNNER
// ==========================================
async function main() {
  console.clear();
  console.log(`${C.cyan}====================================================${C.reset}`);
  console.log(`${C.bold}${C.green}    AUCTION SNIPER BOT - MULTI-WORKER CONCURRENCY   ${C.reset}`);
  console.log(`${C.cyan}====================================================${C.reset}`);
  console.log(`Target Selesai   : ${C.yellow}${config.targetEndTime} WIB${C.reset}`);
  console.log(`Kelas Saya       : ${C.bold}${config.myClassName}${C.reset}`);
  console.log(`Jumlah Worker    : ${C.cyan}${config.workerCount} Browser Pages${C.reset}`);
  let stratDesc = `${config.bidStrategy}`;
  if (config.bidStrategy === 'AUTO') stratDesc = `AUTO (Loncatan +${config.addPoints} Pt saat harga rendah, Auto-switch ke +1% Proxy saat harga tinggi)`;
  else if (config.bidStrategy === 'PROXY_1_PERCENT') stratDesc = `PROXY_1_PERCENT (+1% Proxy Perk)`;
  else if (config.bidStrategy === 'ADD_POINTS') stratDesc = `ADD_POINTS (+${config.addPoints} Poin)`;

  console.log(`Strategi Bid     : ${C.bold}${stratDesc}${C.reset}`);
  console.log(`Max Bid Limit    : ${C.bold}${config.maxBidLimit} Pt${C.reset} (Safety Limit)`);
  console.log(`Mode Dry-Run     : ${config.dryRun ? C.red + 'AKTIF (Tidak melakukan bid sungguhan)' : C.green + 'NON-AKTIF (Live Bid)'}${C.reset}`);
  console.log(`${C.cyan}====================================================${C.reset}\n`);

  const chromPath = getChromiumPath();
  const browser = await puppeteer.launch({
    headless: config.headless ? 'new' : false,
    executablePath: chromPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer'
    ]
  });

  // TEST MODE
  if (config.isTestMode) {
    log('TEST', 'Menjalankan pemeriksaan lelang tunggal...', C.blue);
    const { page } = await initWorker(browser, 1);
    const data = await scrapeAuction(page);
    console.log('\n--- HASIL PEMERIKSAAN LELANG ---');
    console.log('Barang Lelang    :', data.itemName);
    console.log('Bid Tertinggi    :', data.highestBid, 'Pt');
    console.log('Milik Kelas      :', data.holderClass);
    console.log('Apakah Kelas Kita:', data.isMyClassHolding ? 'YA (👑 Memegang Bid Tertinggi)' : 'BUKAN (⚔ Dipegang Lawan)');
    console.log('Auction ID       :', data.auctionId);
    console.log('Min Bid Diizinkan:', data.minBid, 'Pt');
    console.log('Saldo Poin Saat Ini:', data.currentScore, 'Pt');
    console.log('Kalkulasi Bid    :', calculateNextBid(data.highestBid, data.minBid, data.currentScore), 'Pt');
    console.log('Sisa Waktu WIB   :', getRemainingSeconds().toFixed(1), 'detik');
    console.log('--------------------------------\n');
    await browser.close();
    process.exit(0);
  }

  // Multi-Worker Parallel Initialization
  const workerCount = Math.max(1, parseInt(config.workerCount, 10) || 3);
  log('CLUSTER', `Mempersiapkan ${workerCount} worker secara PARALEL BERSAMAAN...`, C.blue);

  const initPromises = Array.from({ length: workerCount }, (_, i) => {
    const workerId = i + 1;
    return initWorker(browser, workerId).catch(err => {
      log(`WORKER-${workerId}`, `Gagal inisialisasi: ${err.message}`, C.red);
      return null;
    });
  });

  const rawWorkers = await Promise.all(initPromises);
  const workers = rawWorkers.filter(Boolean);

  if (workers.length === 0) {
    log('CLUSTER', 'Tidak ada worker yang berhasil dimulai. Periksa koneksi dan password.', C.red);
    await browser.close();
    process.exit(1);
  }

  log('CLUSTER', `Semua ${workers.length} worker berhasil aktif bersamaan! Menunggu trigger hitung mundur lelang...`, C.green);

  // Launch parallel loops with staggered offsets (e.g. 0ms, 60ms, 120ms)
  const staggerStep = Math.floor(180 / workers.length);
  const workerPromises = workers.map((w, idx) => {
    const staggerOffset = idx * staggerStep;
    return runWorkerLoop(w.page, idx + 1, staggerOffset, workers.length);
  });

  await Promise.all(workerPromises);

  log('CLUSTER', `Lelang selesai. Total bid terkirim: ${sharedState.totalBidsSent}. Menutup browser...`, C.green);
  await browser.close();
}

// Global exit handlers
process.on('SIGINT', () => {
  console.log(`\n${C.yellow}[EXIT] Menghentikan bot lelang secara manual...${C.reset}`);
  process.exit(0);
});

main().catch(err => {
  console.error(`[FATAL ERROR]`, err);
  process.exit(1);
});
