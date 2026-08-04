const axios = require('axios');
const https = require('https');
const { Logger } = require('./logger');

const ALERT_ENABLED = process.env.ALERT_ENABLED === 'true';
const MAX_RETRIES = 3;

// Buat agent HTTPS yang memaksa koneksi menggunakan IPv4 (family: 4)
// untuk menghindari ENETUNREACH pada jaringan yang tidak mendukung IPv6
const httpsAgent = new https.Agent({ family: 4 });

function stripEmoji(text) {
  if (!text) return '';
  return String(text)
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

async function sendAlert(message) {
  if (!ALERT_ENABLED) {
    Logger.info('Alert dinonaktifkan', { reason: 'ALERT_ENABLED != true' });
    return;
  }

  const topic = process.env.NTFY_TOPIC;
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';

  if (!topic) {
    Logger.warning('ntfy.sh config missing', { server, msg: String(message).slice(0, 50) });
    return;
  }

  const cleanServer = server.replace(/\/+$/, '');
  const url = `${cleanServer}/${topic}`;

  const config = {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Title': 'Invest Bot',
      'Priority': 'high',
      'Tags': 'robot,chart_with_upwards_trend'
    },
    httpsAgent: httpsAgent,
    timeout: 10000
  };

  const authToken = process.env.NTFY_AUTH_TOKEN;
  if (authToken) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }

  const cleanMessage = stripEmoji(message);

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await axios.post(url, cleanMessage, config);
      Logger.success('Alert terkirim', { topic, server: cleanServer, attempt });
      return;
    } catch (error) {
      const rawData = error.response?.data;
      const errMsg = typeof rawData === 'object' ? JSON.stringify(rawData) : (rawData || error.message);
      lastError = errMsg;
      Logger.warning('Gagal kirim alert, mencoba lagi', { attempt, maxRetries: MAX_RETRIES, error: errMsg, topic, server: cleanServer });
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  Logger.error('Gagal kirim alert setelah retry', { error: lastError, topic, server: cleanServer });
}

module.exports = { sendAlert, stripEmoji };