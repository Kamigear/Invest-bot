const fs = require('fs');
const path = require('path');
const { Logger } = require('./logger');

const STATE_DIR = path.join(__dirname, 'state');
const PENDING_FILE = path.join(STATE_DIR, 'pending.json');

function ensureStateFile() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!fs.existsSync(PENDING_FILE)) fs.writeFileSync(PENDING_FILE, '{}', 'utf8');
}

function readPending() {
  try {
    ensureStateFile();
    return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
  } catch (e) {
    Logger.warning('Gagal membaca pending state', { error: e.message });
    return {};
  }
}

function writePending(pending) {
  try {
    ensureStateFile();
    fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2), 'utf8');
  } catch (e) {
    Logger.error('Gagal menulis pending state', { error: e.message });
  }
}

function recordFailure(entryId, reason, error) {
  const pending = readPending();
  const cur = pending[entryId] || {};
  const entry = {
    entryId,
    reason,
    error: error ? String(error).slice(0, 200) : undefined,
    attempts: (cur.attempts || 0) + 1,
    createdAt: cur.createdAt || new Date().toISOString(),
    lastAttemptAt: new Date().toISOString()
  };
  pending[entryId] = entry;
  writePending(pending);
  return entry;
}

function getPending(entryId) {
  return readPending()[entryId] || null;
}

function getAllPending() {
  return readPending();
}

function clearPending(entryId) {
  const pending = readPending();
  if (pending[entryId]) {
    delete pending[entryId];
    writePending(pending);
  }
}

module.exports = { recordFailure, getPending, getAllPending, clearPending };
