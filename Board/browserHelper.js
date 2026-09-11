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
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // undefined = gunakan bundle Chromium yang diunduh Puppeteer otomatis
  return undefined;
}

module.exports = { getChromiumPath };
