const os = require('os');
const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
  DEBUG: 'DEBUG'
};

const SEVERITY = { DEBUG: 0, INFO: 1, SUCCESS: 1, WARNING: 2, ERROR: 3, CRITICAL: 4 };

const COLORS = {
  INFO: '\x1b[36m',
  SUCCESS: '\x1b[32m',
  WARNING: '\x1b[33m',
  ERROR: '\x1b[31m',
  CRITICAL: '\x1b[35m',
  DEBUG: '\x1b[90m',
  RESET: '\x1b[0m'
};

const LEVEL_ICONS = {
  INFO: '🔵',
  SUCCESS: '✅',
  WARNING: '⚠️',
  ERROR: '❌',
  CRITICAL: '💥',
  DEBUG: '🔧'
};

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toUpperCase();
const LOG_FORMAT = (process.env.LOG_FORMAT || 'console').toLowerCase();
const LOG_DIR = path.join(__dirname, 'logs');

let _logStream = null;
let _logDate = null;

function getLogStream() {
  const date = todayStr();
  if (_logStream && _logDate === date) return _logStream;
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    if (_logStream) { try { _logStream.end(); } catch (e) {} }
    _logStream = fs.createWriteStream(path.join(LOG_DIR, `${date}.log`), { flags: 'a' });
    _logDate = date;
  } catch (e) { /* ignore */ }
  return _logStream;
}

function todayStr() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function getTimestamp() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${todayStr()} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

function getHostname() {
  return os.hostname().split('-')[0];
}

function truncate(val, max) {
  if (typeof val !== 'string') return val;
  if (val.length <= max) return val;
  return val.slice(0, max) + '\u2026';
}

function formatMeta(meta = {}) {
  const entries = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';

  const parts = entries.map(([k, v]) => {
    if (v instanceof Error) {
      const msg = (v.message || String(v)).replace(/\n/g, ' ').slice(0, 200);
      return `${k}="${msg}"`;
    }
    if (typeof v === 'object') {
      const s = JSON.stringify(v);
      return `${k}=${truncate(s, 300)}`;
    }
    const str = String(v).replace(/\n/g, ' ');
    const preview = truncate(str, 200);
    return /[\s=\u2014]/.test(preview) ? `${k}="${preview}"` : `${k}=${preview}`;
  });

  return ' ' + parts.join(' \u2014 ');
}

function formatLine(level, message, meta = {}) {
  const icon = LEVEL_ICONS[level] || '';
  const color = COLORS[level] || '';
  const reset = COLORS.RESET;
  const ts = getTimestamp();
  const host = getHostname();

  if (LOG_FORMAT === 'json') {
    return JSON.stringify({ ts, level, host, message, ...meta });
  }

  return `${color}${icon} [${ts}] [${host}] ${message}${formatMeta(meta)}${reset}`;
}

function writeToFile(level, plainLine) {
  if (LOG_FORMAT === 'json') {
    const stream = getLogStream();
    if (stream) { try { stream.write(plainLine + '\n'); } catch (e) {} }
    return;
  }
  const strip = plainLine.replace(/\x1b\[[0-9;]*m/g, '');
  const stream = getLogStream();
  if (stream) { try { stream.write(strip + '\n'); } catch (e) {} }
}

function shouldLog(level) {
  return (SEVERITY[level] || 0) >= (SEVERITY[LOG_LEVEL] || 1);
}

function emit(level, message, meta = {}) {
  if (!shouldLog(level)) return;
  const line = formatLine(level, message, meta);
  const target = level === 'ERROR' || level === 'CRITICAL' ? 'error' : 'log';
  console[target](line);
  writeToFile(level, line);
}

const Logger = {
  info:    (msg, meta) => emit(LOG_LEVELS.INFO, msg, meta),
  success: (msg, meta) => emit(LOG_LEVELS.SUCCESS, msg, meta),
  warning: (msg, meta) => emit(LOG_LEVELS.WARNING, msg, meta),
  error:   (msg, meta) => emit(LOG_LEVELS.ERROR, msg, meta),
  critical:(msg, meta) => emit(LOG_LEVELS.CRITICAL, msg, meta),
  debug:   (msg, meta) => emit(LOG_LEVELS.DEBUG, msg, meta),

  banner(title, meta = {}) {
    if (!shouldLog('INFO')) return;
    const line = `\u2550\u2550\u2550\u2550 ${title} \u2550\u2550\u2550\u2550${formatMeta(meta)}`;
    const color = COLORS.INFO;
    const full = `${color}${line}${COLORS.RESET}`;
    console.log(full);
    writeToFile('INFO', LOG_FORMAT === 'json' ? JSON.stringify({ ts: getTimestamp(), level: 'INFO', host: getHostname(), message: title, ...meta }) : line);
  }
};

module.exports = { Logger, LOG_LEVELS };
