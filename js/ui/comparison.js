'use strict';

/**
 * Comparison UI — What If mode: runs alternate simulation and compares results.
 */
const ComparisonUI = (() => {
  let _baseResult = null;

  function init(baseResult) {
    _baseResult = baseResult;
  }

  function render(container, baseConfig) {
    container.innerHTML = buildWhatIfForm(baseConfig);
    bindEvents(container, baseConfig);
  }

  function buildWhatIfForm(baseConfig) {
    return `
      <div class="whatif-wrapper">
        <div class="whatif-header">
          <h3 class="section-title">🔮 Mode "What If" — Simulasi Alternatif</h3>
          <p class="whatif-desc">
            Ubah satu atau beberapa parameter dan bandingkan hasilnya dengan simulasi asal.
          </p>
        </div>

        <div class="whatif-content">
          <!-- What If Config -->
          <div class="whatif-config-panel">
            <div class="whatif-config-title">⚙ Parameter Alternatif</div>

            <div class="param-group">
              <label for="wi-initial-balance">Saldo Awal</label>
              <div class="input-with-badge">
                <input type="number" id="wi-initial-balance" value="${baseConfig.initialBalance}" min="0" step="10"/>
                <span class="input-badge">Base: ${baseConfig.initialBalance}</span>
              </div>
            </div>

            <div class="param-group">
              <label for="wi-income-base">Daily Income Awal</label>
              <div class="input-with-badge">
                <input type="number" id="wi-income-base" value="${baseConfig.incomeBase}" min="0" step="1"/>
                <span class="input-badge">Base: ${baseConfig.incomeBase}</span>
              </div>
            </div>

            <div class="param-group">
              <label for="wi-income-growth">Growth Income /hari</label>
              <div class="input-with-badge">
                <input type="number" id="wi-income-growth" value="${baseConfig.incomeGrowthRate}" min="0" step="0.5"/>
                <span class="input-badge">Base: ${baseConfig.incomeGrowthRate}</span>
              </div>
            </div>

            <div class="param-group">
              <label for="wi-weekly-bonus">Weekly Bonus</label>
              <div class="input-with-badge">
                <input type="number" id="wi-weekly-bonus" value="${baseConfig.weeklyBonus}" min="0" step="10"/>
                <span class="input-badge">Base: ${baseConfig.weeklyBonus}</span>
              </div>
            </div>

            <div class="param-group">
              <label for="wi-generate-rate">Generate Rate (%)</label>
              <div class="input-with-badge">
                <input type="number" id="wi-generate-rate" value="${(baseConfig.generateRate * 100).toFixed(1)}" min="0" max="100" step="0.1"/>
                <span class="input-badge">Base: ${(baseConfig.generateRate * 100).toFixed(1)}%</span>
              </div>
            </div>

            <div class="param-group">
              <label for="wi-return-rate">Return Rate (%)</label>
              <div class="input-with-badge">
                <input type="number" id="wi-return-rate" value="${(baseConfig.returnRate * 100).toFixed(0)}" min="100" max="500" step="5"/>
                <span class="input-badge">Base: ${(baseConfig.returnRate * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div class="param-group">
              <label for="wi-invest-duration">Durasi Investasi (hari)</label>
              <div class="input-with-badge">
                <input type="number" id="wi-invest-duration" value="${baseConfig.investDuration}" min="1" step="1"/>
                <span class="input-badge">Base: ${baseConfig.investDuration}</span>
              </div>
            </div>

            <div class="param-group">
              <label for="wi-min-invest">Minimum Investasi</label>
              <div class="input-with-badge">
                <input type="number" id="wi-min-invest" value="${baseConfig.minInvest}" min="1" step="10"/>
                <span class="input-badge">Base: ${baseConfig.minInvest}</span>
              </div>
            </div>

            <div class="param-group checkbox-group">
              <label>
                <input type="checkbox" id="wi-limit-before" ${baseConfig.limitToBalanceBefore !== false ? 'checked' : ''}/>
                Maks Invest ≤ Saldo Sebelum
              </label>
            </div>

            <div class="param-group checkbox-group">
              <label>
                <input type="checkbox" id="wi-sweet-spot-only" ${baseConfig.sweetSpotOnly ? 'checked' : ''}/>
                Hanya Invest pada Sweet Spot
              </label>
            </div>

            <button class="run-btn full-width" id="btn-run-whatif">
              <span class="run-icon">🔮</span>
              Jalankan What If
            </button>
          </div>

          <!-- Comparison Result (initially hidden) -->
          <div class="whatif-result" id="whatif-result" style="display:none">
            <!-- Filled dynamically -->
          </div>
        </div>

        <!-- Presets -->
        <div class="whatif-presets">
          <div class="preset-title">💡 Preset Skenario Cepat</div>
          <div class="preset-list">
            <button class="preset-btn" data-preset="low-start">Saldo Awal 300</button>
            <button class="preset-btn" data-preset="high-income">Income 20/hari</button>
            <button class="preset-btn" data-preset="high-generate">Generate 2%</button>
            <button class="preset-btn" data-preset="sweet-only">Hanya Sweet Spot</button>
            <button class="preset-btn" data-preset="fast-return">Return 7 Hari</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindEvents(container, baseConfig) {
    // Run button
    const runBtn = container.querySelector('#btn-run-whatif');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        const wiConfig = buildWiConfig(container, baseConfig);
        runComparison(container, wiConfig);
      });
    }

    // Preset buttons
    container.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyPreset(container, btn.dataset.preset, baseConfig);
        // Auto-run
        const wiConfig = buildWiConfig(container, baseConfig);
        runComparison(container, wiConfig);
      });
    });
  }

  function buildWiConfig(container, baseConfig) {
    const get = id => container.querySelector(`#${id}`)?.value;
    const getCheck = id => container.querySelector(`#${id}`)?.checked;

    const cfg = {
      ...baseConfig,
      initialBalance: parseFloat(get('wi-initial-balance')) || baseConfig.initialBalance,
      incomeBase: parseFloat(get('wi-income-base')) || baseConfig.incomeBase,
      incomeGrowthRate: parseFloat(get('wi-income-growth')) ?? baseConfig.incomeGrowthRate,
      weeklyBonus: parseFloat(get('wi-weekly-bonus')) ?? baseConfig.weeklyBonus,
      generateRate: (parseFloat(get('wi-generate-rate')) || 0) / 100,
      returnRate: (parseFloat(get('wi-return-rate')) || 120) / 100,
      investDuration: parseInt(get('wi-invest-duration')) || baseConfig.investDuration,
      minInvest: parseFloat(get('wi-min-invest')) || baseConfig.minInvest,
      limitToBalanceBefore: getCheck('wi-limit-before'),
      sweetSpotOnly: getCheck('wi-sweet-spot-only'),
    };
    cfg.sweetSpots = Calculator.generateSweetSpots(cfg);
    return cfg;
  }

  function applyPreset(container, preset, baseConfig) {
    const set = (id, val) => {
      const el = container.querySelector(`#${id}`);
      if (el) el.value = val;
    };

    // Reset to base first
    set('wi-initial-balance', baseConfig.initialBalance);
    set('wi-income-base', baseConfig.incomeBase);
    set('wi-income-growth', baseConfig.incomeGrowthRate);
    set('wi-weekly-bonus', baseConfig.weeklyBonus);
    set('wi-generate-rate', (baseConfig.generateRate * 100).toFixed(1));
    set('wi-return-rate', (baseConfig.returnRate * 100).toFixed(0));
    set('wi-invest-duration', baseConfig.investDuration);
    set('wi-min-invest', baseConfig.minInvest);

    // Apply preset
    switch (preset) {
      case 'low-start':     set('wi-initial-balance', 300); break;
      case 'high-income':   set('wi-income-base', 20); break;
      case 'high-generate': set('wi-generate-rate', 2); break;
      case 'sweet-only':
        container.querySelector('#wi-sweet-spot-only').checked = true;
        break;
      case 'fast-return':   set('wi-invest-duration', 7); break;
    }
  }

  function runComparison(container, wiConfig) {
    const resultPanel = container.querySelector('#whatif-result');
    if (!resultPanel) return;

    resultPanel.innerHTML = '<div class="loading-compare">⏳ Menghitung simulasi What If...</div>';
    resultPanel.style.display = 'block';

    setTimeout(() => {
      const wiResult = Simulator.run(wiConfig);
      renderComparison(resultPanel, _baseResult, wiResult, wiConfig);
    }, 50);
  }

  function renderComparison(container, baseResult, wiResult, wiConfig) {
    const bs = baseResult.summary;
    const ws = wiResult.summary;

    const diff = (a, b, fmt = 2) => {
      const d = Calculator.fmt(a - b);
      const pct = b !== 0 ? Calculator.fmt(((a - b) / b) * 100) : 0;
      const cls = d >= 0 ? 'positive' : 'negative';
      return `<span class="${cls}">${d >= 0 ? '+' : ''}${Calculator.display(d, fmt)} (${pct >= 0 ? '+' : ''}${pct}%)</span>`;
    };

    const rows = [
      ['Total Aset Akhir', bs.finalTotalAssets, ws.finalTotalAssets],
      ['Total Investasi', bs.totalInvestCount, ws.totalInvestCount, 0],
      ['Profit Investasi', bs.totalReturnProfit, ws.totalReturnProfit],
      ['Total Generate', bs.totalGenerate, ws.totalGenerate],
      ['Lost Decimal', bs.totalLostDecimal, ws.totalLostDecimal],
      ['Efisiensi (%)', bs.efficiency, ws.efficiency],
      ['Hari Menunggu', bs.totalWaitDays, ws.totalWaitDays, 0],
    ];

    container.innerHTML = `
      <div class="comparison-result">
        <div class="comparison-title">⚖ Hasil Perbandingan</div>

        <div class="comparison-summary-cards">
          <div class="comparison-card base-card">
            <div class="cc-label">Simulasi Asal</div>
            <div class="cc-value">${Calculator.display(bs.finalTotalAssets)}</div>
            <div class="cc-sub">Total Aset Hari ${bs.simulationDays}</div>
          </div>
          <div class="comparison-vs">vs</div>
          <div class="comparison-card whatif-card">
            <div class="cc-label">What If</div>
            <div class="cc-value">${Calculator.display(ws.finalTotalAssets)}</div>
            <div class="cc-sub">Total Aset Hari ${ws.simulationDays}</div>
          </div>
        </div>

        <table class="comparison-table">
          <thead>
            <tr>
              <th>Metrik</th>
              <th>Asal</th>
              <th>What If</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(([label, base, wi, dec]) => `
              <tr>
                <td>${label}</td>
                <td>${Calculator.display(base, dec ?? 2)}</td>
                <td>${Calculator.display(wi, dec ?? 2)}</td>
                <td>${diff(wi, base, dec ?? 2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="comparison-verdict">
          ${ws.finalTotalAssets > bs.finalTotalAssets
            ? `<div class="verdict-win">🏆 Skenario What If menghasilkan total aset ${Calculator.display(ws.finalTotalAssets - bs.finalTotalAssets)} lebih tinggi!</div>`
            : ws.finalTotalAssets < bs.finalTotalAssets
              ? `<div class="verdict-lose">📉 Skenario asal lebih baik dengan selisih ${Calculator.display(bs.finalTotalAssets - ws.finalTotalAssets)} poin.</div>`
              : `<div class="verdict-equal">⚖ Kedua skenario menghasilkan aset yang sama.</div>`
          }
        </div>
      </div>
    `;
  }

  return { init, render };
})();
