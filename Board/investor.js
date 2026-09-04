const puppeteer = require('puppeteer');
const { Logger } = require('./logger');
const { isTransientError } = require('./retry');

/**
 * Automate investment form submission on rep_panel.php using Puppeteer
 * @param {object} entry - Schedule entry details { amount, expectedReturn, maturityDate }
 */
async function executeInvest(entry) {
  let browser;
  try {
    const classId = process.env.REP_CLASS_ID || '4';
    const password = process.env.REP_PASSWORD;
    if (!password) {
      throw new Error('REP_PASSWORD environment variable is required but not set.');
    }
    const panelUrl = process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php';
    const { getChromiumPath } = require('./browserHelper');
    const chromPath = getChromiumPath();

    Logger.info("Memulai proses investasi", { amount: entry.amount, expectedReturn: entry.maturityDate, plan: "30 days", chromPath: chromPath || 'bundled' });

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

    Logger.info("Membuka halaman login rep_panel.php", { url: panelUrl });

    await page.goto(panelUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    Logger.info("Mengisi data login", { classId });

    await page.waitForSelector('select[name="class_id"]', { visible: true, timeout: 15000 });
    await page.select('select[name="class_id"]', classId);
    await page.type('input[name="password"]', password);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
      page.click('button[name="login"]')
    ]);

    const loginFailed = await page.evaluate(() => {
      return document.body.innerText.includes('Invalid credential configuration profile');
    });

    if (loginFailed) {
      Logger.error("Login ditolak", { error: "Password salah atau class_id tidak cocok" });
      return { success: false, data: null, error: "Login Ditolak! Password salah atau class_id tidak cocok." };
    }

    Logger.success("Login sukses, mengisi form investasi", { amount: entry.amount });

    await page.waitForSelector('input[name="amount"]', { visible: true, timeout: 15000 });

    await page.$eval('input[name="amount"]', el => el.value = '');
    await page.type('input[name="amount"]', String(entry.amount));

    await page.select('select[name="plan"]', '30');

    Logger.info("Mengklik tombol Invest", { amount: entry.amount });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
      page.click('button.btn-green')
    ]);

    Logger.info("Form investasi dikirim, menunggu respons server", { amount: entry.amount });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const alertText = await page.evaluate(() => {
      const el = document.querySelector('.alert');
      return el ? el.innerText.trim() : null;
    });

    if (alertText) {
      Logger.info(`Respons server: "${alertText}"`, { serverResponse: alertText });
      const lowerAlert = alertText.toLowerCase();
      if (lowerAlert.includes('error') || lowerAlert.includes('fail') || lowerAlert.includes('gagal') || lowerAlert.includes('tidak cukup')) {
        Logger.error("Investasi gagal berdasarkan respons server", { serverResponse: alertText });
        return { success: false, data: null, error: `Pesan server: ${alertText}` };
      }
      Logger.success("Investasi berhasil berdasarkan respons server", { serverResponse: alertText });
      return { success: true, data: alertText, error: null };
    }

    Logger.success("Investasi berhasil disubmit (tidak ada pesan error dari server)", { amount: entry.amount });
    return { success: true, data: "Investasi berhasil disubmit (tidak ada pesan error dari server)", error: null };

  } catch (error) {
    if (isTransientError(error)) {
      Logger.warning("Jaringan gagal saat proses investasi (re-throw untuk retry)", { error: error.message });
      throw error;
    }

    Logger.critical("Critical error dalam proses investasi", { error: error.message, stack: error.stack });
    return { success: false, data: null, error: error.message };
  } finally {
    if (browser) {
      await browser.close();
      Logger.info("Browser ditutup", { component: "investor" });
    }
  }
}

module.exports = { executeInvest };
