'use strict';

/**
 * Calendar UI — Renders and manages the interactive simulation calendar table.
 */
const CalendarUI = (() => {
  let _records = [];
  let _filteredRecords = [];
  let _activeFilter = 'all';
  let _sortKey = 'day';
  let _sortDir = 'asc';
  let _onRowClick = null;

  function todayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const FILTERS = [
    { key: 'all', label: 'Semua Hari', icon: '📅' },
    { key: 'invest', label: 'Hari Investasi', icon: '🟢' },
    { key: 'maturity', label: 'Investasi Cair', icon: '🟡' },
    { key: 'bonus', label: 'Weekly Bonus', icon: '🔵' },
    { key: 'generate', label: 'Generate', icon: '🟣' },
    { key: 'delay', label: 'Sengaja Menunggu', icon: '🔴' },
  ];

  /**
   * Initialize the calendar with records data
   */
  function init(records, onRowClick) {
    _records = records;
    _filteredRecords = [...records];
    _onRowClick = onRowClick;
    _activeFilter = 'all';
    _sortKey = 'day';
    _sortDir = 'asc';
  }

  /**
   * Apply filter to records
   */
  function applyFilter(filterKey) {
    _activeFilter = filterKey;
    switch (filterKey) {
      case 'invest':
        _filteredRecords = _records.filter(r => r.flags.isInvestDay || r.flags.hasLedgerInvestment);
        break;
      case 'maturity':
        _filteredRecords = _records.filter(r => r.flags.isMaturityDay);
        break;
      case 'bonus':
        _filteredRecords = _records.filter(r => r.flags.isWeeklyBonusDay);
        break;
      case 'generate':
        _filteredRecords = _records.filter(r => r.flags.isGenerateDay);
        break;
      case 'delay':
        _filteredRecords = _records.filter(r => r.flags.isDelayDay);
        break;
      default:
        _filteredRecords = [..._records];
    }
    applySort(_sortKey, _sortDir);
  }

  /**
   * Apply sort to filtered records
   */
  function applySort(key, dir) {
    _sortKey = key;
    _sortDir = dir;
    _filteredRecords.sort((a, b) => {
      const av = a[key] ?? 0;
      const bv = b[key] ?? 0;
      if (typeof av === 'number') {
        return dir === 'asc' ? av - bv : bv - av;
      }
      return dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }

  /**
   * Get row CSS classes based on flags (can be multiple)
   */
  function getRowClasses(record) {
    const classes = ['cal-row'];
    const f = record.flags;
    if (f.isInvestDay || f.hasLedgerInvestment) classes.push('row-invest');
    if (f.isMaturityDay) classes.push('row-maturity');
    if (f.isWeeklyBonusDay) classes.push('row-bonus');
    if (f.isGenerateDay && !f.isInvestDay && !f.isWeeklyBonusDay) classes.push('row-generate');
    if (f.isDelayDay) classes.push('row-delay');
    if (record.date && record.date < todayISO()) classes.push('row-past');
    if (record.date && record.date === todayISO()) classes.push('row-today');
    return classes.join(' ');
  }

  /**
   * Build badges for a row
   */
  function buildBadges(record) {
    const badges = [];
    const f = record.flags;
    if (f.isInvestDay) badges.push('<span class="badge badge-invest">🟢 Invest</span>');
    if (f.hasLedgerInvestment) badges.push('<span class="badge badge-ledger-invest">📘 Ledger</span>');
    if (f.isMaturityDay) badges.push('<span class="badge badge-maturity">🟡 Cair</span>');
    if (f.isWeeklyBonusDay) badges.push('<span class="badge badge-bonus">🔵 Bonus</span>');
    if (f.isGenerateDay) badges.push('<span class="badge badge-generate">🟣 Gen</span>');
    if (f.isDelayDay) badges.push('<span class="badge badge-delay">🔴 Wait</span>');
    if (f.isSweetSpot) badges.push('<span class="badge badge-sweet">🎯</span>');
    if (f.hasLedgerEntry) {
      badges.push('<span class="badge" style="background:rgba(16,185,129,0.15); color:var(--accent-green); border:1px solid rgba(16,185,129,0.3); font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600; display:inline-flex; align-items:center; gap:2px;">🔧 Ledger</span>');
    }
    if (badges.length === 0) badges.push('<span class="badge badge-neutral">⏸ Skip</span>');
    return badges.join('');
  }

  /**
   * Render the filter toolbar HTML
   */
  function renderFilterBar() {
    return `
      <div class="filter-bar" id="filter-bar">
        ${FILTERS.map(f => `
          <button 
            class="filter-btn ${_activeFilter === f.key ? 'active' : ''}" 
            data-filter="${f.key}"
            title="${f.label}"
          >
            <span class="filter-icon">${f.icon}</span>
            <span class="filter-label">${f.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render the search + export toolbar
   */
  function renderToolbar() {
    return `
      <div class="cal-toolbar">
        <div class="cal-toolbar-left">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input 
              type="number" 
              id="search-day" 
              placeholder="Lompat ke hari..." 
              min="1"
            />
          </div>
          <span id="cal-count" class="cal-count"></span>
        </div>
        <div class="cal-toolbar-right">
          <button class="export-btn" id="btn-export-csv" title="Export CSV">
            <span>📄</span> CSV
          </button>
          <button class="export-btn" id="btn-export-excel" title="Export Excel">
            <span>📊</span> Excel
          </button>
          <button class="export-btn" id="btn-export-pdf" title="Export PDF">
            <span>📑</span> PDF
          </button>
        </div>
      </div>
    `;
  }

  function renderLedgerTransactionsInCell(record) {
    if (!record.ledgerTxns || record.ledgerTxns.length === 0) return '';
    return record.ledgerTxns.map(tx => {
      const amt = parseFloat(tx.amount) || 0;
      const isNegative = ['expense', 'invest'].includes(tx.type);
      const sign = isNegative ? '−' : '+';
      const color = isNegative ? 'var(--accent-red)' : 'var(--accent-green)';
      const typeLabel = {
        income: 'Income',
        expense: 'Expense',
        bonus: 'Bonus',
        maturity: 'Cair',
        invest: 'Invest',
        adjustment: 'Adjust'
      }[tx.type] || tx.type;
      return `<br/><small style="color:${color}; font-size:10px; font-weight:600; display:block; margin-top:2px;">${sign}${Calculator.display(amt)} ${typeLabel}</small>`;
    }).join('');
  }

  /**
   * Render a single table row
   */
  function renderRow(record) {
    const f = record.flags;
    return `
      <tr 
        class="${getRowClasses(record)}" 
        data-day="${record.day}"
        tabindex="0"
        title="Klik untuk detail Hari ${record.day}"
      >
        <td class="col-day">
          <span class="day-num">${record.day}</span>${record.date ? `<span class="day-date">${record.date}</span>` : ''}
        </td>
        <td class="col-num">${Calculator.display(record.balanceBefore)}</td>
        <td class="col-num income-col">
          +${Calculator.display(record.dailyIncome)}
          ${renderLedgerTransactionsInCell(record)}
        </td>
        <td class="col-num ${f.isWeeklyBonusDay ? 'bonus-highlight' : ''}">
          ${f.isWeeklyBonusDay ? `<strong>+${Calculator.display(record.weeklyBonus)}</strong>` : '—'}
        </td>
        <td class="col-num ${f.isGenerateDay ? 'generate-highlight' : ''}">
          ${record.generate > 0 ? `+${Calculator.display(record.generate)}` : '—'}
        </td>
        <td class="col-num ${f.isInvestDay || f.hasLedgerInvestment ? 'invest-highlight' : ''}">
          ${record.investedAmount > 0 ? `<strong>${Calculator.display(record.investedAmount)}</strong>` : ''}
          ${record.ledgerInvestTotal > 0 ? `<br/><small style="color:var(--accent-teal)">+${Calculator.display(record.ledgerInvestTotal)}</small>` : ''}
        </td>
        <td class="col-num ${f.isMaturityDay ? 'maturity-highlight' : ''}">
          ${f.isMaturityDay ? `<strong>+${Calculator.display(record.maturedTotal)}</strong>` : '—'}
        </td>
        <td class="col-center">
          <span class="active-count ${record.activeCount > 0 ? 'has-active' : ''}">${record.activeCount}</span>
        </td>
        <td class="col-num balance-after">${Calculator.display(record.balanceAfter)}</td>
        <td class="col-num total-assets">${Calculator.display(record.totalAssets)}</td>
        <td class="col-badges">${buildBadges(record)}</td>
      </tr>
    `;
  }

  /**
   * Render the full table
   */
  function renderTable() {
    const cols = [
      { key: 'day', label: 'Hari' },
      { key: 'balanceBefore', label: 'Saldo Sebelum' },
      { key: 'dailyIncome', label: 'Income' },
      { key: 'weeklyBonus', label: 'Bonus' },
      { key: 'generate', label: 'Generate' },
      { key: 'investedAmount', label: 'Invest' },
      { key: 'maturedTotal', label: 'Cair' },
      { key: 'activeCount', label: 'Aktif' },
      { key: 'balanceAfter', label: 'Saldo Sesudah' },
      { key: 'totalAssets', label: 'Total Aset' },
      { key: null, label: 'Status' },
    ];

    const headerCells = cols.map(col => {
      if (!col.key) return `<th class="col-badges">Status</th>`;
      const isActive = _sortKey === col.key;
      const icon = isActive ? (_sortDir === 'asc' ? '↑' : '↓') : '⇅';
      return `
        <th 
          class="sortable ${isActive ? 'sort-active' : ''}" 
          data-sort="${col.key}"
          title="Urutkan berdasarkan ${col.label}"
        >
          ${col.label} <span class="sort-icon">${icon}</span>
        </th>
      `;
    });

    const rows = _filteredRecords.map(r => renderRow(r)).join('');

    return `
      <div class="table-wrapper" id="table-wrapper">
        <table class="cal-table" id="cal-table">
          <thead>
            <tr>${headerCells.join('')}</tr>
          </thead>
          <tbody id="cal-tbody">
            ${rows || '<tr><td colspan="11" class="empty-row">Tidak ada data untuk filter ini</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Full render of calendar section
   */
  function render(container) {
    container.innerHTML = `
      ${renderFilterBar()}
      ${renderToolbar()}
      <div id="cal-count-label" class="count-label">
        Menampilkan <strong id="showing-count">${_filteredRecords.length}</strong> dari <strong>${_records.length}</strong> hari
      </div>
      ${renderTable()}
    `;

    bindEvents(container);
    updateCount();
  }

  /**
   * Bind all event listeners
   */
  function bindEvents(container) {
    // Filter buttons
    container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyFilter(btn.dataset.filter);
        render(container);
        scrollToTop(container);
      });
    });

    // Sort headers
    container.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        const dir = (_sortKey === key && _sortDir === 'asc') ? 'desc' : 'asc';
        applySort(key, dir);
        render(container);
      });
    });

    // Row click
    const tbody = container.querySelector('#cal-tbody');
    if (tbody) {
      tbody.addEventListener('click', e => {
        const row = e.target.closest('tr[data-day]');
        if (row && _onRowClick) {
          const day = parseInt(row.dataset.day, 10);
          const record = _records.find(r => r.day === day);
          if (record) _onRowClick(record);
        }
      });

      tbody.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const row = e.target.closest('tr[data-day]');
          if (row && _onRowClick) {
            const day = parseInt(row.dataset.day, 10);
            const record = _records.find(r => r.day === day);
            if (record) _onRowClick(record);
          }
        }
      });
    }

    // Search / jump to day
    const searchInput = container.querySelector('#search-day');
    if (searchInput) {
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const targetDay = parseInt(searchInput.value, 10);
          jumpToDay(targetDay, container);
        }
      });
      searchInput.addEventListener('input', () => {
        const val = parseInt(searchInput.value, 10);
        if (!isNaN(val)) {
          jumpToDay(val, container);
        }
      });
    }

    // Export buttons
    const btnCsv = container.querySelector('#btn-export-csv');
    const btnExcel = container.querySelector('#btn-export-excel');
    const btnPdf = container.querySelector('#btn-export-pdf');

    if (btnCsv) btnCsv.addEventListener('click', () => ExportCSV.export(_records));
    if (btnExcel) btnExcel.addEventListener('click', () => ExportExcel.export(_records));
    if (btnPdf) btnPdf.addEventListener('click', () => ExportPDF.export(_records));
  }

  function jumpToDay(day, container) {
    if (!day || isNaN(day)) return;
    const row = container.querySelector(`tr[data-day="${day}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('highlight-jump');
      setTimeout(() => row.classList.remove('highlight-jump'), 2000);
    }
  }

  function scrollToTop(container) {
    const wrapper = container.querySelector('#table-wrapper');
    if (wrapper) wrapper.scrollTop = 0;
  }

  function updateCount() {
    const el = document.getElementById('showing-count');
    if (el) el.textContent = _filteredRecords.length;
  }

  return { init, render, applyFilter, applySort };
})();
