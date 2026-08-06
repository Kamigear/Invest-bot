const puppeteer = require('puppeteer');
const { Logger } = require('./logger');
const { isTransientError } = require('./retry');

/**
 * Automate daily reward claim on the rep_panel.php dashboard
 * Daily reward is auto-claimed upon login, no separate button needed.
 * Transient network errors are re-thrown so withRetry() can catch them.
 */
async function claimDailyReward() {
  let browser;
  try {
    const classId = process.env.REP_CLASS_ID || '4';
    const password = process.env.REP_PASSWORD || '104anakmrkalebyangkerenbngtwowamazinggantengnice';
    const panelUrl = process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php';
    const chromPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

    Logger.info("Memulai proses klaim daily reward", { panelUrl });

    browser = await puppeteer.launch({
      headless: "new",
      executablePath: chromPath,
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

    Logger.info("Membuka halaman login", { url: panelUrl });

    await page.goto(panelUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    Logger.info("Mengisi data login", { classId });

    await page.waitForSelector('select[name="class_id"]', { visible: true, timeout: 15000 });
    await page.select('select[name="class_id"]', classId);
    await page.type('input[name="password"]', password);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('button[name="login"]')
    ]);

    await new Promise(resolve => setTimeout(resolve, 3000));

    const loginFailed = await page.evaluate(() => {
      return document.body.innerText.includes('Invalid credential configuration profile');
    });

    if (loginFailed) {
      Logger.error("Login ditolak", { error: "Password salah atau class_id tidak cocok" });
      return { success: false, data: null, error: 'Login Ditolak! Password salah atau class_id tidak cocok.' };
    }

    Logger.success("Login sukses - daily reward biasanya otomatis diklaim saat login", { classId });

    const responseText = await page.evaluate(() => {
      const el = document.querySelector('.alert, .notification, #message');
      return el ? el.innerText.trim() : null;
    });

    if (responseText) {
      Logger.info(`Respons server: "${responseText}"`, { serverResponse: responseText });
      const lowerText = responseText.toLowerCase();
      if (lowerText.includes('error') || lowerText.includes('fail') || lowerText.includes('gagal')) {
        Logger.error("Daily reward gagal berdasarkan respons server", { serverResponse: responseText });
        return { success: false, data: null, error: `Pesan server: ${responseText}`, alreadyClaimed: false };
      }
      Logger.success("Daily reward berhasil diklaim", { serverResponse: responseText });
      return { success: true, data: responseText, error: null, alreadyClaimed: false };
    }

    Logger.success("Daily reward selesai (tidak ada pesan error/peringatan)", { alreadyClaimed: true });
    return { success: true, data: 'Daily reward otomatis diklaim saat login', error: null, alreadyClaimed: false };

  } catch (error) {
    // Re-throw transient network errors so withRetry() can retry
    if (isTransientError(error)) {
      Logger.warning("Jaringan gagal saat klaim daily reward (re-throw untuk retry)", { error: error.message });
      throw error;
    }

    Logger.critical("Critical error dalam proses daily reward", { error: error.message, stack: error.stack });
    return { success: false, data: null, error: error.message, alreadyClaimed: false };
  } finally {
    if (browser) {
      await browser.close();
      Logger.info("Browser ditutup", { component: "dailyReward" });
    }
  }
}

module.exports = { claimDailyReward };
