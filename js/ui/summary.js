'use strict';

/**
 * Summary UI — Renders the strategy summary with stats cards and charts.
 */
const SummaryUI = (() => {
  let _charts = {};

  function render(container, summary, records, config = {}) {
    container.innerHTML = buildHTML(summary, records, config);
    setTimeout(() => {
      buildCharts(records, summary);
    }, 100);
  }

  function buildHTML(s, records, config = {}) {
    const reserve = config.reserveBalance || 0;
    return `
      <div class="summary-wrapper">
        <!-- Stats Cards -->
        <div class="stats-grid">
          ${statCard('📅', 'Durasi Simulasi', `${s.simulationDays} Hari`)}
          ${statCard('💰', 'Saldo Awal', Calculator.display(Math.round(s.initialBalance), 0))}
          ${reserve > 0 ? statCard('🛡️', 'Saldo Cadangan', Calculator.display(Math.round(reserve), 0), 'warn') : ''}
          ${statCard('🏦', 'Total Aset Akhir', Calculator.display(Math.round(s.finalTotalAssets), 0), 'highlight')}
          ${statCard('📈', 'Total Investasi', `${s.totalInvestCount} kali`)}
          ${s.totalLedgerInvest > 0 ? statCard('📘', 'Ledger Invest', `${s.totalLedgerInvestCount}× (${Calculator.display(Math.round(s.totalLedgerInvest), 0)})`, 'highlight') : ''}
          ${statCard('🎁', 'Profit Investasi', `+${Calculator.display(Math.round(s.totalReturnProfit), 0)}`, 'profit')}
           ${statCard('🎯', 'Efisiensi', `${s.efficiency}%`, s.efficiency >= 99 ? 'good' : 'warn')}
           ${statCard('💧', 'Lost Decimal', Calculator.display(s.totalLostDecimal))}
           ${statCard('⏳', 'Hari Menunggu', `${s.totalWaitDays} hari`)}
          ${statCard('🏆', 'vs Invest Setiap Hari', `${s.outperformancePct >= 0 ? '+' : ''}${s.outperformancePct}%`, s.outperformancePct >= 0 ? 'profit' : 'warn')}
        </div>

        <!-- Investasi Aktif Live (dari Firebase sync) -->
        ${buildLiveInvestmentsSection(config)}

        <!-- Investment Schedule -->
        <div class="schedule-section">
          <h3 class="section-title">📋 Jadwal Investasi Optimal</h3>
          <div class="schedule-grid">
            ${s.investmentSchedule.map((inv, i) => `
              <div class="schedule-chip">
                <span class="chip-num">#${i + 1}</span>
                <div class="chip-body">
                  <div class="chip-row">
                    <span class="chip-label">Saldo</span>
                    <span class="chip-val muted">${Calculator.display(Math.round(inv.balanceBefore), 0)}</span>
                  </div>
                  <div class="chip-row">
                    <span class="chip-label">Hari</span>
                    <span class="chip-val">${inv.investDay}</span>
                  </div>
                  <div class="chip-row">
                    <span class="chip-label">Invest</span>
                    <span class="chip-val accent">${Calculator.display(Math.round(inv.amount), 0)}</span>
                  </div>
                  <div class="chip-row">
                    <span class="chip-label">Cair</span>
                    <span class="chip-val">Hari ${inv.maturityDay}</span>
                  </div>
                  <div class="chip-row">
                    <span class="chip-label">Profit</span>
                    <span class="chip-val profit">+${Calculator.display(Math.round(inv.profit), 0)}</span>
                  </div>
                </div>
              </div>
            `).join('') || '<div class="empty-schedule">Tidak ada investasi dalam periode ini.</div>'}
          </div>
        </div>

        <!-- Balance Growth Chart (full width, prominent) -->
        <div class="chart-card chart-card-wide">
          <div class="chart-title">💵 Perkembangan Saldo Harian</div>
          <div class="chart-legend-manual">
            <span class="legend-dot" style="background:#10b981"></span> Saldo
            <span class="legend-dot" style="background:#4facfe"></span> Total Aset
            <span class="legend-dot invest-dot"></span> Hari Investasi
            <span class="legend-dot maturity-dot"></span> Cair
            <span class="legend-dot bonus-dot"></span> Bonus
          </div>
          <div class="chart-container" style="height:260px">
            <canvas id="chart-saldo"></canvas>
          </div>
        </div>

        <!-- Charts -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-title">📊 Pertumbuhan Total Aset</div>
            <div class="chart-container">
              <canvas id="chart-assets"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-title">📅 Distribusi Keputusan Harian</div>
            <div class="chart-container">
              <canvas id="chart-decisions"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-title">💰 Komposisi Profit</div>
            <div class="chart-container">
              <canvas id="chart-profit"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-title">📈 Saldo Harian vs Total Aset</div>
            <div class="chart-container">
              <canvas id="chart-balance"></canvas>
            </div>
          </div>
        </div>

        <!-- Text Summary -->
        <div class="text-summary">
          <div class="summary-box">
            <div class="summary-box-title">════════════════════════════</div>
            <div class="summary-box-title">REKOMENDASI STRATEGI</div>
            <div class="summary-box-title">════════════════════════════</div>
            <div class="summary-line">Simulasi : ${s.simulationDays} Hari</div>
            <br/>
            <div class="summary-line bold">Strategi Optimal</div>
            ${s.investmentSchedule.map(inv =>
              `<div class="summary-line">• Hari ${inv.investDay} → Invest ${Calculator.display(Math.round(inv.amount), 0)} (Saldo: ${Calculator.display(Math.round(inv.balanceBefore), 0)})</div>`
            ).join('\n')}
            <br/>
            <div class="summary-line">Total Investasi     : ${s.totalInvestCount} kali</div>
            <div class="summary-line">Total Lost Decimal  : ${Calculator.display(s.totalLostDecimal)}</div>
            <div class="summary-line">Profit Investasi    : +${Calculator.display(Math.round(s.totalReturnProfit), 0)}</div>
            <div class="summary-line">Total Aset Akhir    : ${Calculator.display(Math.round(s.finalTotalAssets), 0)}</div>
            <div class="summary-line">Efisiensi           : ${s.efficiency}%</div>
            <br/>
            <div class="summary-line highlight-line">
              ${s.outperformancePct >= 0
                ? `🏆 Strategi ini menghasilkan aset ${s.outperformancePct}% lebih tinggi dibanding strategi investasi setiap hari.`
                : `⚠ Strategi setiap hari menghasilkan ${Math.abs(s.outperformancePct)}% lebih tinggi — pertimbangkan mengurangi lookahead.`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function statCard(icon, label, value, type = '') {
    return `
      <div class="stat-card ${type}">
        <div class="stat-icon">${icon}</div>
        <div class="stat-info">
          <div class="stat-label">${label}</div>
          <div class="stat-value">${value}</div>
        </div>
      </div>
    `;
  }

  /**
   * Render section investasi aktif saat ini dari Firebase sync.
   * Ditampilkan hanya jika config.liveInvestments terisi.
   */
  function buildLiveInvestmentsSection(config) {
    const investments = config?.liveInvestments;
    if (!investments || investments.length === 0) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = investments.map((inv, i) => {
      const matDate = inv.maturityDate ? new Date(inv.maturityDate.toString().split(' ')[0]) : null;
      let countdown = '';
      let countdownClass = '';
      if (matDate) {
        matDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((matDate - today) / 86400000);
        if (diffDays < 0) {
          countdown = `<span class="inv-overdue">Sudah lewat ${Math.abs(diffDays)}h</span>`;
          countdownClass = 'overdue';
        } else if (diffDays === 0) {
          countdown = `<span class="inv-today">Cair hari ini! 🎉</span>`;
          countdownClass = 'today';
        } else {
          countdown = `<span class="inv-countdown">${diffDays} hari lagi</span>`;
        }
      }

      const profitAmt = inv.returnAmount - inv.amount;
      const matLabel = inv.maturityDate ? inv.maturityDate.toString().split(' ')[0] : '—';

      return `
        <div class="live-inv-row ${countdownClass}">
          <span class="live-inv-num">#${i + 1}</span>
          <div class="live-inv-body">
            <div class="live-inv-main">
              <span class="live-inv-amount">${Calculator.display(Math.round(inv.amount), 0)} pt</span>
              <span class="live-inv-arrow">→</span>
              <span class="live-inv-return">${Calculator.display(Math.round(inv.returnAmount), 0)} pt</span>
              <span class="live-inv-profit">(+${Calculator.display(Math.round(profitAmt), 0)})</span>
            </div>
            <div class="live-inv-meta">
              <span class="live-inv-date">📅 Cair: ${matLabel}</span>
              ${countdown}
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="schedule-section live-investments-section">
        <h3 class="section-title">🔴 Investasi Aktif Sekarang <span class="live-badge">${investments.length} aktif</span></h3>
        <div class="live-inv-list">
          ${rows}
        </div>
        <div class="live-inv-total">
          Total terkunci: <strong>${Calculator.display(Math.round(investments.reduce((s, inv) => s + (inv.amount || 0), 0)), 0)} pt</strong>
          → Akan cair: <strong>${Calculator.display(Math.round(investments.reduce((s, inv) => s + (inv.returnAmount || 0), 0)), 0)} pt</strong>
        </div>
      </div>
    `;
  }

  function buildCharts(records, summary) {
    // Destroy old charts
    Object.values(_charts).forEach(c => { if (c) c.destroy(); });
    _charts = {};

    if (typeof Chart === 'undefined') return;

    const days = records.map(r => r.day);
    const totalAssets = records.map(r => r.totalAssets);
    const balances = records.map(r => r.balanceAfter);

    const chartDefaults = {
      color: '#e2e8f0',
      borderColor: 'rgba(255,255,255,0.1)',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#e2e8f0', font: { family: 'Inter' } }
        },
        tooltip: {
          backgroundColor: 'rgba(15,15,26,0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(79,172,254,0.3)',
          borderWidth: 1,
        }
      }
    };

    // Chart 1: Total Assets Growth
    const ctx1 = document.getElementById('chart-assets');
    if (ctx1) {
      _charts.assets = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: days,
          datasets: [{
            label: 'Total Aset',
            data: totalAssets,
            borderColor: '#4facfe',
            backgroundColor: 'rgba(79,172,254,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: records.length <= 30 ? 3 : 0,
            pointHoverRadius: 5,
          }]
        },
        options: {
          ...chartDefaults,
          scales: {
            x: {
              ticks: { color: '#94a3b8', maxTicksLimit: 15 },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: 'Hari', color: '#94a3b8' }
            },
            y: {
              ticks: { color: '#94a3b8' },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: 'Poin', color: '#94a3b8' }
            }
          }
        }
      });
    }

    // Chart 2: Decision Distribution
    const ctx2 = document.getElementById('chart-decisions');
    if (ctx2) {
      const investDays = records.filter(r => r.flags.isInvestDay || r.flags.hasLedgerInvestment).length;
      const waitDays = records.filter(r => r.flags.isDelayDay).length;
      const skipDays = records.filter(r => r.decision === 'SKIP').length;

      _charts.decisions = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: ['Investasi', 'Menunggu (strategis)', 'Skip (saldo kurang)'],
          datasets: [{
            data: [investDays, waitDays, skipDays],
            backgroundColor: [
              'rgba(16, 185, 129, 0.8)',
              'rgba(239, 68, 68, 0.8)',
              'rgba(148, 163, 184, 0.4)',
            ],
            borderColor: ['#10b981', '#ef4444', '#94a3b8'],
            borderWidth: 2,
          }]
        },
        options: {
          ...chartDefaults,
          cutout: '60%',
          plugins: {
            ...chartDefaults.plugins,
            legend: {
              position: 'bottom',
              labels: { color: '#e2e8f0', padding: 16, font: { family: 'Inter', size: 12 } }
            }
          }
        }
      });
    }

    // Chart 3: Profit Composition
    const ctx3 = document.getElementById('chart-profit');
    if (ctx3) {
      _charts.profit = new Chart(ctx3, {
        type: 'pie',
        data: {
          labels: ['Profit Investasi', 'Saldo Awal'],
          datasets: [{
            data: [
              summary.totalReturnProfit,
              summary.initialBalance,
            ],
            backgroundColor: [
              'rgba(79,172,254,0.8)',
              'rgba(16,185,129,0.8)',
            ],
            borderColor: ['#4facfe', '#10b981'],
            borderWidth: 2,
          }]
        },
        options: {
          ...chartDefaults,
          plugins: {
            ...chartDefaults.plugins,
            legend: {
              position: 'bottom',
              labels: { color: '#e2e8f0', padding: 12, font: { family: 'Inter', size: 12 } }
            }
          }
        }
      });
    }

    // Chart 4: Balance vs Total Assets
    const ctx4 = document.getElementById('chart-balance');
    if (ctx4) {
      _charts.balance = new Chart(ctx4, {
        type: 'line',
        data: {
          labels: days,
          datasets: [
            {
              label: 'Saldo',
              data: balances,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16,185,129,0.05)',
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 4,
              borderWidth: 2,
            },
            {
              label: 'Total Aset',
              data: totalAssets,
              borderColor: '#4facfe',
              backgroundColor: 'rgba(79,172,254,0.05)',
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 4,
              borderWidth: 2,
              borderDash: [5, 3],
            }
          ]
        },
        options: {
          ...chartDefaults,
          scales: {
            x: {
              ticks: { color: '#94a3b8', maxTicksLimit: 15 },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: 'Hari', color: '#94a3b8' }
            },
            y: {
              ticks: { color: '#94a3b8' },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: 'Poin', color: '#94a3b8' }
            }
          }
        }
      });
    }

    // Chart 5: Balance Growth (prominent, full-width, with event markers)
    const ctx5 = document.getElementById('chart-saldo');
    if (ctx5) {
      const investPoints = records.map(r => (r.flags.isInvestDay || r.flags.hasLedgerInvestment) ? r.balanceAfter : null);
      const maturityPoints = records.map(r => r.flags.isMaturityDay  ? r.balanceAfter : null);

      _charts.saldo = new Chart(ctx5, {
        type: 'line',
        data: {
          labels: days,
          datasets: [
            {
              label: 'Total Aset',
              data: totalAssets,
              borderColor: 'rgba(79,172,254,0.55)',
              backgroundColor: 'rgba(79,172,254,0.04)',
              fill: false,
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
              borderWidth: 1.5,
              borderDash: [4, 3],
              order: 3,
            },
            {
              label: 'Saldo',
              data: balances,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16,185,129,0.08)',
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
              borderWidth: 2,
              order: 2,
            },
            {
              label: 'Hari Investasi',
              data: investPoints,
              borderColor: 'transparent',
              backgroundColor: '#f59e0b',
              pointRadius: records.length <= 90 ? 5 : 3,
              pointHoverRadius: 7,
              pointStyle: 'triangle',
              showLine: false,
              order: 1,
             },
             {
               label: 'Cair',
               data: maturityPoints,
               borderColor: 'transparent',
               backgroundColor: '#4facfe',
               pointRadius: records.length <= 90 ? 5 : 3,
               pointHoverRadius: 7,
               pointStyle: 'circle',
               showLine: false,
               order: 1,
             },
           ]
        },
        options: {
          ...chartDefaults,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              ticks: { color: '#94a3b8', maxTicksLimit: 20 },
              grid: { color: 'rgba(255,255,255,0.04)' },
              title: { display: true, text: 'Hari', color: '#94a3b8' }
            },
            y: {
              ticks: { color: '#94a3b8' },
              grid: { color: 'rgba(255,255,255,0.06)' },
              title: { display: true, text: 'Poin', color: '#94a3b8' }
            }
          },
          plugins: {
            ...chartDefaults.plugins,
            tooltip: {
              ...chartDefaults.plugins.tooltip,
              callbacks: {
                title: ctx => `Hari ${ctx[0].label}`,
                label: ctx => {
                  if (ctx.parsed.y === null) return null;
                  const dayIdx = ctx.dataIndex;
                  const rec = records[dayIdx];
                  if (ctx.dataset.label === 'Hari Investasi') return ` Investasi: ${Math.round(rec.investedAmount).toLocaleString('id-ID')}`;
                   if (ctx.dataset.label === 'Cair') return ` Cair: ${Math.round(rec.maturedTotal).toLocaleString('id-ID')}`;
                   return ` ${ctx.dataset.label}: ${Math.round(ctx.parsed.y).toLocaleString('id-ID')}`;
                }
              }
            },
            legend: { display: false },
          }
        }
      });
    }
  }

  return { render };
})();
