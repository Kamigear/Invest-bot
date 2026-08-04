const os = require('os');

const LOG_LEVELS = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
  DEBUG: 'DEBUG'
};

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

function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('id-ID', { hour12: false });
}

function getHostname() {
  return os.hostname().split('-')[0];
}

function formatMeta(meta = {}) {
  const entries = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';

  const parts = entries.map(([k, v]) => {
    if (typeof v === 'string' && v.includes('\n')) {
      const preview = v.length > 60 ? v.slice(0, 60) + '…' : v;
      return `${k}="${preview.replace(/\n/g, ' ')}"`;
    }
    if (typeof v === 'object' && !(v instanceof Error)) {
      return `${k}=${JSON.stringify(v)}`;
    }
    return `${k}=${v}`;
  });

  return ' ' + parts.join(' — ');
}

function formatLine(level, message, meta = {}) {
  const icon = LEVEL_ICONS[level] || '';
  const color = COLORS[level] || '';
  const reset = COLORS.RESET;
  const ts = getTimestamp();
  const host = getHostname();

  return `${color}${icon} [${ts}] [${host}] ${message}${formatMeta(meta)}${reset}`;
}

const Logger = {
  info: (message, meta = {}) => {
    console.log(formatLine(LOG_LEVELS.INFO, message, meta));
  },

  success: (message, meta = {}) => {
    console.log(formatLine(LOG_LEVELS.SUCCESS, message, meta));
  },

  warning: (message, meta = {}) => {
    console.warn(formatLine(LOG_LEVELS.WARNING, message, meta));
  },

  error: (message, meta = {}) => {
    console.error(formatLine(LOG_LEVELS.ERROR, message, meta));
  },

  critical: (message, meta = {}) => {
    console.error(formatLine(LOG_LEVELS.CRITICAL, message, meta));
  },

  debug: (message, meta = {}) => {
    console.debug(formatLine(LOG_LEVELS.DEBUG, message, meta));
  }
};

module.exports = { Logger, LOG_LEVELS };
