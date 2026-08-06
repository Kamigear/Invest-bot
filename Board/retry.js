const { Logger } = require('./logger');

const TRANSIENT_GRPC_CODES = [
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'RESOURCE_EXHAUSTED',
  'INTERNAL',
  'UNKNOWN',
  'ABORTED',
  'CANCELLED'
];

const TRANSIENT_NET_CODES = [
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'EADDRNOTAVAIL',
  'EPIPE'
];

function getErrorCode(error) {
  if (!error) return '';
  const raw = String(error.code || '');
  const stripped = raw.replace(/^grpc\//, '').toUpperCase();
  if (stripped) return stripped;
  const match = String(error.message || '').match(/grpc\/([A-Z_]+)/i);
  return match ? match[1].toUpperCase() : '';
}

function isTransientError(error) {
  if (!error) return false;
  const code = getErrorCode(error);
  if (TRANSIENT_GRPC_CODES.includes(code)) return true;
  if (TRANSIENT_NET_CODES.includes(code)) return true;
  if (error.syscall) return true;

  const msg = String(error.message || '');
  return /(ETIMEDOUT|ENOTFOUND|ENETUNREACH|ECONNRESET|ECONNREFUSED|UNAVAILABLE|DEADLINE_EXCEEDED|network|offline|fetch failed)/i.test(msg);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, options = {}) {
  const {
    label = 'operation',
    retries = 5,
    baseDelayMs = 2000
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt >= retries) break;

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      Logger.warning(`Retry ${label} (${attempt}/${retries})`, { delayMs: delay, error: error.message });
      await sleep(delay);
    }
  }
  throw lastError;
}

module.exports = { withRetry, isTransientError, getErrorCode };
