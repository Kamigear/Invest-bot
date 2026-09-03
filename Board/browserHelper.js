'use strict';

const fs = require('fs');

/**
 * Mendeteksi path Chromium/Chrome yang tersedia secara otomatis di berbagai lingkungan:
 * 1. Jika ada env CHROMIUM_PATH yang valid -> pakai itu
 * 2. Cek kandidat path Linux standar (Orange Pi / Ubuntu runner)
 * 3. Jika tidak ada, kembalikan undefined agar Puppeteer memakai Chromium bawaannya
 */
function getChromiumPath() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }

  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // undefined = gunakan bundle Chromium yang diunduh Puppeteer otomatis
  return undefined;
}

module.exports = { getChromiumPath };
