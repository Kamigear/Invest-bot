const puppeteer = require('puppeteer');

/**
 * Automate investment form submission on rep_panel.php using Puppeteer
 * @param {object} entry - Schedule entry details { amount, expectedReturn, maturityDate }
 */
async function executeInvest(entry) {
  let browser;
  try {
    const classId = process.env.REP_CLASS_ID || '4';
    const password = process.env.REP_PASSWORD || '104anakmrkalebyangkerenbngtwowamazinggantengnice';
    const panelUrl = process.env.REP_PANEL_URL || 'https://boardleaders.rf.gd/rep_panel.php';
    const chromPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

    console.log(`[INVESTOR] Memulai proses investasi ${entry.amount} poin...`);
    
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
    
    console.log("[INVESTOR] Membuka halaman login rep_panel.php...");
    await page.goto(panelUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log("[INVESTOR] Mengisi data login...");
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
      return { success: false, data: null, error: "Login Ditolak! Password salah atau class_id tidak cocok." };
    }
    console.log("[INVESTOR] Login Sukses! Mengisi form investasi...");

    // Wait for the investment form fields
    await page.waitForSelector('input[name="amount"]', { visible: true, timeout: 15000 });
    
    // Fill the investment amount
    await page.$eval('input[name="amount"]', el => el.value = '');
    await page.type('input[name="amount"]', String(entry.amount));
    
    // Select the investment plan (30 days)
    await page.select('select[name="plan"]', '30');
    
    // Submit the form
    console.log("[INVESTOR] Mengklik tombol Invest...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('button.btn-green')
    ]);

    console.log("[INVESTOR] Form investasi dikirim. Mengecek respon...");
    await new Promise(resolve => setTimeout(resolve, 3000)); // sleep 3s to let page process

    const alertText = await page.evaluate(() => {
      const el = document.querySelector('.alert');
      return el ? el.innerText.trim() : null;
    });

    if (alertText) {
      console.log(`[INVESTOR SERVER RESPONSE]: "${alertText}"`);
      // Check if it's an error message or success message
      const lowerAlert = alertText.toLowerCase();
      if (lowerAlert.includes('error') || lowerAlert.includes('fail') || lowerAlert.includes('gagal') || lowerAlert.includes('tidak cukup')) {
        return { success: false, data: null, error: `Pesan server: ${alertText}` };
      }
      return { success: true, data: alertText, error: null };
    }

    return { success: true, data: "Investasi berhasil disubmit (tidak ada pesan error dari server)", error: null };

  } catch (error) {
    console.error(`[INVESTOR CRITICAL ERROR]: ${error.message}`);
    return { success: false, data: null, error: error.message };
  } finally {
    if (browser) {
      await browser.close();
      console.log("[INVESTOR] Browser ditutup.");
    }
  }
}

module.exports = { executeInvest };
