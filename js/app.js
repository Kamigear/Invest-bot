'use strict';

/**
 * LiveMode — Wall-clock live projection so actual balance follows predicted.
 */
const LiveMode = (() => {
  const STORAGE_KEY = 'investcalc_livemode_v1';
  let _enabled = false;
  let _liveStartDate = null;
  let _ticker = null;

  function todayISO() {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    const d = new Date(a);
    const e = new Date(b);
    return Math.floor((e.getTime() - d.getTime()) / 86400000);
  }

  function currentSimDay(config) {
    if (!_liveStartDate || !config) return 0;
    const elapsed = daysBetween(_liveStartDate, todayISO());
    return Math.max(0, Math.min(elapsed, config.simulationDays));
  }

  function projectedActual(records, day) {
    if (!records || !records.length) return 0;
    const idx = Math.max(0, Math.min(day, records.length - 1));
    return records[idx].balanceAfter ?? 0;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        enabled: _enabled,
        liveStartDate: _liveStartDate,
      }));
    } catch (e) { /* storage full or unavailable */ }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        _enabled = !!data.enabled;
        _liveStartDate = data.liveStartDate || null;
      }
    } catch (e) { /* parse error — use defaults */ }
  }

  function start(config) {
    if (_enabled) return;
    if (!_liveStartDate) {
      _liveStartDate = todayISO();
    }
    _enabled = true;
    persist();
    stopTicker();
    _ticker = setInterval(() => {
      if (App.runSimulation) App.runSimulation();
    }, 60000);
  }

  function stop() {
    _enabled = false;
    _liveStartDate = null;
    persist();
    stopTicker();
  }

  function stopTicker() {
    if (_ticker) {
      clearInterval(_ticker);
      _ticker = null;
    }
  }

  function resetAnchor() {
    _liveStartDate = todayISO();
    persist();
  }

  restore();

  return {
    get enabled() { return _enabled; },
    get liveStartDate() { return _liveStartDate; },
    start,
    stop,
    resetAnchor,
    currentSimDay,
    projectedActual,
    persist,
    restore,
  };
})();

/**
 * App — Main orchestrator. Manages config, runs simulations, and coordinates UI.
 */
const App = (() => {

  // ── Default Configuration ────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    // Simulation
    simulationDays: 90,
    initialBalance: 520,
    realtimeEnabled: true,
    startDate: '',
    liveModeEnabled: false,

    // Income
    incomeDailyEnabled: true,
    incomeType: 'linear',      // 'fixed' | 'linear' | 'custom'
    incomeBase: 12,
    incomeGrowthRate: 1,       // +1 per day for linear

    // Weekly Bonus
    weeklyBonusEnabled: true,
    weeklyBonus: 60,
    weeklyBonusInterval: 7,

    // Generate
    generateEnabled: true,
    generateRate: 0.01,        // 1% of balance per day

    // Investment
    minInvest: 50,
    maxInvest: 0,              // 0 = no cap
    reserveBalance: 0,         // min cash floor the algo never invests below
    investDuration: 30,        // days until maturity
    returnRate: 1.18,          // 118% (+18% return profit)
    limitToBalanceBefore: true, // Cannot invest more than balance before income
    maxLostDecimal: 0.10,      // Max acceptable lost decimal (0.10)

    // Sweet Spots (dynamically generated)
    sweetSpots: [],
    sweetSpotOnly: true,       // If true, only invest at sweet spot amounts

    // Optimizer lookahead
    lookaheadDays: 7,          // How many days to look ahead
    waitThresholdPct: 0.05,    // Must be 5% better to justify waiting
    maxWaitDays: 6,            // Max consecutive days to wait
  };

  let _config = { ...DEFAULT_CONFIG };
  let _baseResult = null;
  let _externalSchedule = null;
  let _activeTab = 'calendar';

  const STORAGE_KEY = 'investcalc_config_v1';
  let _selectedLedgerDate = Ledger.todayISO();

  // ── Persistence ──────────────────────────────────────────────────────────
  function saveConfig() {
    try {
      // Exclude sweetSpots (regenerated on load) to keep storage lean
      const { sweetSpots, ...toSave } = _config;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      console.debug('[DEBUG] saveConfig — initialBalance written to localStorage:', _config.initialBalance);
    } catch (e) { /* storage full or unavailable */ }
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        _config = { ...DEFAULT_CONFIG, ...saved };
        console.debug('[DEBUG] loadConfig — initialBalance read from localStorage:', _config.initialBalance);
      } else {
        console.debug('[DEBUG] loadConfig — no localStorage entry found, using defaults. initialBalance:', _config.initialBalance);
      }
    } catch (e) { /* parse error — use defaults */ }
  }

  // ── Initialization ────────────────────────────────────────────────────────
  let _configUnsubscribe = null;
  let _scheduleUnsubscribe = null;

  async function init() {
    loadConfig();          // restore last session
    DetailUI.init();

    // Restore live mode state
    LiveMode.restore();
    if (LiveMode.enabled) {
      LiveMode.start(_config);
    }

    // Setup real-time config sync from Firebase (multi-browser sync)
    // Only set up if Firebase is available and we have a UID
    if (FirebaseDB.isAuthReady()) {
      try {
        // Unsubscribe from previous listeners
        if (_configUnsubscribe) _configUnsubscribe();
        if (_scheduleUnsubscribe) _scheduleUnsubscribe();

        // Listen for config updates from other browsers
        _configUnsubscribe = await FirebaseDB.syncFromFirebase((remoteConfig) => {
          const prevConfig = { ..._config };
          // Firebase config REPLACES local config entirely (merge #: keep defaults base)
          const { updatedAt, ...cleanRemote } = remoteConfig || {};
          _config = { ...DEFAULT_CONFIG, ...cleanRemote };

          // Detect meaningful changes
          const changedKeys = Object.keys(cleanRemote).filter(k => prevConfig[k] !== cleanRemote[k]);
          if (changedKeys.length > 0) {
            console.log('[SYNC] Config updated from Firebase:', changedKeys);
            saveConfig();
            renderConfigPanel();
            App.runSimulation();
          }
        });

        // Listen for schedule updates (investment status changes)
        _scheduleUnsubscribe = await FirebaseDB.subscribeToScheduleUpdates((entries) => {
          console.log('[SYNC] Schedule updates received from Firebase');
          // Trigger UI refresh if needed
          const summaryEl = document.querySelector('.summary-stats');
          if (summaryEl) {
            summaryEl.dispatchEvent(new CustomEvent('schedule-updated', { detail: { entries } }));
          }
        });
      } catch (e) {
        console.warn('Failed to setup real-time sync, continuing with local-only:', e);
      }
    }

    renderConfigPanel();
    renderLanding();

    // Listen for tab switching
    document.addEventListener('click', handleTabClick);
  }

  function getLedgerBalanceForSelectedDate(ledgerState) {
    const targetDate = _selectedLedgerDate || (ledgerState ? ledgerState.today : Ledger.todayISO());
    if (_baseResult && _baseResult.records) {
      const rec = _baseResult.records.find(r => r.date === targetDate);
      if (rec) {
        return rec.balanceAfter;
      }
    }
    return ledgerState ? ledgerState.currentBalance : _config.initialBalance;
  }

  // ── Config Panel ─────────────────────────────────────────────────────────
  function renderConfigPanel() {
    const panel = document.getElementById('config-panel');
    if (!panel) return;
    if (!_config.startDate) _config.startDate = Ledger.todayISO();
    const ledgerState = Ledger.getState(_config);
    console.debug('[DEBUG] renderConfigPanel — initialBalance:', _config.initialBalance, '| ledgerState.currentBalance:', ledgerState.currentBalance, '| netActual:', ledgerState.netActual);

    panel.innerHTML = `
      <div class="config-header">
        <div class="config-logo">
          <span class="logo-icon">📊</span>
          <span class="logo-text">InvestCalc</span>
        </div>
        <button class="config-toggle" id="btn-toggle-config" aria-label="Toggle config panel">
          <span>⚙</span>
        </button>
      </div>

      <div class="config-body" id="config-body">
        <div class="config-section">
          <div class="config-section-title">📅 Simulasi</div>
          <div class="param-group">
            <label for="cfg-days">Durasi (Hari)</label>
            <input type="number" id="cfg-days" value="${_config.simulationDays}" min="1" max="365" step="1"/>
          </div>
          <div class="param-group">
            <label for="cfg-initial">Saldo Awal</label>
            <input type="number" id="cfg-initial" value="${_config.initialBalance}" min="0" step="10"/>
          </div>
          <div class="param-group">
            <label for="cfg-start-date">Mulai Forecast</label>
            <input type="date" id="cfg-start-date" value="${_config.startDate || ledgerState.today}"/>
          </div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-live-mode-enabled" ${_config.liveModeEnabled ? 'checked' : ''}/>
              🔴 Mode Live (saldo aktual mengikuti prediksi per hari)
            </label>
          </div>
        </div>

        <div class="config-section realtime-section">
          <div class="config-section-title">Realtime Ledger</div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-realtime-enabled" ${_config.realtimeEnabled !== false ? 'checked' : ''}/>
              Pakai saldo aktual berjalan
            </label>
          </div>
          <div class="ledger-balance-card">
            <span>Saldo Saat Ini</span>
            <strong>${Calculator.display(getLedgerBalanceForSelectedDate(ledgerState))}</strong>
            <small>Net transaksi: ${ledgerState.netActual >= 0 ? '+' : ''}${Calculator.display(ledgerState.netActual)}</small>
          </div>
          <div class="ledger-quickset">
            <input type="number" id="ledger-quickset-val" min="0" step="1" placeholder="Saldo saya sekarang..."/>
            <button type="button" id="btn-quickset-balance">📌 Setel</button>
          </div>
          <div class="ledger-form">
            <input type="date" id="ledger-date" value="${_selectedLedgerDate || ledgerState.today}"/>
            <select id="ledger-type">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="bonus">Bonus</option>
              <option value="maturity">Cair</option>
              <option value="invest">Invest</option>
              <option value="adjustment">Adjust</option>
            </select>
            <input type="number" id="ledger-amount" min="0" step="1" placeholder="Nominal"/>
            <input type="text" id="ledger-note" placeholder="Catatan"/>
            <button type="button" class="ledger-add-btn" id="btn-add-ledger">Tambah</button>
          </div>
          <div class="ledger-list">
            ${renderLedgerItems(ledgerState.transactions)}
          </div>
        </div>

        <div class="config-section">
          <div class="config-section-title">💵 Income Harian</div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-income-daily-enabled" ${_config.incomeDailyEnabled !== false ? 'checked' : ''}/>
              Aktifkan Income Harian
            </label>
          </div>
          <div class="param-group">
            <label for="cfg-income-type">Tipe</label>
            <select id="cfg-income-type">
              <option value="linear" ${_config.incomeType === 'linear' ? 'selected' : ''}>Linear (+X/hari)</option>
              <option value="fixed" ${_config.incomeType === 'fixed' ? 'selected' : ''}>Tetap</option>
            </select>
          </div>
          <div class="param-group">
            <label for="cfg-income-base">Income Awal (Hari 1)</label>
            <input type="number" id="cfg-income-base" value="${_config.incomeBase}" min="0" step="1"/>
          </div>
          <div class="param-group" id="income-growth-group">
            <label for="cfg-income-growth">Growth per Hari</label>
            <input type="number" id="cfg-income-growth" value="${_config.incomeGrowthRate}" min="0" step="0.5"/>
          </div>
        </div>

        <div class="config-section">
          <div class="config-section-title">🎊 Weekly Bonus</div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-bonus-enabled" ${_config.weeklyBonusEnabled ? 'checked' : ''}/>
              Aktifkan Weekly Bonus
            </label>
          </div>
          <div class="param-group">
            <label for="cfg-bonus">Jumlah Bonus</label>
            <input type="number" id="cfg-bonus" value="${_config.weeklyBonus}" min="0" step="10"/>
          </div>
          <div class="param-group">
            <label for="cfg-bonus-interval">Interval (hari)</label>
            <input type="number" id="cfg-bonus-interval" value="${_config.weeklyBonusInterval}" min="1" step="1"/>
          </div>
        </div>

        <div class="config-section">
          <div class="config-section-title">⚡ Generate</div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-gen-enabled" ${_config.generateEnabled ? 'checked' : ''}/>
              Aktifkan Generate
            </label>
          </div>
          <div class="param-group">
            <label for="cfg-gen-rate">Generate Rate (%)</label>
            <input type="number" id="cfg-gen-rate" value="${(_config.generateRate * 100).toFixed(1)}" min="0" max="100" step="0.1"/>
          </div>
        </div>

        <div class="config-section">
          <div class="config-section-title">📈 Investasi & Algoritma</div>
          
          <div class="param-group">
            <label for="cfg-return" class="label-tooltip">
              <span>Return Rate (%)</span>
              <span class="label-info-icon">ℹ️</span>
              <div class="label-tooltip-box">
                Persentase pengembalian total saat investasi jatuh tempo. Misal 118% = profit 18%.
              </div>
            </label>
            <input type="number" id="cfg-return" value="${(_config.returnRate * 100).toFixed(0)}" min="100" max="1000" step="1"/>
          </div>

          <div class="param-group">
            <label for="cfg-duration" class="label-tooltip">
              <span>Durasi Investasi (hari)</span>
              <span class="label-info-icon">ℹ️</span>
              <div class="label-tooltip-box">
                Lama waktu (dalam hari) hingga nilai investasi dan return cair kembali ke saldo.
              </div>
            </label>
            <input type="number" id="cfg-duration" value="${_config.investDuration}" min="1" step="1"/>
          </div>

          <div class="param-group">
            <label for="cfg-min-invest" class="label-tooltip">
              <span>Min Investasi</span>
              <span class="label-info-icon">ℹ️</span>
              <div class="label-tooltip-box">
                Batas nominal terkecil yang bisa diinvestasikan dalam 1 kali transaksi.
              </div>
            </label>
            <input type="number" id="cfg-min-invest" value="${_config.minInvest}" min="1" step="10"/>
          </div>

          <div class="param-group">
            <label for="cfg-reserve-balance" class="label-tooltip">
              <span>Saldo Cadangan 🛡️</span>
              <span class="label-info-icon">ℹ️</span>
              <div class="label-tooltip-box">
                Saldo minimum yang <strong>tidak boleh disentuh</strong> algoritma untuk investasi. Gunakan untuk kebutuhan belanja harian.
                <br/><br/>Contoh: Cadangan 150 → algoritma hanya investasi dari kelebihan di atas 150.
              </div>
            </label>
            <input type="number" id="cfg-reserve-balance" value="${_config.reserveBalance ?? 0}" min="0" step="10"/>
          </div>

          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-limit-before" ${_config.limitToBalanceBefore !== false ? 'checked' : ''}/>
              Maks Invest ≤ Saldo Sebelum
            </label>
          </div>

          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-sweet-spot-only" ${_config.sweetSpotOnly ? 'checked' : ''}/>
              Sweet Spot Only — hanya invest di sweet spot
            </label>
          </div>

          <div class="param-group">
            <label>🎯 Sweet Spots Otomatis</label>
            <div id="sweet-spots-preview" style="font-size:11px; font-family:'JetBrains Mono',monospace; color:var(--accent-orange); word-break:break-all; max-height:60px; overflow-y:auto; background:var(--bg-input); padding:6px 8px; border-radius:6px; border:1px solid var(--border);">
              ${(Calculator.generateSweetSpots(_config).slice(0, 30).join(', ')) || 'None'}
            </div>
          </div>

          <details style="margin-top: 10px; border-top: 1px solid var(--border); padding-top: 8px;">
            <summary style="cursor: pointer; font-size: 11px; color: var(--text-muted); font-weight: 600; user-select: none;">
              ⚙️ Pengaturan Lanjutan
            </summary>
            <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
              <div class="param-group">
                <label for="cfg-max-invest" class="label-tooltip">
                  <span>Maks Investasi (0 = Bebas)</span>
                  <span class="label-info-icon">ℹ️</span>
                  <div class="label-tooltip-box">
                    Batas atas nominal investasi dalam 1 kali transaksi. Isi 0 jika tidak ada batasan.
                  </div>
                </label>
                <input type="number" id="cfg-max-invest" value="${_config.maxInvest}" min="0" step="50"/>
              </div>

              <div class="param-group">
                <label for="cfg-max-lost-decimal" class="label-tooltip">
                  <span>Toleransi Lost Decimal</span>
                  <span class="label-info-icon">ℹ️</span>
                  <div class="label-tooltip-box">
                    Batas maksimum pecahan desimal yang hilang yang masih dianggap sebagai Sweet Spot (misal 0.10).
                  </div>
                </label>
                <input type="number" id="cfg-max-lost-decimal" value="${_config.maxLostDecimal ?? 0.10}" min="0" max="0.99" step="0.01"/>
              </div>

              <div class="param-group">
                <label for="cfg-lookahead" class="label-tooltip">
                  <span>Lookahead (hari)</span>
                  <span class="label-info-icon">ℹ️</span>
                  <div class="label-tooltip-box">
                    Jumlah hari ke depan yang diperhitungkan algoritma (mencari Weekly Bonus) sebelum eksekusi.
                  </div>
                </label>
                <input type="number" id="cfg-lookahead" value="${_config.lookaheadDays}" min="0" max="30" step="1"/>
              </div>

              <div class="param-group">
                <label for="cfg-wait-threshold" class="label-tooltip">
                  <span>Wait Threshold (%)</span>
                  <span class="label-info-icon">ℹ️</span>
                  <div class="label-tooltip-box">
                    Persentase keuntungan ekstra minimal yang diperlukan agar algoritma memilih WAIT (menunda).
                  </div>
                </label>
                <input type="number" id="cfg-wait-threshold" value="${(_config.waitThresholdPct * 100).toFixed(0)}" min="0" max="100" step="1"/>
              </div>

              <div class="param-group">
                <label for="cfg-max-wait" class="label-tooltip">
                  <span>Max Hari Menunggu</span>
                  <span class="label-info-icon">ℹ️</span>
                  <div class="label-tooltip-box">
                    Batas maksimum hari berturut-turut algoritma diizinkan menunda (WAIT) investasi.
                  </div>
                </label>
                <input type="number" id="cfg-max-wait" value="${_config.maxWaitDays}" min="0" max="30" step="1"/>
              </div>
            </div>
          </details>
        </div>

        <div class="config-actions">
          <button class="run-btn" id="btn-run-sim">
            <span class="run-icon">▶</span>
            Jalankan Simulasi
          </button>
        </div>
      </div>
    `;

    bindConfigEvents(panel);
    bindLedgerEvents(panel);
  }

  function bindConfigEvents(panel) {
    // Run button
    panel.querySelector('#btn-run-sim')?.addEventListener('click', runSimulation);

    // Income type toggle
    panel.querySelector('#cfg-income-type')?.addEventListener('change', e => {
      const growthGroup = panel.querySelector('#income-growth-group');
      if (growthGroup) {
        growthGroup.style.display = e.target.value === 'linear' ? '' : 'none';
      }
    });

    // Auto-save + update sweet spots preview on any input change
    const onAnyChange = () => {
      readConfig();
      saveConfig();
      const preview = panel.querySelector('#sweet-spots-preview');
      if (preview) {
        const spots = Calculator.generateSweetSpots(_config);
        preview.textContent = spots.slice(0, 30).join(', ') + (spots.length > 30 ? '...' : '');
      }
    };

    panel.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', onAnyChange);
      el.addEventListener('change', onAnyChange);
    });

    // Toggle config panel on mobile
    panel.querySelector('#btn-toggle-config')?.addEventListener('click', () => {
      const body = panel.querySelector('#config-body');
      if (body) body.classList.toggle('collapsed');
    });
  }

  function readConfig() {
    const get = id => document.getElementById(id)?.value;
    const getCheck = id => document.getElementById(id)?.checked;
    const getNum = (id, def) => parseFloat(get(id)) || def;
    const getInt = (id, def) => parseInt(get(id)) || def;

    const _prevIB = _config.initialBalance;
    _config = {
      ..._config,
      simulationDays: getInt('cfg-days', 90),
      initialBalance: getNum('cfg-initial', 520),
      realtimeEnabled: getCheck('cfg-realtime-enabled') ?? true,
      liveModeEnabled: getCheck('cfg-live-mode-enabled') ?? false,
      startDate: get('cfg-start-date') || Ledger.todayISO(),
      incomeType: get('cfg-income-type') || 'linear',
      incomeBase: getNum('cfg-income-base', 12),
      incomeGrowthRate: getNum('cfg-income-growth', 1),
      incomeDailyEnabled: getCheck('cfg-income-daily-enabled') ?? true,
      weeklyBonusEnabled: getCheck('cfg-bonus-enabled') ?? true,
      weeklyBonus: getNum('cfg-bonus', 60),
      weeklyBonusInterval: getInt('cfg-bonus-interval', 7),
      generateEnabled: getCheck('cfg-gen-enabled') ?? true,
      generateRate: getNum('cfg-gen-rate', 1) / 100,
      limitToBalanceBefore: getCheck('cfg-limit-before') ?? true,
      minInvest: getNum('cfg-min-invest', 50),
      maxInvest: getNum('cfg-max-invest', 0),
      reserveBalance: getNum('cfg-reserve-balance', 0),
      investDuration: getInt('cfg-duration', 30),
      returnRate: getNum('cfg-return', 118) / 100,
      maxLostDecimal: getNum('cfg-max-lost-decimal', 0.10),
      sweetSpotOnly: getCheck('cfg-sweet-spot-only') ?? true,
      lookaheadDays: getInt('cfg-lookahead', 7),
      waitThresholdPct: getNum('cfg-wait-threshold', 5) / 100,
      maxWaitDays: getInt('cfg-max-wait', 6),
    };
    if (_prevIB !== _config.initialBalance) {
      console.debug('[DEBUG] readConfig — initialBalance changed via DOM: ', _prevIB, '->', _config.initialBalance, '| cfg-initial value:', get('cfg-initial'));
    }
    _config.sweetSpots = Calculator.generateSweetSpots(_config);
  }

  // ── Simulation ────────────────────────────────────────────────────────────
  function buildRuntimeConfig() {
    const cfg = { ..._config };
    cfg.startDate = cfg.startDate || Ledger.todayISO();
    if (cfg.realtimeEnabled !== false) {
      const ledgerState = Ledger.getState(cfg);
      cfg.ledgerState = ledgerState;
    }
    return cfg;
  }

  function runSimulation() {
    readConfig();

    if (typeof LiveMode !== 'undefined') {
      if (_config.liveModeEnabled && !LiveMode.enabled) {
        LiveMode.start(_config);
      } else if (!_config.liveModeEnabled && LiveMode.enabled) {
        LiveMode.stop();
      }
    }

    const runBtn = document.getElementById('btn-run-sim');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="spinner">⏳</span> Memproses...';
    }

    setTimeout(() => {
      try {
        _baseResult = Simulator.run(buildRuntimeConfig());
        renderResults();
        const ledgerState = Ledger.getState(_config);
        const balanceEl = document.querySelector('.ledger-balance-card strong');
        if (balanceEl) {
          balanceEl.textContent = Calculator.display(getLedgerBalanceForSelectedDate(ledgerState));
        }
      } catch (err) {
        console.error('Simulation error:', err);
        showError(`Terjadi kesalahan: ${err.message}`);
      } finally {
        if (runBtn) {
          runBtn.disabled = false;
          runBtn.innerHTML = '<span class="run-icon">▶</span> Jalankan Simulasi';
        }
      }
    }, 50);
  }

  // ── Results ───────────────────────────────────────────────────────────────
  function renderLanding() {
    const content = document.getElementById('main-content');
    if (!content) return;

    content.innerHTML = `
      <div class="landing-hero">
        <div class="hero-icon">📊</div>
        <h1 class="hero-title">Investment Calendar Simulator</h1>
        <p class="hero-desc">
          Algoritma cerdas yang mensimulasikan kapan dan berapa besar investasi harus dilakukan,
          dilengkapi kalender interaktif, analisis mendalam, dan ekspor lengkap.
        </p>
        <div class="hero-features">
          <div class="feature-card">
            <span class="feat-icon">🟢</span>
            <span>Hari Investasi</span>
          </div>
          <div class="feature-card">
            <span class="feat-icon">🔴</span>
            <span>Penundaan Strategis</span>
          </div>
          <div class="feature-card">
            <span class="feat-icon">🔵</span>
            <span>Weekly Bonus</span>
          </div>
          <div class="feature-card">
            <span class="feat-icon">📊</span>
            <span>Grafik & Analisis</span>
          </div>
          <div class="feature-card">
            <span class="feat-icon">🔮</span>
            <span>Mode What If</span>
          </div>
          <div class="feature-card">
            <span class="feat-icon">📤</span>
            <span>Export CSV/Excel/PDF</span>
          </div>
        </div>
        <button class="cta-btn" id="btn-cta-run">
          ▶ Mulai Simulasi
        </button>
      </div>
    `;

    document.getElementById('btn-cta-run')?.addEventListener('click', runSimulation);
  }

  function getTodayTaskLabel(record) {
    if (!record) return 'Tidak ada tugas hari ini';
    if (record.decision === 'INVEST') return `Invest ${Calculator.display(record.investedAmount)}`;
    if (record.decision === 'WAIT') return `Wait ${record.waitDays || 1} hari`;
    if (record.decision === 'SKIP') return 'Skip';
    return record.decisionLabel || record.decision;
  }

  function renderTodayTaskPopup(record) {
    if (!record) return '';
    const taskClass = record.decision === 'INVEST' ? 'invest' : record.decision === 'WAIT' ? 'wait' : 'skip';
    const firstReason = record.reason?.[0] || 'Forecast sudah diperbarui dari saldo aktual.';
    return `
      <div class="today-task-popup ${taskClass}" id="today-task-popup">
        <button type="button" class="today-task-close" id="today-task-close" aria-label="Tutup">x</button>
        <div class="today-task-kicker">Tugas Hari Ini</div>
        <div class="today-task-date">${record.date || `Hari ${record.day}`}</div>
        <div class="today-task-main">${getTodayTaskLabel(record)}</div>
        <div class="today-task-note">${firstReason}</div>
        <button type="button" class="today-task-detail" id="today-task-detail">Lihat Detail</button>
      </div>
    `;
  }

  function bindTodayTaskPopup(record) {
    document.getElementById('today-task-close')?.addEventListener('click', () => {
      document.getElementById('today-task-popup')?.remove();
    });
    document.getElementById('today-task-detail')?.addEventListener('click', () => {
      DetailUI.open(record);
    });
  }

  function renderResults() {
    if (!_baseResult) return;

    const { records, summary } = _baseResult;
    const todayRecord = records.find(record => record.date === Ledger.todayISO());
    const content = document.getElementById('main-content');
    if (!content) return;

    // Build tabs
    content.innerHTML = `
      <div class="results-wrapper">
        <!-- Summary bar -->
        <div class="result-summary-bar">
          <div class="rsb-item">
            <span class="rsb-label">${summary.isRealtime ? 'Forecast Realtime' : 'Simulasi'}</span>
            <span class="rsb-value">${summary.simulationDays} Hari</span>
          </div>
          <div class="rsb-item">
            <span class="rsb-label">Mulai</span>
            <span class="rsb-value">${summary.startDate || 'Hari 1'}</span>
          </div>
          <div class="rsb-item">
            <span class="rsb-label">Saldo Aktual</span>
            ${LiveMode.enabled && records.length
              ? `<span class="rsb-value profit-color">${Calculator.display(LiveMode.projectedActual(records, LiveMode.currentSimDay(_config)))}</span>
                 <span class="live-badge">🔴 Hari ${LiveMode.currentSimDay(_config)}</span>`
              : `<span class="rsb-value profit-color">${Calculator.display(summary.initialBalance)}</span>`}
          </div>
          <div class="rsb-item">
            <span class="rsb-label">Total Investasi</span>
            <span class="rsb-value invest-color">${summary.totalInvestCount}x</span>
          </div>
          <div class="rsb-item">
            <span class="rsb-label">Total Aset Akhir</span>
            <span class="rsb-value profit-color">${Calculator.display(summary.finalTotalAssets)}</span>
          </div>
          <div class="rsb-item">
            <span class="rsb-label">Efisiensi</span>
            <span class="rsb-value">${summary.efficiency}%</span>
          </div>
          <div class="rsb-item">
            <span class="rsb-label">vs Invest Tiap Hari</span>
            <span class="rsb-value ${summary.outperformancePct >= 0 ? 'profit-color' : 'warn-color'}">
              ${summary.outperformancePct >= 0 ? '+' : ''}${summary.outperformancePct}%
            </span>
          </div>
        </div>

        <!-- Firebase Sync Buttons -->
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:0 4px 8px;">
          <button id="btn-sync-firebase"
            onclick="syncToFirebase(App.getConfig && App.getConfig(), App.getSchedule && App.getSchedule())"
            style="padding:8px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#4facfe,#00f2fe);color:#0f0f1a;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;">
            ☁️ Sync ke Firebase
          </button>
          <button id="btn-sync-from-firebase"
            onclick="syncFromFirebase()"
            style="padding:8px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0f0f1a;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;">
            ⬇️ Sync dari Firebase
          </button>
        </div>

        <!-- Tabs -->
        <div class="tab-bar" role="tablist">
          <button class="tab-btn active" data-tab="calendar" role="tab" aria-selected="true" id="tab-btn-calendar">
            📅 Kalender
          </button>
          <button class="tab-btn" data-tab="summary" role="tab" aria-selected="false" id="tab-btn-summary">
            📊 Ringkasan
          </button>
          <button class="tab-btn" data-tab="whatif" role="tab" aria-selected="false" id="tab-btn-whatif">
            🔮 What If
          </button>
          <button class="tab-btn" data-tab="botstatus" role="tab" aria-selected="false" id="tab-btn-botstatus">
            🤖 Status Bot
          </button>
        </div>

        <!-- Tab Panels -->
        <div id="tab-calendar" class="tab-panel active" role="tabpanel">
          <div id="calendar-container"></div>
        </div>

        <div id="tab-summary" class="tab-panel" role="tabpanel" style="display:none">
          <div id="summary-container"></div>
        </div>

        <div id="tab-whatif" class="tab-panel" role="tabpanel" style="display:none">
          <div id="whatif-container"></div>
        </div>

        <div id="tab-botstatus" class="tab-panel" role="tabpanel" style="display:none">
          <div id="botstatus-container"></div>
        </div>
      </div>
      ${renderTodayTaskPopup(todayRecord)}
    `;

    bindTodayTaskPopup(todayRecord);

    // Render calendar tab
    const calContainer = document.getElementById('calendar-container');
    if (calContainer) {
      CalendarUI.init(records, record => DetailUI.open(record));
      CalendarUI.render(calContainer);
    }

    // Initialize What If
    ComparisonUI.init(_baseResult);

    _activeTab = 'calendar';
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  function handleTabClick(e) {
    const btn = e.target.closest('.tab-btn[data-tab]');
    if (!btn) return;

    const tabId = btn.dataset.tab;
    if (tabId === _activeTab) return;
    _activeTab = tabId;

    // Update button states
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
      b.setAttribute('aria-selected', b.dataset.tab === tabId);
    });

    // Update panel visibility
    document.querySelectorAll('.tab-panel').forEach(p => {
      const isActive = p.id === `tab-${tabId}`;
      p.style.display = isActive ? '' : 'none';
      p.classList.toggle('active', isActive);
    });

    // Lazy-render tabs
    if (tabId === 'summary') {
      const container = document.getElementById('summary-container');
      if (container && !container.hasChildNodes()) {
        SummaryUI.render(container, _baseResult.summary, _baseResult.records, buildRuntimeConfig());
      }
    }

    if (tabId === 'whatif') {
      const container = document.getElementById('whatif-container');
      if (container && !container.hasChildNodes()) {
        ComparisonUI.render(container, buildRuntimeConfig());
      }
    }

    if (tabId === 'botstatus') {
      const container = document.getElementById('botstatus-container');
      if (container && typeof BotStatusUI !== 'undefined') {
        BotStatusUI.render(container);
      }
    }
  }

  function renderLedgerItems(transactions) {
    if (!transactions.length) {
      return '<div class="ledger-empty">Belum ada transaksi aktual.</div>';
    }
    return transactions.slice().reverse().slice(0, 8).map(tx => {
      const signed = Ledger.signedAmount(tx);
      const cls = signed >= 0 ? 'positive' : 'negative';
      return `
        <div class="ledger-item" data-ledger-id="${tx.id}">
          <div>
            <strong>${Ledger.typeLabel(tx.type)}</strong>
            <span>${tx.date}${tx.note ? ` - ${tx.note}` : ''}</span>
          </div>
          <b class="${cls}">${signed >= 0 ? '+' : '-'}${Calculator.display(Math.abs(signed))}</b>
          <button type="button" class="ledger-delete" title="Hapus transaksi" data-delete-ledger="${tx.id}">x</button>
        </div>
      `;
    }).join('');
  }

  function bindLedgerEvents(panel) {
    const dateInput = panel.querySelector('#ledger-date');
    if (dateInput) {
      const onDateChange = () => {
        _selectedLedgerDate = dateInput.value;
        const balanceEl = panel.querySelector('.ledger-balance-card strong');
        if (balanceEl) {
          const ledgerState = Ledger.getState(_config);
          balanceEl.textContent = Calculator.display(getLedgerBalanceForSelectedDate(ledgerState));
        }
      };
      dateInput.addEventListener('change', onDateChange);
      dateInput.addEventListener('input', onDateChange);
    }

    panel.querySelector('#btn-add-ledger')?.addEventListener('click', () => {
      const tx = {
        date: panel.querySelector('#ledger-date')?.value || Ledger.todayISO(),
        type: panel.querySelector('#ledger-type')?.value || 'expense',
        amount: panel.querySelector('#ledger-amount')?.value,
        note: panel.querySelector('#ledger-note')?.value || '',
      };
      if (!Ledger.add(tx)) return;
      readConfig();
      saveConfig();
      renderConfigPanel();
      runSimulation();
    });

    panel.querySelector('#btn-quickset-balance')?.addEventListener('click', () => {
      const targetInput = panel.querySelector('#ledger-quickset-val');
      const targetVal = parseFloat(targetInput?.value);
      if (isNaN(targetVal) || targetVal < 0) return;

      const state = Ledger.getState(_config);
      const current = state.currentBalance;
      const diff = targetVal - current;

      if (diff === 0) return;

      const tx = {
        date: Ledger.todayISO(),
        type: diff > 0 ? 'adjustment' : 'expense',
        amount: Math.abs(diff),
        note: 'Setel Saldo Aktual',
      };

      if (!Ledger.add(tx)) return;
      readConfig();
      saveConfig();
      renderConfigPanel();
      runSimulation();
    });

    panel.querySelectorAll('[data-delete-ledger]').forEach(btn => {
      btn.addEventListener('click', () => {
        Ledger.remove(btn.dataset.deleteLedger);
        renderConfigPanel();
        runSimulation();
      });
    });
  }

  function showError(msg) {
    const content = document.getElementById('main-content');
    if (content) {
      content.innerHTML = `<div class="error-msg">❌ ${msg}</div>`;
    }
  }

  // Cleanup function to unsubscribe from Firebase listeners
  function cleanup() {
    if (_configUnsubscribe) {
      _configUnsubscribe();
      _configUnsubscribe = null;
    }
    if (_scheduleUnsubscribe) {
      _scheduleUnsubscribe();
      _scheduleUnsubscribe = null;
    }
  }

  return {
    init,
    runSimulation,
    getConfig: () => _config,
    getSchedule: () => _externalSchedule || _baseResult?.summary?.investmentSchedule || [],
    setConfig: (cfg) => {
      if (!cfg || typeof cfg !== 'object') return;
      const { updatedAt, ...cleanRemote } = cfg;
      _config = { ...DEFAULT_CONFIG, ...cleanRemote };
      saveConfig();
      renderConfigPanel();
      App.runSimulation();
    },
    setSchedule: (schedule) => {
      if (!Array.isArray(schedule)) return;
      _externalSchedule = schedule;
      if (_baseResult) {
        _baseResult.summary = { ..._baseResult.summary, investmentSchedule: schedule };
        renderResults();
      }
    },
    render: () => {
      renderConfigPanel();
      if (_baseResult) renderResults();
    },
    cleanup,
  };
})();

// ── Bootstrap + Auth Guard ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const overlay   = document.getElementById('auth-overlay');
  const authInput = document.getElementById('auth-input');
  const authBtn   = document.getElementById('auth-btn');
  const authError = document.getElementById('auth-error');
  const setupLink = document.getElementById('auth-setup-link');

  // Session key — cleared when tab closes
  const SESSION_KEY = 'investcalc_auth_ok';

  async function tryLogin() {
    const pw = authInput.value.trim();
    if (!pw) return;
    authBtn.disabled = true;
    authBtn.textContent = 'Memeriksa...';

    try {
      const ok = await FirebaseDB.checkPassword(pw);
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, '1');
        overlay.style.display = 'none';
        await App.init();
      } else {
        authError.style.display = 'block';
        authInput.value = '';
        authInput.focus();
      }
    } catch (e) {
      // Firebase not reachable — allow access (offline mode)
      console.warn('Auth offline, skipping:', e);
      sessionStorage.setItem(SESSION_KEY, '1');
      overlay.style.display = 'none';
      await App.init();
    }

    authBtn.disabled = false;
    authBtn.textContent = 'Masuk';
  }

  async function setupPassword() {
    const pw = prompt('Buat password baru:');
    if (!pw || pw.length < 4) { alert('Password minimal 4 karakter!'); return; }
    const confirm = prompt('Ulangi password:');
    if (pw !== confirm) { alert('Password tidak cocok!'); return; }
    try {
      await FirebaseDB.setPassword(pw);
      alert('✅ Password berhasil dibuat! Silakan login.');
    } catch (e) {
      alert('❌ Gagal menyimpan password: ' + e.message);
    }
  }

  if (authBtn) {
    authBtn.addEventListener('click', tryLogin);
    authInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
    setupLink.addEventListener('click', e => { e.preventDefault(); setupPassword(); });
  }

  // If already authenticated this session → skip overlay
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    if (overlay) overlay.style.display = 'none';
    await App.init();
  } else {
    if (overlay) overlay.style.display = 'flex';
  }

  // Cleanup on window unload
  window.addEventListener('beforeunload', () => {
    App.cleanup?.();
  });

  // Initialize anonymous auth if needed
  FirebaseDB.initAnonymousAuth().catch(e => {
    console.log('Anonymous auth not required for offline mode');
  });
});

// ── Firebase Sync Handler (called from simulate button) ───────────────────
async function syncToFirebase(config, schedule) {
  const btn = document.getElementById('btn-sync-firebase');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '⏳ Menyinkronkan...';

  try {
    await FirebaseDB.syncToFirebase(config, schedule);
    btn.innerHTML = '✅ Tersinkron!';
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
    setTimeout(() => {
      btn.innerHTML = '☁️ Sync ke Firebase';
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);
  } catch (e) {
    btn.innerHTML = '❌ Gagal Sync';
    btn.style.background = 'linear-gradient(135deg,#ef4444,#dc2626)';
    console.error('Sync failed:', e);
    setTimeout(() => {
      btn.innerHTML = '☁️ Sync ke Firebase';
      btn.style.background = '';
      btn.disabled = false;
    }, 4000);
  }
}

// ── Sync from Firebase Handler (one-time fetch) ────────────────────────────
async function syncFromFirebase() {
  const btn = document.getElementById('btn-sync-from-firebase');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '⏳ Mengambil...';

  try {
    const result = await FirebaseDB.fetchFromFirebase();
    
    if (result.config && typeof result.config === 'object') {
      // Override entire config with Firebase's version
      App.setConfig(result.config);
      console.log('Config overridden from Firebase:', result.config);
    }
    
    if (result.schedule && result.schedule.length > 0) {
      // Update schedule
      App.setSchedule(result.schedule);
      console.log('Schedule overridden from Firebase:', result.schedule.length, 'entries');
    }
    
    // Re-render UI
    if (App.render) {
      App.render();
    }
    
    btn.innerHTML = '✅ Terambil!';
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
    setTimeout(() => {
      btn.innerHTML = '⬇️ Sync dari Firebase';
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);
  } catch (e) {
    btn.innerHTML = '❌ Gagal Ambil';
    btn.style.background = 'linear-gradient(135deg,#ef4444,#dc2626)';
    console.error('Fetch from Firebase failed:', e);
    setTimeout(() => {
      btn.innerHTML = '⬇️ Sync dari Firebase';
      btn.style.background = '';
      btn.disabled = false;
    }, 4000);
  }
}

