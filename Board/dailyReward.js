const puppeteer = require('puppeteer');

/**
 * Automate daily reward claim on the rep_panel.php dashboard
 * Logs in and clicks the daily reward button
 */
async function claimDailyReward() {
  let browser;
  try {
    const classId = process.env.REP_CLASS_ID || '4';
    const password = process.env.REP_PASSWORD || '104anakmrkalebyangkerenbngtwowamazinggantengnice';
    const panelUrl = process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php';
    const chromPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

    console.log('[DAILY_REWARD] Memulai proses klaim daily reward...');

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

    console.log('[DAILY_REWARD] Membuka halaman login...');
    await page.goto(panelUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('[DAILY_REWARD] Mengisi data login...');
    await page.waitForSelector('select[name="class_id"]', { visible: true, timeout: 15000 });
    await page.select('select[name="class_id"]', classId);
    await page.type('input[name="password"]', password);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('button[name="login"]')
    ]);

    const loginFailed = await page.evaluate(() => {
      return document.body.innerText.includes('Invalid credential configuration profile');
    });

    if (loginFailed) {
      return { success: false, data: null, error: 'Login Ditolak! Password salah atau class_id tidak cocok.' };
    }
    console.log('[DAILY_REWARD] Login sukses! Mencari tombol klaim daily reward...');

    // Cari tombol daily reward - selector bisa disesuaikan
    // Beberapa kemungkinan:
    const rewardClaimed = await page.evaluate(() => {
      // Cek apakah tombol klaim ada / sudah diklaim
      const claimBtn = document.querySelector('.daily-reward-btn, .btn-claim-reward, [id*="daily"], [id*="reward"]');

      if (claimBtn) {
        const btnText = claimBtn.innerText.toLowerCase();
        const btnDisabled = claimBtn.disabled || claimBtn.classList.contains('disabled', 'claimed', 'done');

        if (btnDisabled || btnText.includes('claimed') || btnText.includes('diklaim') || btnText.includes('done')) {
          return { status: 'already_claimed', text: btnText };
        }
        return { status: 'available', element: claimBtn };
      }

      // Cari berdasarkan teks
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const text = btn.innerText.toLowerCase();
        if (text.includes('klaim') || text.includes('claim') || text.includes('daily')) {
          const disabled = btn.disabled || btn.classList.contains('disabled', 'claimed');
          if (disabled) {
            return { status: 'already_claimed', text: text };
          }
          return { status: 'available', element: btn };
        }
      }

      return { status: 'not_found' };
    });

    if (rewardClaimed.status === 'already_claimed') {
      console.log(`[DAILY_REWARD] Reward sudah diklaim: "${rewardClaimed.text}"`);
      return { success: true, data: 'Reward sudah diklaim hari ini', error: null, alreadyClaimed: true };
    }

    if (rewardClaimed.status === 'not_found') {
      console.log('[DAILY_REWARD] Tombol klaim daily reward tidak ditemukan.');
      return { success: true, data: 'Tombol klaim tidak ditemukan - mungkin sudah otomatis diklaim', error: null, alreadyClaimed: true };
    }

    if (rewardClaimed.status === 'available') {
      console.log('[DAILY_REWARD] Menekan tombol klaim daily reward...');

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
        rewardClaimed.element.click()
      ]);

      await new Promise(resolve => setTimeout(resolve, 3000));

      const responseText = await page.evaluate(() => {
        const el = document.querySelector('.alert, .notification, #message');
        return el ? el.innerText.trim() : null;
      });

      if (responseText) {
        console.log(`[DAILY_REWARD SERVER RESPONSE]: "${responseText}"`);
        const lowerText = responseText.toLowerCase();
        if (lowerText.includes('error') || lowerText.includes('fail') || lowerText.includes('gagal')) {
          return { success: false, data: null, error: `Pesan server: ${responseText}`, alreadyClaimed: false };
        }
        return { success: true, data: responseText, error: null, alreadyClaimed: false };
      }

      return { success: true, data: 'Daily reward berhasil diklaim', error: null, alreadyClaimed: false };
    }

  } catch (error) {
    console.error(`[DAILY_REWARD CRITICAL ERROR]: ${error.message}`);
    return { success: false, data: null, error: error.message, alreadyClaimed: false };
  } finally {
    if (browser) {
      await browser.close();
      console.log('[DAILY_REWARD] Browser ditutup.');
    }
  }
}

module.exports = { claimDailyReward };
