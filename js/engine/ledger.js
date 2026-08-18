'use strict';

/**
 * Ledger — Local transaction store for date-based visual adjustments.
 *
 * Per plan 1785720286196-date-based-transactions:
 * - Simulator always runs from config.initialBalance (unchanged by transactions)
 * - Transactions are visual adjustments on specific days only
 * - Future days continue from algorithm projection, unaffected
 */
const Ledger = (() => {
  const STORAGE_KEY = 'investcalc_ledger_v1';
  let _transactions = [];

  // ── Helpers ────────────────────────────────────────────────────────────────
  function todayISO() {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function nextId() {
    return 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  // Returns signed amount: positive = money in, negative = money out
  function signedAmount(tx) {
    const amt = parseFloat(tx.amount) || 0;
    switch (tx.type) {
      case 'income':
      case 'bonus':
      case 'maturity':
      case 'adjustment':
        return amt;
      case 'expense':
      case 'invest':
        return -amt;
      default:
        return amt;
    }
  }

  function typeLabel(type) {
    const labels = {
      income: '💰 Income',
      expense: '🛒 Expense',
      bonus: '🎁 Bonus',
      maturity: '💸 Cair',
      invest: '📈 Invest',
      adjustment: '🔧 Adjust',
    };
    return labels[type] || type;
  }

  // ── Persistence ─────────────────────────────────────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _transactions = JSON.parse(raw);
    } catch (e) { _transactions = []; }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_transactions));
    } catch (e) { /* storage full */ }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function add(tx) {
    const amt = parseFloat(tx.amount);
    if (!tx.date || isNaN(amt) || amt <= 0) return false;
    _transactions.push({
      id: nextId(),
      date: tx.date,
      type: tx.type || 'expense',
      amount: amt,
      note: tx.note || '',
    });
    save();
    return true;
  }

  function remove(id) {
    _transactions = _transactions.filter(t => t.id !== id);
    save();
  }

  // ── State Queries ─────────────────────────────────────────────────────────
  /**
   * Get ledger state as of today, based on config.initialBalance.
   * Net actual = sum of all signed amounts of all transactions.
   * currentBalance = initialBalance + netActual
   */
  function getState(config) {
    const today = todayISO();
    const initialBalance = config?.initialBalance ?? 0;
    const netActual = _transactions.reduce((s, tx) => s + signedAmount(tx), 0);
    return {
      today,
      transactions: _transactions,
      netActual: Math.round(netActual * 100) / 100,
      currentBalance: Math.round((initialBalance + netActual) * 100) / 100,
    };
  }

  /**
   * Get ledger state as of a specific date.
   * Only includes transactions on or before targetDate.
   */
  function getStateAsOfDate(config, targetDate) {
    const initialBalance = config?.initialBalance ?? 0;
    const filtered = _transactions.filter(tx => tx.date <= targetDate);
    const netActual = filtered.reduce((s, tx) => s + signedAmount(tx), 0);
    return {
      today: targetDate,
      transactions: filtered,
      netActual: Math.round(netActual * 100) / 100,
      currentBalance: Math.round((initialBalance + netActual) * 100) / 100,
    };
  }

  /**
   * Get visual adjustment for a specific ISO date.
   * Returns the net signed amount of transactions on that exact date only.
   * Used by Simulator/Calendar to visually adjust a day's balance display.
   */
  function getAdjustmentForDate(isoDate) {
    return _transactions
      .filter(tx => tx.date === isoDate)
      .reduce((s, tx) => s + signedAmount(tx), 0);
  }

  function removeAll() {
    _transactions = [];
    save();
  }

  load();

  return {
    todayISO,
    add,
    remove,
    removeAll,
    clearAll: removeAll,
    getState,
    getStateAsOfDate,
    getAdjustmentForDate,
    signedAmount,
    typeLabel,
    getAll: () => [..._transactions],
  };
})();
