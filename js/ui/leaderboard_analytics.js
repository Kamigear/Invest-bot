'use strict';

const LeaderboardAnalyticsUI = (() => {
  let unsubscribe = null;
  let growthChart = null;
  let historyChart = null;
  let expandedRow = null; // track which class row is expanded
  let state = {
    grade: 'all',
    metric: 'growth24h',
    data: null
  };

  const metricLabels = {
    growth24h: '📅 24 Jam',
    growth7d: '🗓️ 7 Hari',
    growth30d: '📆 30 Hari',
    growthAll: '⏳ All-Time'
  };

  // ─── Exclude list (persisted to localStorage) ─────────────────────────────

  const EXCLUDE_STORAGE_KEY = 'la_excluded_classes_v1';

  /** @returns {Set<string>} set of classKey strings that are excluded */
  function loadExcluded() {
    try {
      const raw = localStorage.getItem(EXCLUDE_STORAGE_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (_) { return new Set(); }
  }

  function saveExcluded(set) {
    try { localStorage.setItem(EXCLUDE_STORAGE_KEY, JSON.stringify([...set])); } catch (_) {}
  }

  let excluded = loadExcluded();

  function isExcluded(row) {
    return excluded.has(classKey(row));
  }

  function toggleExclude(key) {
    if (excluded.has(key)) {
      excluded.delete(key);
    } else {
      excluded.add(key);
    }
    saveExcluded(excluded);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPoints(value) {
    if (value == null || Number.isNaN(Number(value))) return '-';
    const sign = Number(value) > 0 ? '+' : '';
    return `${sign}${Number(value).toLocaleString('id-ID')}`;
  }

  function formatTotal(value) {
    return Number(value || 0).toLocaleString('id-ID');
  }

  function formatDate(value) {
    if (!value) return 'Belum tersedia';
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Belum tersedia';
    return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function classKey(row) {
    return `${row.grade}::${String(row.name || '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
  }

  // ─── Data helpers ─────────────────────────────────────────────────────────

  function computeRowMetrics(row) {
    const key = classKey(row);
    const history = (state.data?.pointHistory?.[key] || []).slice().sort((a, b) => a.scrapedAt - b.scrapedAt);
    const currentTotal = row.total || 0;

    let growth24h = row.growth24h;
    if (growth24h == null && history.length >= 2) {
      growth24h = currentTotal - history[history.length - 2].total;
    }

    let growth7d = row.growth7d;
    if (growth7d == null && history.length > 0) {
      const targetTime = (row.scrapedAtMs || Date.now()) - 7 * 24 * 60 * 60 * 1000;
      const base = history.find(e => e.scrapedAt <= targetTime) || history[0];
      growth7d = currentTotal - base.total;
    }

    let growth30d = row.growth30d;
    if (growth30d == null && history.length > 0) {
      const targetTime = (row.scrapedAtMs || Date.now()) - 30 * 24 * 60 * 60 * 1000;
      const base = history.find(e => e.scrapedAt <= targetTime) || history[0];
      growth30d = currentTotal - base.total;
    }

    let growthAll = row.growthAll;
    if (growthAll == null && history.length > 0) {
      growthAll = currentTotal - history[0].total;
    }

    return {
      ...row,
      growth24h: growth24h ?? 0,
      growth7d: growth7d ?? 0,
      growth30d: growth30d ?? 0,
      growthAll: growthAll ?? 0
    };
  }

  function getRows(includeExcluded = false) {
    const rawRows = state.data?.classes || [];
    return rawRows
      .map(computeRowMetrics)
      .filter(row => {
        const matchGrade = state.grade === 'all' || String(row.grade) === state.grade;
        if (!matchGrade) return false;
        if (!includeExcluded && isExcluded(row)) return false;
        return true;
      });
  }

  function getExcludedRows() {
    const rawRows = state.data?.classes || [];
    return rawRows.map(computeRowMetrics).filter(row => isExcluded(row));
  }

  function topRows(rows) {
    return [...rows]
      .filter(row => row[state.metric] != null)
      .sort((a, b) => (b[state.metric] || 0) - (a[state.metric] || 0))
      .slice(0, 10);
  }

  function getSummary(rows) {
    const metric = state.metric;
    const known = rows.filter(row => row[metric] != null);
    const totalGrowth = known.reduce((sum, row) => sum + (row[metric] || 0), 0);
    const top = topRows(rows)[0] || null;
    const active = known.filter(row => (row[metric] || 0) !== 0).length;

    return {
      classCount: rows.length,
      totalGrowth,
      active,
      top
    };
  }

  // ─── Render: Controls ─────────────────────────────────────────────────────

  function renderControls() {
    const excludedRows = getExcludedRows();
    const excludedChips = excludedRows.map(row => {
      const key = classKey(row);
      return `
        <span class="la-chip la-chip-excluded" data-la-unexclude="${escapeHTML(key)}" title="Klik untuk tampilkan kembali">
          🚫 ${row.grade} - ${escapeHTML(row.name)} ✖
        </span>
      `;
    }).join('');

    return `
      <div class="la-controls">
        <div class="la-segment" role="tablist" aria-label="Filter angkatan">
          ${['all', '10', '11', '12'].map(grade => `
            <button type="button" class="la-chip ${state.grade === grade ? 'active' : ''}" data-la-grade="${grade}">
              ${grade === 'all' ? '🏫 Semua' : `Kelas ${grade}`}
            </button>
          `).join('')}
        </div>
        <div class="la-segment" role="tablist" aria-label="Filter periode growth">
          ${Object.keys(metricLabels).map(metric => `
            <button type="button" class="la-chip ${state.metric === metric ? 'active' : ''}" data-la-metric="${metric}">
              ${metricLabels[metric]}
            </button>
          `).join('')}
        </div>
      </div>
      ${excludedRows.length > 0 ? `
        <div class="la-excluded-bar">
          <span class="la-excluded-title">Kelas Dikecualikan (${excludedRows.length}):</span>
          <div class="la-excluded-list">${excludedChips}</div>
          <button type="button" class="la-chip la-chip-reset" id="btn-la-reset-exclude">🔄 Reset Filter Exclude</button>
        </div>
      ` : ''}
    `;
  }

  // ─── Render: Summary Cards ────────────────────────────────────────────────

  function renderCards(summary) {
    const topName = summary.top ? `${summary.top.grade} - ${escapeHTML(summary.top.name)}` : '-';
    const topGrowth = summary.top ? formatPoints(summary.top[state.metric]) : '-';
    const snapshotCount = state.data?.snapshotCount ?? '-';
    const excludedCount = excluded.size;

    return `
      <div class="la-stats">
        <div class="la-stat">
          <span>📊 Kelas Dipantau</span>
          <strong>${summary.classCount}</strong>
          <small class="text-muted">${snapshotCount} snapshot ${excludedCount > 0 ? `(${excludedCount} di-exclude)` : ''}</small>
        </div>
        <div class="la-stat">
          <span>📈 Total Growth ${metricLabels[state.metric]}</span>
          <strong class="${summary.totalGrowth >= 0 ? 'positive' : 'negative'}">${formatPoints(summary.totalGrowth)}</strong>
          <small class="text-muted">Total akumulasi pertumbuhan</small>
        </div>
        <div class="la-stat">
          <span>🏃 Kelas Bergerak</span>
          <strong>${summary.active}</strong>
          <small class="text-muted">Kelas dengan perubahan poin</small>
        </div>
        <div class="la-stat">
          <span>🏆 Top Growth (${metricLabels[state.metric]})</span>
          <strong class="${(summary.top?.[state.metric] ?? 0) >= 0 ? 'positive' : 'negative'}">${topGrowth}</strong>
          <small>${topName}</small>
        </div>
      </div>
    `;
  }

  // ─── Render: Table with expandable history ────────────────────────────────

  function renderDailyHistory(row) {
    const history = state.data?.pointHistory || {};
    const key = classKey(row);
    const entries = (history[key] || []).slice().sort((a, b) => a.scrapedAt - b.scrapedAt);

    if (!entries.length) {
      return `<tr class="la-history-row" data-history-for="${escapeHTML(key)}">
        <td colspan="6"><div class="la-history-panel la-empty">Belum ada data histori untuk kelas ini.</div></td>
      </tr>`;
    }

    const rows = entries.map((entry, i) => {
      const prev = entries[i - 1];
      const delta = prev != null ? entry.total - prev.total : null;
      const deltaClass = delta == null ? '' : delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'text-muted';
      const deltaText = delta == null ? '—' : formatPoints(delta);
      const trendIcon = delta == null ? '•' : delta > 0 ? '▲' : delta < 0 ? '▼' : '—';

      return `
        <tr class="${i % 2 === 0 ? 'even' : ''}">
          <td class="font-mono la-hist-date">${escapeHTML(entry.date)}</td>
          <td class="font-mono">${formatTotal(entry.total)}</td>
          <td class="font-mono ${deltaClass}">${trendIcon} ${deltaText}</td>
        </tr>
      `;
    }).reverse().join(''); // newest first

    return `<tr class="la-history-row" data-history-for="${escapeHTML(key)}">
      <td colspan="6">
        <div class="la-history-panel">
          <div class="la-history-header">
            📅 Histori Harian — <strong>${escapeHTML(row.name)}</strong> (Kelas ${row.grade})
            <span class="la-history-count">${entries.length} hari tercatat</span>
          </div>
          <div class="la-history-table-wrap">
            <table class="la-hist-table">
              <thead>
                <tr>
                  <th>📆 Tanggal</th>
                  <th>💰 Karma</th>
                  <th>📊 Perubahan</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>`;
  }

  function renderTable(rows) {
    const sorted = [...rows].sort((a, b) => (b[state.metric] ?? -Infinity) - (a[state.metric] ?? -Infinity));
    const body = sorted.map((row, index) => {
      const key = classKey(row);
      const isExpanded = expandedRow === key;
      const histRow = isExpanded ? renderDailyHistory(row) : '';
      const metricValue = row[state.metric] ?? 0;
      const trendIcon = metricValue > 0 ? '▲' : metricValue < 0 ? '▼' : '—';
      const trendClass = metricValue > 0 ? 'up' : metricValue < 0 ? 'down' : 'flat';

      return `
        <tr class="la-row ${isExpanded ? 'la-row-expanded' : ''}" data-la-expand="${escapeHTML(key)}" style="cursor:pointer;" title="Klik untuk lihat histori harian">
          <td class="font-mono">#${index + 1}</td>
          <td>
            <strong>${escapeHTML(row.name)}</strong>
            <span>Kelas ${row.grade} · Rank #${row.rank || '-'} (Total: ${formatTotal(row.total)})</span>
          </td>
          <td class="font-mono ${metricValue >= 0 ? 'positive' : 'negative'}">${formatPoints(metricValue)}</td>
          <td><span class="la-trend ${trendClass}">${trendIcon} ${metricValue > 0 ? 'Naik' : metricValue < 0 ? 'Turun' : 'Stagnan'}</span></td>
          <td class="la-expand-icon">${isExpanded ? '▲' : '▼'}</td>
          <td>
            <button type="button" class="la-btn-exclude" data-la-exclude="${escapeHTML(key)}" title="Kecualikan kelas ini dari analisis">
              🚫 Exclude
            </button>
          </td>
        </tr>
        ${histRow}
      `;
    }).join('');

    return `
      <div class="la-table-wrap">
        <table class="la-table">
          <thead>
            <tr>
              <th>#</th>
              <th>🏫 Kelas</th>
              <th>📈 Growth (${metricLabels[state.metric]})</th>
              <th>📊 Trend</th>
              <th>📋 Histori</th>
              <th>⚙️ Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${body || '<tr><td colspan="6" class="la-empty">Belum ada data untuk filter ini.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="la-hint">💡 Klik baris kelas untuk melihat histori harian. Gunakan "🚫 Exclude" untuk menyembunyikan kelas tertentu.</p>
    `;
  }

  // ─── Render: Shell ────────────────────────────────────────────────────────

  function renderShell(container) {
    const data = state.data;
    const rows = getRows();
    const summary = getSummary(rows);

    container.innerHTML = `
      <div class="leaderboard-analytics-panel">
        <div class="la-header">
          <div>
            <h2>🏆 Leaderboard Analytic</h2>
            <p>📡 Snapshot terakhir: <strong>${formatDate(data?.generatedAt || data?.scrapedAt)}</strong></p>
            <p class="la-meta">Sumber: ${escapeHTML(data?.sourceUrl || '-')} · ${data?.snapshotCount ?? 0} snapshot</p>
          </div>
          <button type="button" class="btn btn-secondary" id="btn-la-refresh">🔄 Refresh</button>
        </div>

        ${renderControls()}
        ${renderCards(summary)}

        <div class="la-chart-card">
          <div class="la-chart-title">📈 Top Growth ${metricLabels[state.metric]}</div>
          <div class="la-chart-box"><canvas id="leaderboard-growth-chart"></canvas></div>
        </div>

        <div class="la-chart-card">
          <div class="la-chart-title">📊 Histori Total Karma per Kelas (semua snapshot)</div>
          <div class="la-chart-note">Tampilkan top 10 kelas berdasarkan karma sekarang. Klik baris tabel untuk detail per kelas.</div>
          <div class="la-chart-box"><canvas id="leaderboard-history-chart"></canvas></div>
        </div>

        ${renderTable(rows)}
      </div>
      ${styles()}
    `;

    bindControls(container);
    renderGrowthChart(topRows(rows));
    renderHistoryChart(rows);
  }

  function renderLoading(container) {
    container.innerHTML = `
      <div class="leaderboard-analytics-panel">
        <div class="la-loading">
          <div class="la-spinner"></div>
          <p>⏳ Memuat Leaderboard Analytic...</p>
        </div>
      </div>
      ${styles()}
    `;
  }

  function renderEmpty(container, message) {
    container.innerHTML = `
      <div class="leaderboard-analytics-panel">
        <div class="la-header">
          <div>
            <h2>🏆 Leaderboard Analytic</h2>
            <p>📡 Menunggu snapshot dari mini server.</p>
          </div>
        </div>
        <div class="la-empty">📋 ${escapeHTML(message)}</div>
      </div>
      ${styles()}
    `;
  }

  // ─── Bind events ──────────────────────────────────────────────────────────

  function bindControls(container) {
    container.querySelectorAll('[data-la-grade]').forEach(button => {
      button.addEventListener('click', () => {
        state.grade = button.dataset.laGrade;
        expandedRow = null;
        renderShell(container);
      });
    });

    container.querySelectorAll('[data-la-metric]').forEach(button => {
      button.addEventListener('click', () => {
        state.metric = button.dataset.laMetric;
        expandedRow = null;
        renderShell(container);
      });
    });

    container.querySelector('#btn-la-refresh')?.addEventListener('click', () => {
      expandedRow = null;
      subscribe(container);
    });

    // Exclude / Unexclude event handlers
    container.querySelectorAll('[data-la-exclude]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.laExclude;
        toggleExclude(key);
        renderShell(container);
      });
    });

    container.querySelectorAll('[data-la-unexclude]').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.laUnexclude;
        toggleExclude(key);
        renderShell(container);
      });
    });

    container.querySelector('#btn-la-reset-exclude')?.addEventListener('click', () => {
      excluded.clear();
      saveExcluded(excluded);
      renderShell(container);
    });

    // Row expand/collapse for daily history
    container.querySelector('.la-table tbody')?.addEventListener('click', e => {
      if (e.target.closest('[data-la-exclude]')) return; // ignore click on exclude button
      const row = e.target.closest('[data-la-expand]');
      if (!row) return;
      const key = row.dataset.laExpand;
      expandedRow = expandedRow === key ? null : key;
      renderShell(container);
      // Scroll to expanded row
      setTimeout(() => {
        const expanded = container.querySelector('.la-row-expanded');
        if (expanded) expanded.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    });
  }

  // ─── Charts ───────────────────────────────────────────────────────────────

  function renderGrowthChart(rows) {
    if (growthChart) { growthChart.destroy(); growthChart = null; }

    const canvas = document.getElementById('leaderboard-growth-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    growthChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map(row => `${row.grade} - ${row.name}`),
        datasets: [{
          label: `Growth ${metricLabels[state.metric]}`,
          data: rows.map(row => row[state.metric] || 0),
          backgroundColor: rows.map(row => (row[state.metric] || 0) >= 0 ? 'rgba(74, 222, 128, 0.72)' : 'rgba(248, 113, 113, 0.72)'),
          borderColor: rows.map(row => (row[state.metric] || 0) >= 0 ? '#4ade80' : '#f87171'),
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1' } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${formatPoints(ctx.parsed.y)} pts`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', maxRotation: 30 }, grid: { color: 'rgba(148, 163, 184, 0.08)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.08)' } }
        }
      }
    });
  }

  /**
   * Fixed history chart: align each dataset's data points to the global sorted
   * date labels. Fill with `null` when a class has no snapshot on that date.
   * Previously this was broken — `entries.map(e => e.total)` returned a raw array
   * that didn't align with the union of all dates.
   */
  function renderHistoryChart(rows) {
    if (historyChart) { historyChart.destroy(); historyChart = null; }

    const canvas = document.getElementById('leaderboard-history-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const history = state.data?.pointHistory || {};
    const colors = ['#4fc3f7', '#81c784', '#ffb74d', '#ba68c8', '#ff8a65', '#64b5f6', '#c5e1a5', '#f48fb1', '#80cbc4', '#ffe082'];

    // Use top 10 by current total to keep chart readable
    const displayRows = [...rows]
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, 10);

    // Collect all unique dates across selected rows — sorted ascending
    const allDates = new Set();
    for (const row of displayRows) {
      const entries = history[classKey(row)] || [];
      entries.forEach(e => allDates.add(e.date));
    }
    const sortedDates = Array.from(allDates).sort();

    if (!sortedDates.length) return;

    // Build datasets: each class gets a null-filled array aligned to sortedDates
    const datasets = displayRows.map((row, i) => {
      const key = classKey(row);
      const entries = history[key] || [];
      // Build a date → total lookup
      const lookup = {};
      for (const e of entries) {
        lookup[e.date] = e.total;
      }
      return {
        label: `${row.grade} - ${row.name}`,
        data: sortedDates.map(date => lookup[date] ?? null),
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length] + '22',
        tension: 0.25,
        fill: false,
        pointRadius: 3,
        spanGaps: true   // connect across nulls for readability
      };
    });

    historyChart = new Chart(canvas, {
      type: 'line',
      data: { labels: sortedDates, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#cbd5e1', boxWidth: 12, padding: 10 },
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                return v != null ? `${ctx.dataset.label}: ${formatTotal(v)} pts` : `${ctx.dataset.label}: -`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 30 }, grid: { color: 'rgba(148, 163, 184, 0.08)' } },
          y: {
            ticks: { color: '#94a3b8', callback: v => formatTotal(v) },
            grid: { color: 'rgba(148, 163, 184, 0.08)' }
          }
        }
      }
    });
  }

  // ─── Firebase subscription ────────────────────────────────────────────────

  function subscribe(container) {
    if (unsubscribe) unsubscribe();

    if (typeof FirebaseDB === 'undefined') {
      renderEmpty(container, 'Firebase belum siap, jadi data analytics belum bisa dibaca.');
      return;
    }

    renderLoading(container);
    const db = FirebaseDB.getDB();
    unsubscribe = db.collection('botState').doc('leaderboardAnalytics')
      .onSnapshot(doc => {
        if (!doc.exists) {
          renderEmpty(container, 'Belum ada snapshot. Mini server akan mengisi data ini pada run harian berikutnya.');
          return;
        }

        state.data = doc.data();
        renderShell(container);
      }, error => {
        console.error('Error loading leaderboard analytics:', error);
        renderEmpty(container, 'Gagal membaca Leaderboard Analytic dari Firebase.');
      });
  }

  // ─── Styles ───────────────────────────────────────────────────────────────

  function styles() {
    return `
      <style>
        .leaderboard-analytics-panel {
          background: var(--bg-card, #1e1e24);
          border: 1px solid var(--border, #333);
          border-radius: 12px;
          padding: 24px;
          color: var(--text-primary, #eee);
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          margin-bottom: 24px;
        }
        /* ── Header ── */
        .la-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          border-bottom: 1px solid var(--border, #333);
          padding-bottom: 16px;
          margin-bottom: 16px;
        }
        .la-header h2 { margin: 0 0 4px; font-size: 1.5rem; }
        .la-header p { margin: 0 0 2px; color: var(--text-secondary, #aaa); font-size: 0.9rem; }
        .la-meta { font-size: 0.78rem !important; opacity: 0.7; }
        /* ── Loading spinner ── */
        .la-loading { text-align: center; padding: 48px 16px; color: var(--text-secondary, #aaa); }
        .la-spinner {
          width: 36px; height: 36px;
          border: 3px solid rgba(79,172,254,0.2);
          border-top-color: #4facfe;
          border-radius: 50%;
          margin: 0 auto 16px;
          animation: la-spin 0.8s linear infinite;
        }
        @keyframes la-spin { to { transform: rotate(360deg); } }
        /* ── Controls ── */
        .la-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .la-segment { display: flex; gap: 8px; flex-wrap: wrap; }
        .la-chip {
          border: 1px solid var(--border, #333);
          background: rgba(255,255,255,0.04);
          color: var(--text-secondary, #aaa);
          border-radius: 8px;
          padding: 7px 14px;
          cursor: pointer;
          font-weight: 600;
          font-size: 12px;
          transition: all 0.15s ease;
        }
        .la-chip:hover { background: rgba(79,172,254,0.07); color: #cdd; }
        .la-chip.active {
          color: var(--accent-blue, #4facfe);
          border-color: rgba(79, 172, 254, 0.6);
          background: rgba(79, 172, 254, 0.12);
        }
        /* ── Stat Cards ── */
        .la-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .la-stat {
          border: 1px solid var(--border, #333);
          background: rgba(0,0,0,0.18);
          border-radius: 10px;
          padding: 14px 16px;
          min-height: 88px;
          transition: border-color 0.15s;
        }
        .la-stat:hover { border-color: rgba(79,172,254,0.3); }
        .la-stat span { display: block; color: var(--text-secondary, #aaa); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
        .la-stat strong {
          display: block;
          margin-top: 6px;
          font-size: 22px;
          font-family: 'JetBrains Mono', monospace;
        }
        .la-stat small { display: block; margin-top: 4px; color: var(--text-secondary, #aaa); font-size: 11px; }
        /* ── Colors ── */
        .positive { color: var(--accent-green, #4ade80) !important; }
        .negative { color: #f87171 !important; }
        .text-muted { color: var(--text-secondary, #888) !important; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        /* ── Charts ── */
        .la-chart-card {
          border: 1px solid var(--border, #333);
          border-radius: 10px;
          padding: 16px;
          background: rgba(0,0,0,0.14);
          margin-bottom: 16px;
        }
        .la-chart-title { color: var(--text-primary, #eee); font-weight: 700; margin-bottom: 6px; font-size: 0.95rem; }
        .la-chart-note { color: var(--text-secondary, #888); font-size: 11px; margin-bottom: 12px; }
        .la-chart-box { height: 300px; }
        /* ── Table ── */
        .la-table-wrap { overflow-x: auto; border-radius: 8px; border: 1px solid var(--border, #333); }
        .la-table { width: 100%; border-collapse: collapse; }
        .la-table th {
          padding: 10px 14px;
          text-align: left;
          border-bottom: 1px solid var(--border, #333);
          color: var(--text-secondary, #aaa);
          background: rgba(0,0,0,0.22);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }
        .la-table td {
          padding: 11px 14px;
          text-align: left;
          border-bottom: 1px solid rgba(51,51,51,0.5);
          vertical-align: middle;
        }
        .la-table td strong { display: block; color: var(--text-primary, #eee); }
        .la-table td span { display: block; color: var(--text-secondary, #aaa); font-size: 11px; margin-top: 2px; }
        .la-row { transition: background 0.12s; }
        .la-row:hover { background: rgba(79,172,254,0.06); }
        .la-row-expanded { background: rgba(79,172,254,0.08) !important; }
        .la-expand-icon {
          color: var(--text-secondary, #888);
          font-size: 11px;
          text-align: center !important;
          user-select: none;
        }
        /* ── Trend badge ── */
        .la-trend {
          display: inline-flex !important;
          align-items: center;
          gap: 4px;
          border-radius: 6px;
          padding: 3px 8px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(148, 163, 184, 0.08);
          color: #cbd5e1 !important;
          font-size: 11px !important;
          font-weight: 700;
          white-space: nowrap;
        }
        .la-trend.up { border-color: rgba(74,222,128,0.35); background: rgba(74,222,128,0.12); color: #4ade80 !important; }
        .la-trend.down { border-color: rgba(248,113,113,0.35); background: rgba(248,113,113,0.12); color: #f87171 !important; }
        .la-trend.flat { border-color: rgba(250,204,21,0.3); background: rgba(250,204,21,0.08); color: #fbbf24 !important; }
        /* ── History Panel (expandable) ── */
        .la-history-row td { padding: 0 !important; border-bottom: 2px solid rgba(79,172,254,0.25) !important; }
        .la-history-panel {
          background: rgba(79,172,254,0.04);
          border-top: 1px solid rgba(79,172,254,0.2);
          padding: 16px 20px;
        }
        .la-history-header {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-secondary, #aaa);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .la-history-count {
          background: rgba(79,172,254,0.15);
          color: #4facfe;
          border-radius: 20px;
          padding: 2px 10px;
          font-size: 11px;
          font-weight: 600;
        }
        .la-history-table-wrap { max-height: 260px; overflow-y: auto; border-radius: 6px; border: 1px solid var(--border, #333); }
        .la-hist-table { width: 100%; border-collapse: collapse; }
        .la-hist-table th {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border, #333);
          color: var(--text-secondary, #aaa);
          background: rgba(0,0,0,0.3);
          font-size: 0.72rem;
          text-transform: uppercase;
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .la-hist-table td {
          padding: 7px 12px;
          border-bottom: 1px solid rgba(51,51,51,0.4);
          font-size: 0.82rem;
          font-family: 'JetBrains Mono', monospace;
        }
        .la-hist-table tr.even { background: rgba(0,0,0,0.1); }
        .la-hist-date { color: var(--text-secondary, #aaa); }
        /* ── Exclude feature styles ── */
        .la-btn-exclude {
          border: 1px solid rgba(248, 113, 113, 0.3);
          background: rgba(248, 113, 113, 0.08);
          color: #f87171;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 11px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.15s ease;
        }
        .la-btn-exclude:hover {
          background: rgba(248, 113, 113, 0.2);
          border-color: #f87171;
        }
        .la-excluded-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          background: rgba(248, 113, 113, 0.06);
          border: 1px dashed rgba(248, 113, 113, 0.25);
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 16px;
        }
        .la-excluded-title {
          font-size: 11px;
          font-weight: 700;
          color: #f87171;
          white-space: nowrap;
        }
        .la-excluded-list {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }
        .la-chip-excluded {
          background: rgba(248, 113, 113, 0.12) !important;
          border-color: rgba(248, 113, 113, 0.4) !important;
          color: #fca5a5 !important;
          padding: 4px 10px !important;
          font-size: 11px !important;
        }
        .la-chip-excluded:hover {
          background: rgba(248, 113, 113, 0.25) !important;
        }
        .la-chip-reset {
          background: rgba(255, 255, 255, 0.06) !important;
          border-color: var(--border, #444) !important;
          font-size: 11px !important;
          padding: 4px 10px !important;
          margin-left: auto;
        }
        .la-chip-reset:hover {
          background: rgba(255, 255, 255, 0.12) !important;
        }
        /* ── Misc ── */
        .la-empty { text-align: center; color: var(--text-secondary, #aaa); padding: 32px 12px; }
        .la-hint { font-size: 11px; color: var(--text-secondary, #777); text-align: center; margin-top: 8px; }
        /* ── Responsive ── */
        @media (max-width: 720px) {
          .leaderboard-analytics-panel { padding: 14px; }
          .la-header { flex-direction: column; }
          .la-controls { align-items: stretch; }
          .la-segment { width: 100%; }
          .la-chip { flex: 1; text-align: center; }
          .la-chart-box { height: 220px; }
          .la-excluded-bar { flex-direction: column; align-items: stretch; }
          .la-chip-reset { margin-left: 0; width: 100%; text-align: center; }
        }
      </style>
    `;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    render: (container) => {
      if (!container) return;
      subscribe(container);
    }
  };
})();
