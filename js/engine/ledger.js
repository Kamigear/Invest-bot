'use strict';

/**
 * Ledger - stores actual daily cash movements and turns them into current state.
 */
const Ledger = (() => {
  const STORAGE_KEY = 'investcalc_ledger_v1';

  function todayISO() {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function save(transactions) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }

  function add(input) {
    const amount = Math.abs(parseFloat(input.amount) || 0);
    if (amount <= 0) return null;

    const tx = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date: input.date || todayISO(),
      type: input.type || 'expense',
      amount,
      note: (input.note || '').trim(),
      createdAt: new Date().toISOString(),
    };

    const transactions = load();
    transactions.push(tx);
    transactions.sort((a, b) => `${a.date}-${a.createdAt}`.localeCompare(`${b.date}-${b.createdAt}`));
    save(transactions);
    return tx;
  }

  function remove(id) {
    save(load().filter(tx => tx.id !== id));
  }

  function signedAmount(tx) {
    switch (tx.type) {
      case 'income':
      case 'bonus':
      case 'maturity':
      case 'adjustment':
        return tx.amount;
      case 'expense':
      case 'invest':
        return -tx.amount;
      default:
        return 0;
    }
  }

  function getState(config) {
    const transactions = load();
    const initialBalance = parseFloat(config.initialBalance) || 0;
    const netActual = Calculator.fmt(transactions.reduce((sum, tx) => sum + signedAmount(tx), 0));
    const currentBalance = Math.max(0, Calculator.fmt(initialBalance + netActual));
    const incomeActual = Calculator.fmt(transactions
      .filter(tx => ['income', 'bonus', 'maturity', 'adjustment'].includes(tx.type))
      .reduce((sum, tx) => sum + tx.amount, 0));
    const outflowActual = Calculator.fmt(transactions
      .filter(tx => ['expense', 'invest'].includes(tx.type))
      .reduce((sum, tx) => sum + tx.amount, 0));

    return {
      transactions,
      initialBalance,
      netActual,
      currentBalance,
      incomeActual,
      outflowActual,
      today: todayISO(),
    };
  }

  function typeLabel(type) {
    const labels = {
      income: 'Income',
      expense: 'Expense',
      bonus: 'Bonus',
      invest: 'Invest',
      maturity: 'Cair',
      adjustment: 'Adjust',
    };
    return labels[type] || type;
  }

  return { todayISO, load, save, add, remove, getState, signedAmount, typeLabel };
})();
