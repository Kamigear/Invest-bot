require('dotenv').config();
const cron = require('node-cron');
const puppeteer = require('puppeteer');
const { runDailyJob } = require('./executor');
const { sendAlert } = require('./alert');
const { db, serverTimestamp } = require('./firebase');
const { claimDailyReward } = require('./dailyReward');
const { runLeaderboardAnalytics } = require('./leaderboardAnalytics');
const { Logger } = require('./logger');
const Pending = require('./pending');
const { withRetry, isTransientError } = require('./retry');

const RETRY_INTERVAL_MS = (parseInt(process.env.RETRY_INTERVAL_MINUTES) || 15) * 60 * 1000;
const RETRY_MAX_ATTEMPTS = parseInt(process.env.RETRY_MAX_ATTEMPTS) || 8;
const DAILY_REWARD_MAX_ATTEMPTS = parseInt(process.env.DAILY_REWARD_MAX_ATTEMPTS) || 3;
const CATCHUP_MISSED_DAYS = parseInt(process.env.CATCHUP_MISSED_DAYS) || 0;
const retryTimers = new Map();
const DAILY_REWARD_KEY = 'DAILY_REWARD';

// ==========================================
// PENGATURAN & ENVS
// ==========================================
const PREFIX_NAME = process.env.PREFIX_NAME || "Class Mr Kalebbbbbbb";
const cronSchedule = process.env.BOT_CRON_SCHEDULE || '0 6 * * *';
const leaderboardAnalyticsCronSchedule = process.env.LEADERBOARD_ANALYTICS_CRON_SCHEDULE || '0 * * * *';

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

function processRawPerks(rawPerks) {
  const mappedPerks = {
    bankbook: 0,
    vault: 0,
    piggyBank: false,
    highYieldBond: 0,
    timeWeaver: 0,
    earlyBird: false,
    nightOwl: false,
    loginMultiplier: 0,
    auctionDiscount: 0,
    haggler: 0,
    gachaReset: false,
    tokenOfFortune: false,
    tokenOfLuck: false,
    proxyBidder: false,
    streakSaver: false,
    refundReceipt: 0
  };

  (rawPerks || []).forEach(p => {
    const name = p.trim();
    if (name.includes('Bronze Bankbook')) mappedPerks.bankbook = 1;
    else if (name.includes('Silver Bankbook')) mappedPerks.bankbook = 2;
    else if (name.includes('Gold Bankbook')) mappedPerks.bankbook = 3;

    else if (name.includes('Vault Tier I')) mappedPerks.vault = 1;
    else if (name.includes('Vault Tier II')) mappedPerks.vault = 2;

    else if (name.includes('Piggy Bank')) mappedPerks.piggyBank = true;

    else if (name.includes('High Yield Bond I')) mappedPerks.highYieldBond = 1;
    else if (name.includes('High Yield Bond II')) mappedPerks.highYieldBond = 2;
    else if (name.includes('High Yield Bond III')) mappedPerks.highYieldBond = 3;

    else if (name.includes('Time Weaver I')) mappedPerks.timeWeaver = 1;
    else if (name.includes('Time Weaver II')) mappedPerks.timeWeaver = 2;

    else if (name.includes('Early Bird')) mappedPerks.earlyBird = true;
    else if (name.includes('Night Owl')) mappedPerks.nightOwl = true;

    else if (name.includes('Login Multiplier I')) mappedPerks.loginMultiplier = 1;
    else if (name.includes('Login Multiplier II')) mappedPerks.loginMultiplier = 2;

    else if (name.includes('Auction Discount I')) mappedPerks.auctionDiscount = 1;
    else if (name.includes('Auction Discount II')) mappedPerks.auctionDiscount = 2;

    else if (name.includes('Hagglers License I')) mappedPerks.haggler = 1;
    else if (name.includes('Hagglers License II')) mappedPerks.haggler = 2;
    else if (name.includes('Hagglers License III')) mappedPerks.haggler = 3;

    else if (name.includes('Refund Receipt I')) mappedPerks.refundReceipt = 1;
    else if (name.includes('Refund Receipt II')) mappedPerks.refundReceipt = 2;

    else if (name.includes('Gacha Reset')) mappedPerks.gachaReset = true;
    else if (name.includes('Token of Fortune')) mappedPerks.tokenOfFortune = true;
    else if (name.includes('Token of Luck')) mappedPerks.tokenOfLuck = true;
    else if (name.includes('Proxy Bidder')) mappedPerks.proxyBidder = true;
    else if (name.includes('Streak Saver')) mappedPerks.streakSaver = true;
  });

  return mappedPerks;
}

// ==========================================
// TUGAS 1: CEK SALDO & KLAIM EASTER EGG
// ==========================================
async function runTask1() {
  await waitForTurn("TUGAS_1");
  isBrowserBusy = true;

  Logger.info("Memulai proses cek saldo, perks & klaim easter egg", { task: "TUGAS_1" });

  let browser;
  try {
    const classId = process.env.REP_CLASS_ID || '4';
    const password = process.env.REP_PASSWORD || '104anakmrkalebyangkerenbngtwowamazinggantengnice';
    const panelUrl = process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php';

    const setup = await openBrowser();
    browser = setup.browser;
    const page = setup.page;

    Logger.info("Membuka halaman login rep_panel.php", { task: "TUGAS_1", url: panelUrl });
    await page.goto(panelUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    const isLoginForm = await page.evaluate(() => !!document.querySelector('select[name="class_id"]'));
    if (isLoginForm) {
      Logger.info("Melakukan login ke rep_panel.php", { task: "TUGAS_1", classId });
      await page.select('select[name="class_id"]', classId);
      await page.type('input[name="password"]', password);

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click('button[name="login"]')
      ]);
    }

    Logger.info("Scraping data dari dashboard...", { task: "TUGAS_1" });
    const scraped = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';

      const balanceMatch = bodyText.match(/Point Tersedia:\s*(\d+)/i);
      const balance = balanceMatch ? parseInt(balanceMatch[1], 10) : null;

      const ticketMatch = bodyText.match(/Tiket Blind Box:\s*(\d+)/i);
      const tickets = ticketMatch ? parseInt(ticketMatch[1], 10) : 0;

      const activePerkEls = document.querySelectorAll('.perk-badge.perk-active');
      const rawPerks = Array.from(activePerkEls).map(el => {
        const span = el.querySelector('span:first-child');
        return span ? span.innerText.trim() : el.innerText.trim();
      });

      const investments = [];
      const cards = Array.from(document.querySelectorAll('.card'));
      const investCard = cards.find(c => {
        const h3 = c.querySelector('h3');
        return h3 && h3.innerText.includes('Active Investments');
      });

      if (investCard) {
        const items = Array.from(investCard.querySelectorAll('li')).length 
          ? Array.from(investCard.querySelectorAll('li'))
          : Array.from(investCard.querySelectorAll('div.investment-item, div.card-body > div, tr, p'));

        const seenKeys = new Set();
        items.forEach(el => {
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ');
          const amountMatch = text.match(/(?:Saldo yang dimasukan|Saldo yang di invest|Saldo yang di-invest|Investasi|Saldo):\s*(\d+)/i);
          const returnMatch = text.match(/Hasil:\s*(\d+)/i);
          const maturityMatch = text.match(/Selesai pada:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[^\r\n]*)/i) || text.match(/Selesai pada:\s*([^\n]+)/i);
          if (amountMatch && maturityMatch) {
            const amount = parseInt(amountMatch[1], 10);
            const returnAmount = returnMatch ? parseInt(returnMatch[1], 10) : 0;
            const maturityDate = maturityMatch[1].trim();
            const key = `${amount}_${returnAmount}_${maturityDate}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              investments.push({
                amount,
                returnAmount,
                maturityDate
              });
            }
          }
        });
      }

      // ── Scrape Transaction History untuk Daily Income Terakhir ──────────────
      let latestDailyIncome = 0;
      let historyStreak = 0;
      let historyText = '';

      const txItems = Array.from(document.querySelectorAll('.tx-item'));
      for (const tx of txItems) {
        const titleEl = tx.querySelector('strong');
        const amountEl = tx.querySelector('.tx-income');
        if (titleEl && amountEl) {
          const title = titleEl.innerText.trim();
          if (title.includes('Daily Login') || title.includes('Passive Income') || title.includes('Streak')) {
            const amtMatch = amountEl.innerText.match(/\+(\d+)/);
            if (amtMatch) {
              latestDailyIncome = parseInt(amtMatch[1], 10);
            }
            const sMatch = title.match(/Streak\s*\((\d+)\)/i);
            if (sMatch) {
              historyStreak = parseInt(sMatch[1], 10);
            }
            historyText = title;
            break; // Ambil entry transaksi daily income paling baru
          }
        }
      }

      // Fallback streak dari bodyText jika history tidak terbaca
      const streakMatch = bodyText.match(/Daily Login Streak\s*\(?(\d+)\)?/i) || 
                          bodyText.match(/Login Streak\s*[:\(]\s*(\d+)/i) || 
                          bodyText.match(/Streak\s*[:\(]\s*(\d+)/i);
      const fallbackStreak = streakMatch ? parseInt(streakMatch[1], 10) : 0;
      const finalStreak = historyStreak || fallbackStreak;

      // Base passive income fallback (10 + streak - 1)
      let calculatedBase = 0;
      if (finalStreak > 0) {
        calculatedBase = 10 + (finalStreak - 1);
      }
      const finalIncomeBase = latestDailyIncome > 0 ? latestDailyIncome : calculatedBase;

      return {
        balance,
        tickets,
        rawPerks,
        investments,
        loginStreak: finalStreak,
        latestDailyIncome,
        incomeBase: finalIncomeBase,
        historyText
      };
    });

    if (scraped.balance !== null) {
      Logger.success(`Saldo berhasil ditarik: ${scraped.balance} (Streak: ${scraped.loginStreak}, Income Terakhir: +${scraped.latestDailyIncome} Pt)`, { task: "TUGAS_1", balance: scraped.balance, streak: scraped.loginStreak, income: scraped.latestDailyIncome });

      const mappedPerks = processRawPerks(scraped.rawPerks);

      // Write full dashboard data to Firestore
      await db.collection('botState').doc('dashboardData').set({
        balance: scraped.balance,
        tickets: scraped.tickets,
        rawPerks: scraped.rawPerks,
        perks: mappedPerks,
        investments: scraped.investments,
        loginStreak: scraped.loginStreak,
        latestDailyIncome: scraped.latestDailyIncome,
        incomeBase: scraped.incomeBase,
        historyText: scraped.historyText,
        lastUpdated: serverTimestamp()
      });
      Logger.info("Dashboard data berhasil disimpan ke Firebase collection botState/dashboardData", { task: "TUGAS_1" });

      // Keep legacy balance doc updated for compatibility
      await db.collection('botState').doc('balance').set({
        balance: scraped.balance,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } else {
      Logger.warning("Gagal menemukan data saldo di panel dashboard", { task: "TUGAS_1" });
    }

    Logger.info("Navigasi ke halaman utama untuk easter egg", { task: "TUGAS_1", url: 'https://boardleaders.rf.gd/' });
    await page.goto('https://boardleaders.rf.gd/', { waitUntil: 'networkidle2', timeout: 60000 });

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
    return { status: 'SKIPPED', task: 'TUGAS_2' };
  }

  try {
    const result = await withRetry(
      () => claimDailyReward(),
      { label: 'daily-reward', retries: 3, baseDelayMs: 5000 }
    );

    if (result.success) {
      if (result.alreadyClaimed) {
        Logger.success("Daily reward sudah diklaim hari ini", { task: "TUGAS_2", alreadyClaimed: true });
      } else {
        Logger.success(`Daily reward berhasil diklaim: ${result.data}`, { task: "TUGAS_2", data: result.data });
      }
      Pending.clearPending('DAILY_REWARD');
      return { status: 'COMPLETED', task: 'TUGAS_2' };
    } else {
      Logger.error(`Gagal klaim daily reward: ${result.error}`, { task: "TUGAS_2", error: result.error });
      await sendAlert(`Daily reward gagal diklaim: ${result.error}`);
      return { status: 'FAILED', task: 'TUGAS_2' };
    }
  } catch (error) {
    const transient = isTransientError(error);
    Logger.critical(`Proses terhenti karena kesalahan: ${error.message}`, { task: "TUGAS_2", error: error.message, transient });

    if (transient) {
      const cur = Pending.recordFailure('DAILY_REWARD', 'network', error.message);
      await sendAlert(`Daily reward gagal (internet). Attempt #${cur.attempts}. Akan dicoba ulang.`);
      return { status: 'NETWORK_ERROR', task: 'TUGAS_2', transient, attempts: cur.attempts };
    }

    await sendAlert(`TUGAS 2 ERROR: ${error.message}`);
    return { status: 'ERROR', task: 'TUGAS_2', transient: false };
  } finally {
    isBrowserBusy = false;
    Logger.info("Selesai", { task: "TUGAS_2" });
  }
}

// ==========================================
// TUGAS 3: SNAPSHOT LEADERBOARD ANALYTICS
// ==========================================
async function runTask3() {
  await waitForTurn("TUGAS_3");
  isBrowserBusy = true;

  try {
    return await runLeaderboardAnalytics(openBrowser);
  } finally {
    isBrowserBusy = false;
  }
}

// ==========================================
// RETRY QUEUE — menangani gagal jaringan (internet mati)
// ==========================================

function getTodayId() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return 'inv_' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function scheduleRetry(entryId, attempts) {
  if (retryTimers.has(entryId)) return;

  if (attempts >= RETRY_MAX_ATTEMPTS) {
    Logger.warning('Retry maksimum tercapai, menandai SKIPPED (network)', { entryId, attempts });
    await markNetworkSkipped(entryId, attempts);
    return;
  }

  Logger.info('Menjadwalkan retry', { entryId, nextAttempt: attempts + 1, inMinutes: RETRY_INTERVAL_MS / 60000 });

  const timer = setTimeout(async () => {
    retryTimers.delete(entryId);
    try {
      const result = await runDailyJob();
      if (result && result.status === 'NETWORK_ERROR') {
        const cur = Pending.getPending(entryId);
        const newAttempts = (cur && cur.attempts) ? cur.attempts : attempts + 1;
        await scheduleRetry(entryId, newAttempts);
      } else if (result && result.status !== 'IN_PROGRESS') {
        Logger.success('Retry selesai', { entryId, status: result.status });
        Pending.clearPending(entryId);
      }
    } catch (e) {
      Logger.critical('Error saat retry', { entryId, error: e.message });
    }
  }, RETRY_INTERVAL_MS);

  timer.unref();
  retryTimers.set(entryId, timer);
}

async function markNetworkSkipped(entryId, attempts) {
  try {
    await db.doc(`executions/${entryId}`).set({
      status: 'SKIPPED',
      executedAt: serverTimestamp(),
      notes: JSON.stringify({ skipped: true, reason: 'network_unavailable', attempts })
    }, { merge: true });
    await db.doc(`schedules/${entryId}`).set({ status: 'SKIPPED' }, { merge: true });
    Logger.info('Status SKIPPED ditulis setelah retry habis', { entryId, attempts });
  } catch (e) {
    Logger.error('Gagal menulis status SKIPPED (internet masih mati), disimpan di pending', { entryId, error: e.message });
  }
  await sendAlert(`Invest ${entryId} terlewat (network_unavailable, ${attempts} percobaan gagal). Status: SKIPPED`);
  Pending.clearPending(entryId);
}

async function scheduleDailyRewardRetry(attempts) {
  if (retryTimers.has(DAILY_REWARD_KEY)) return;

  if (attempts >= DAILY_REWARD_MAX_ATTEMPTS) {
    Logger.warning('Daily reward: retry maksimum tercapai', { attempts });
    Pending.clearPending(DAILY_REWARD_KEY);
    return;
  }

  Logger.info('Menjadwalkan retry daily reward', { nextAttempt: attempts + 1, inMinutes: RETRY_INTERVAL_MS / 60000 });

  const timer = setTimeout(async () => {
    retryTimers.delete(DAILY_REWARD_KEY);
    try {
      const result = await runTask2();
      if (result && result.status === 'NETWORK_ERROR' && result.attempts) {
        await scheduleDailyRewardRetry(result.attempts);
      }
    } catch (e) {
      Logger.critical('Error saat retry daily reward', { error: e.message });
    }
  }, RETRY_INTERVAL_MS);

  timer.unref();
  retryTimers.set(DAILY_REWARD_KEY, timer);
}

function resumePendingRetries() {
  const today = getTodayId();
  const pending = Pending.getAllPending();

  for (const [entryId, p] of Object.entries(pending)) {
    const attempts = p.attempts || 0;

    if (entryId === DAILY_REWARD_KEY) {
      Logger.warning('Meresume pending daily reward', { attempts });
      scheduleDailyRewardRetry(attempts);
      continue;
    }

    const day = entryId.replace('inv_', '');
    if (day !== today) {
      Logger.warning('Menghapus pending dari hari lama', { entryId });
      Pending.clearPending(entryId);
      continue;
    }

    if (attempts >= RETRY_MAX_ATTEMPTS) {
      Logger.warning('Mencoba markNetworkSkipped untuk pending lama', { entryId, attempts });
      markNetworkSkipped(entryId, attempts);
      continue;
    }

    const lastAt = p.lastAttemptAt ? new Date(p.lastAttemptAt).getTime() : 0;
    const due = Date.now() - lastAt >= RETRY_INTERVAL_MS;

    Logger.warning('Meresume pending retry', { entryId, attempts, immediate: due });

    if (due) {
      (async () => {
        try {
          const result = await runDailyJob();
          if (result && result.status === 'NETWORK_ERROR') {
            const cur = Pending.getPending(entryId);
            await scheduleRetry(entryId, (cur && cur.attempts) || attempts + 1);
          } else {
            Logger.success('Resume selesai', { entryId, status: result ? result.status : 'unknown' });
          }
        } catch (e) { /* already logged inside runDailyJob */ }
      })();
    } else {
      scheduleRetry(entryId, attempts);
    }
  }
}

async function scanMissedDays() {
  if (CATCHUP_MISSED_DAYS <= 0) return;

  for (let i = 1; i <= CATCHUP_MISSED_DAYS; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const p = n => String(n).padStart(2, '0');
    const day = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    const entryId = 'inv_' + day;

    try {
      const sched = await db.doc(`schedules/${entryId}`).get();
      if (!sched.exists) continue;
      const exec = await db.doc(`executions/${entryId}`).get();
      if (exec.exists && ['DONE', 'SKIPPED', 'FAILED', 'EXECUTING'].includes(exec.data().status)) continue;

      Logger.warning('Catchup: menemukan hari yang terlewat', { entryId });
      await runDailyJob(day);
    } catch (e) {
      Logger.error('Catchup gagal', { entryId, error: e.message });
    }
  }
}

// ==========================================
// SISTEM PENJADWALAN & START PROGRAM
// ==========================================
function start() {
  Logger.info('Sistem bot otomatisasi aktif', { cronSchedule, leaderboardAnalyticsCronSchedule });
  sendAlert(`Bot berhasil dinyalakan!\nJadwal eksekusi: ${cronSchedule}\nLeaderboard analytics: ${leaderboardAnalyticsCronSchedule}\nMengeksekusi run pertama saat boot...`);

  resumePendingRetries();

  Logger.info('Mengeksekusi rutinitas awal saat booting', { phase: 'boot' });

  (async () => {
    try {
      await scanMissedDays();
      Logger.banner('BOOT RUN dimulai');
      const t1 = await runTask1();
      const t2 = await runTask2();
      const result = await runDailyJob();
      const t3 = await runTask3();

      if (t2 && t2.status === 'NETWORK_ERROR' && t2.attempts) {
        await scheduleDailyRewardRetry(t2.attempts);
      }

      if (result && result.status === 'NETWORK_ERROR' && result.attempts) {
        await scheduleRetry(result.entryId, result.attempts);
      }

      recordLocalTaskRun({
        phase: 'boot',
        task1: t1 || 'COMPLETED',
        task2: t2?.status || 'UNKNOWN',
        dailyJob: result?.status || 'UNKNOWN',
        task3: t3?.status || 'UNKNOWN'
      });

      Logger.banner('BOOT RUN selesai');
    } catch (error) {
      Logger.critical('Terjadi kesalahan saat rutinitas awal', { phase: 'boot', error: error.message });
    }
  })();

  cron.schedule(cronSchedule, async () => {
    Logger.banner('RUTINITAS HARIAN DIMULAI', { triggeredAt: new Date().toISOString() });
    const t1 = await runTask1();
    const t2 = await runTask2();
    const result = await runDailyJob();
    const t3 = await runTask3();

    if (t2 && t2.status === 'NETWORK_ERROR' && t2.attempts) {
      await scheduleDailyRewardRetry(t2.attempts);
    }

    if (result && result.status === 'NETWORK_ERROR' && result.attempts) {
      await scheduleRetry(result.entryId, result.attempts);
    }

    recordLocalTaskRun({
      phase: 'cron',
      task1: t1 || 'COMPLETED',
      task2: t2?.status || 'UNKNOWN',
      dailyJob: result?.status || 'UNKNOWN',
      task3: t3?.status || 'UNKNOWN'
    });

    Logger.banner('RUTINITAS HARIAN SELESAI');
  });

  cron.schedule(leaderboardAnalyticsCronSchedule, async () => {
    Logger.banner('LEADERBOARD ANALYTICS DIMULAI', { triggeredAt: new Date().toISOString() });
    const t3 = await runTask3();
    recordLocalTaskRun({ phase: 'cron_analytics', task3: t3?.status || 'UNKNOWN' });
    Logger.banner('LEADERBOARD ANALYTICS SELESAI');
  });
}

const fs = require('fs');
const path = require('path');

function recordLocalTaskRun(summary) {
  try {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFile = path.join(logsDir, 'task_history.json');
    let history = [];
    if (fs.existsSync(logFile)) {
      try { history = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch (_) {}
    }
    history.push({
      timestamp: new Date().toISOString(),
      ...summary
    });
    if (history.length > 500) history = history.slice(-500);
    fs.writeFileSync(logFile, JSON.stringify(history, null, 2), 'utf8');
    Logger.info(`Log rutinitas task dicatat secara lokal di ${logFile}`);
  } catch (err) {
    Logger.error(`Gagal mencatat log task lokal: ${err.message}`);
  }
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

module.exports = { start, runTask1, runTask2, runTask3 };
