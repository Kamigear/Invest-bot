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
    incomeFixedEnabled: true,
    incomeLinearEnabled: true,
    incomeBase: 12,            // linear base (day 1)
    incomeGrowthRate: 1,       // +1 per day for linear
    incomeFixedAmount: 12,     // fixed daily income

    // Weekly Bonus (Easter Egg Claim)
    weeklyBonusEnabled: true,
    weeklyBonus: 50,
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

    // Manual Day Overrides { [dayOrDate]: amount }
    dayOverrides: {},
    dayIncomeOverrides: {},

    // Class Perks — acquisition timeline model
    // Each simulation perk is an array of { fromDay, count } or { fromDay, tier, count }
    // This allows getting additional stacks on different days.
    perks: {
      // 💰 Passive income
      // count-only: [{ count: N, fromDay: D }, ...]  →  N × (+5/hari) starting day D
      piggyBank: [],
      // tier+count:  [{ tier: 1|2, count: N, fromDay: D }, ...]
      bankbook: [],        // tier: 1=bronze(0.5%), 2=silver(1%), 3=gold(1.5%)
      vault: [],           // tier: 1=+10/hari, 2=+15/hari

      // 📈 Investasi
      highYieldBond: [],   // tier: 1=+2%, 2=+4%, 3=+6%
      timeWeaver: [],      // tier: 1=−1hari, 2=−2hari

      // 🎁 Daily login
      earlyBird: [],       // count-only: N × (+2/hari)
      nightOwl: [],        // count-only: N × (+4/hari)
      loginMultiplier: [], // tier+count: tier 1=×1.05, 2=×1.10  (compounded per count)

      // 🛒 Lainnya (info saja — bukan array)
      auctionDiscount: 0,
      haggler: 0,
      gachaReset: false,
      tokenOfFortune: false,
      tokenOfLuck: false,
      proxyBidder: false,
      refundReceipt: 0,
      streakSaver: false
    }
  };

  let _config = { ...DEFAULT_CONFIG };
  let _baseResult = null;
  let _externalSchedule = null;
  let _liveInvestments = [];  // Investasi aktif dari Firebase sync
  let _syncOptions = {
    perks: true,
    balance: true,
    streak: true,
    investments: true,
    ledger: true
  };
  let _activeTab = 'calendar';
  let _reRunTimer = null;

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

  function migratePerkToArray(val, hasTier = true, count = 1, startDay = 1) {
    if (Array.isArray(val)) return val;
    if (!val) return [];
    if (typeof val === 'boolean') {
      return val ? [{ count: 1, fromDay: startDay || 1 }] : [];
    }
    if (typeof val === 'number' && val > 0) {
      if (hasTier) {
        return [{ tier: val, count: count || 1, fromDay: startDay || 1 }];
      } else {
        return [{ count: val, fromDay: startDay || 1 }];
      }
    }
    return [];
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        _config = { ...DEFAULT_CONFIG, ...saved };
        // Migrate legacy incomeType to new toggle-based config
        if (saved.incomeType && !('incomeFixedEnabled' in saved)) {
          _config.incomeFixedEnabled = saved.incomeType === 'fixed';
          _config.incomeLinearEnabled = saved.incomeType !== 'fixed';
        }
        // Migrate old configs without perks object or migrate to array of acquisitions
        if (!saved.perks || typeof saved.perks !== 'object') {
          _config.perks = { ...DEFAULT_CONFIG.perks };
        } else {
          const p = saved.perks;
          const sd = saved.perkStartDay || {};
          _config.perks = {
            ...DEFAULT_CONFIG.perks,
            ...p,
            piggyBank: migratePerkToArray(p.piggyBank, false, 1, sd.piggyBank),
            earlyBird: migratePerkToArray(p.earlyBird, false, 1, sd.earlyBird),
            nightOwl: migratePerkToArray(p.nightOwl, false, 1, sd.nightOwl),
            bankbook: migratePerkToArray(p.bankbook, true, p.bankbookCount, sd.bankbook),
            vault: migratePerkToArray(p.vault, true, p.vaultCount, sd.vault),
            highYieldBond: migratePerkToArray(p.highYieldBond, true, p.highYieldBondCount, sd.highYieldBond),
            timeWeaver: migratePerkToArray(p.timeWeaver, true, p.timeWeaverCount, sd.timeWeaver),
            loginMultiplier: migratePerkToArray(p.loginMultiplier, true, p.loginMultiplierCount, sd.loginMultiplier),
          };
        }
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

  function renderPerkRowsHtml(perkName, hasTier, tierOptions = []) {
    const entries = Array.isArray(_config.perks?.[perkName]) ? _config.perks[perkName] : [];
    if (entries.length === 0) {
      return `<div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:3px 0;">Tidak aktif (0 stack)</div>`;
    }
    return entries.map((entry, idx) => `
      <div class="perk-row" data-perk="${perkName}" data-idx="${idx}" style="display:flex;gap:4px;align-items:center;margin-bottom:5px;flex-wrap:wrap;background:rgba(0,0,0,0.15);padding:4px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.03);">
        ${hasTier ? `
          <select class="perk-tier-select" style="flex:1.2;min-width:105px;font-size:11px;padding:3px 5px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);">
            ${tierOptions.map(opt => `<option value="${opt.value}" ${entry.tier === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
          </select>
        ` : ''}
        <div style="display:flex;align-items:center;gap:2px;">
          <span style="font-size:11px;color:var(--text-muted);">×</span>
          <input type="number" class="perk-count-input" min="1" max="20" value="${entry.count || 1}" title="Jumlah stack" style="width:36px;font-size:11px;padding:3px 2px;text-align:center;"/>
        </div>
        <div style="display:flex;align-items:center;gap:2px;">
          <span style="font-size:10px;color:var(--text-muted);">H:</span>
          <input type="number" class="perk-day-input" min="1" max="365" value="${entry.fromDay || 1}" title="Hari didapat" style="width:40px;font-size:11px;padding:3px 2px;text-align:center;margin-top:0;"/>
        </div>
        <select class="perk-timing-select" style="flex:1.3;min-width:125px;font-size:10.5px;padding:3px 4px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);" title="Waktu dapat perk">
          <option value="after" ${entry.timing === 'after' ? 'selected' : ''}>Dapat Setelah Login</option>
          <option value="before" ${entry.timing === 'before' || (!entry.timing && entry.fromDay <= 1) ? 'selected' : ''}>Dapat Sebelum Login</option>
        </select>
        <button type="button" onclick="App.removePerkRow('${perkName}', ${idx})" title="Hapus stack" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:11px;line-height:1;margin-left:auto;">✕</button>
      </div>
    `).join('');
  }

  function renderPerkGroupHtml(perkName, title, hasTier, tierOptions = []) {
    return `
      <div class="perk-stack-card" style="background:rgba(15,23,42,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:7px 10px;margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <span style="font-weight:600;font-size:11.5px;color:#e2e8f0;">${title}</span>
          <button type="button" onclick="App.addPerkRow('${perkName}', ${hasTier})" style="background:rgba(168,85,247,0.2);border:1px solid rgba(168,85,247,0.4);color:#c084fc;border-radius:4px;padding:2px 7px;font-size:10.5px;font-weight:600;cursor:pointer;transition:all 0.15s;">+ Stack</button>
        </div>
        <div id="perk-list-${perkName}">
          ${renderPerkRowsHtml(perkName, hasTier, tierOptions)}
        </div>
      </div>
    `;
  }

  function readPerkArray(perkName, hasTier = true) {
    const container = document.getElementById(`perk-list-${perkName}`);
    if (!container) return Array.isArray(_config.perks?.[perkName]) ? _config.perks[perkName] : [];
    const rows = container.querySelectorAll('.perk-row');
    const list = [];
    rows.forEach(row => {
      const fromDay = Math.max(1, parseInt(row.querySelector('.perk-day-input')?.value, 10) || 1);
      const count = Math.max(1, parseInt(row.querySelector('.perk-count-input')?.value, 10) || 1);
      const timing = row.querySelector('.perk-timing-select')?.value || 'after';
      if (hasTier) {
        const tier = parseInt(row.querySelector('.perk-tier-select')?.value, 10) || 1;
        if (tier > 0) list.push({ tier, count, fromDay, timing });
      } else {
        list.push({ count, fromDay, timing });
      }
    });
    return list;
  }

  function addPerkRow(perkName, hasTier = true) {
    readConfig();
    if (!Array.isArray(_config.perks[perkName])) {
      _config.perks[perkName] = [];
    }
    const defaultTier = perkName === 'vault' ? 2 : perkName === 'bankbook' ? 2 : 1;
    if (hasTier) {
      _config.perks[perkName].push({ tier: defaultTier, count: 1, fromDay: 1, timing: 'after' });
    } else {
      _config.perks[perkName].push({ count: 1, fromDay: 1, timing: 'after' });
    }
    saveConfig();
    renderConfigPanel();
    runSimulation();
  }

  function removePerkRow(perkName, idx) {
    readConfig();
    if (Array.isArray(_config.perks[perkName])) {
      _config.perks[perkName].splice(idx, 1);
    }
    saveConfig();
    renderConfigPanel();
    runSimulation();
  }

  // ── Config Panel ─────────────────────────────────────────────────────────
  function renderConfigPanel() {
    const panel = document.getElementById('config-panel');
    if (!panel) return;
    if (!_config.startDate) _config.startDate = Ledger.todayISO();
    const ledgerState = Ledger.getState(_config);
    console.debug('[DEBUG] renderConfigPanel — initialBalance:', _config.initialBalance, '| ledgerState.currentBalance:', ledgerState.currentBalance, '| netActual:', ledgerState.netActual);

    // Preserve scroll position of config body
    const prevBody = panel.querySelector('#config-body');
    const prevScrollTop = prevBody ? prevBody.scrollTop : 0;

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
        <div class="config-section import-section" style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(99, 102, 241, 0.12)); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 10px; padding: 12px; margin-bottom: 12px;">
          <div style="font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #c084fc; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <span>🌐 Sync Firebase & Bot</span>
            <span style="font-size: 10px; background: rgba(168, 85, 247, 0.2); color: #e2e8f0; padding: 2px 6px; border-radius: 4px;">Cloud Sync</span>
          </div>

          <div class="sync-options-box" style="display: flex; flex-wrap: wrap; gap: 6px 10px; margin-bottom: 10px; font-size: 11px; color: #e2e8f0; background: rgba(0, 0, 0, 0.25); padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="width: 100%; font-size: 10px; font-weight: 700; color: #c084fc; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 2px;">Target Import (Tarik):</div>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="sync-opt-perks" ${_syncOptions.perks ? 'checked' : ''}/> 🏷 Perks
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="sync-opt-balance" ${_syncOptions.balance ? 'checked' : ''}/> 💰 Saldo
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="sync-opt-streak" ${_syncOptions.streak ? 'checked' : ''}/> 🔥 Streak
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="sync-opt-investments" ${_syncOptions.investments ? 'checked' : ''}/> 📈 Investasi
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="sync-opt-ledger" ${_syncOptions.ledger ? 'checked' : ''}/> 📜 Ledger
            </label>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button type="button" id="btn-import-web" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #a855f7, #6366f1); color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3); transition: all 0.2s ease;">
              <span>⚡</span> Sync Data Pilihan (Tarik)
            </button>
            <button type="button" id="btn-upload-schedule" onclick="syncToFirebase(App.getConfig && App.getConfig())" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #0284c7, #3b82f6); color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); transition: all 0.2s ease;">
              <span>☁️</span> Sync Config ke Bot (Kirim)
            </button>
          </div>
          <div id="import-web-status" style="font-size: 11px; margin-top: 8px; color: #94a3b8; line-height: 1.4; display: none; background: rgba(0, 0, 0, 0.25); padding: 8px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.08);"></div>
        </div>

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
          <div class="config-section-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Realtime Ledger</span>
            ${ledgerState.transactions.length > 0 ? `
              <button type="button" id="btn-reset-ledger" title="Hapus semua transaksi Ledger" style="font-size:10px; padding:3px 8px; background:rgba(239,68,68,0.18); color:#f87171; border:1px solid rgba(239,68,68,0.4); border-radius:4px; cursor:pointer; font-weight:600;">
                🗑 Reset All
              </button>
            ` : ''}
          </div>
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
            ${getLedgerBalanceForSelectedDate(ledgerState) < 0 ? `
              <small style="color: #f87171; font-weight: bold; margin-top: 4px; display: block;">
                ⚠️ Saldo minus! Hapus atau sesuaikan transaksi.
              </small>
            ` : ''}
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
          <div class="param-group checkbox-group" title="Aktifkan/nonaktifkan Fixed Income (dari Vault & Piggy Bank perk atau manual)">
            <label>
              <input type="checkbox" id="cfg-income-fixed-enabled" ${_config.incomeFixedEnabled !== false ? 'checked' : ''}/>
              Tetap
            </label>
          </div>
          <div class="param-group">
            <label for="cfg-income-fixed-amount">Fixed per Hari</label>
            <input type="number" id="cfg-income-fixed-amount" value="${_config.incomeFixedAmount}" min="0" step="1"/>
          </div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-income-linear-enabled" ${_config.incomeLinearEnabled !== false ? 'checked' : ''}/>
              Linear (+X/hari)
            </label>
          </div>
          <div class="param-group">
            <label for="cfg-income-base">Linear Base (Hari 1)</label>
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
          <div class="config-section-title">🃏 Class Perks</div>

          <div class="config-subsection-title">💰 Passive Income</div>
          ${renderPerkGroupHtml('bankbook', 'Bankbook (Generate %/hari)', true, [
            { value: 1, label: 'Bronze (0.5%)' },
            { value: 2, label: 'Silver (1.0%)' },
            { value: 3, label: 'Gold (1.5%)' }
          ])}
          ${renderPerkGroupHtml('vault', 'Vault (Fixed Income/hari)', true, [
            { value: 1, label: 'Tier I (+10/hari)' },
            { value: 2, label: 'Tier II (+15/hari)' }
          ])}
          ${renderPerkGroupHtml('piggyBank', 'Piggy Bank (+5/hari)', false)}

          <div class="config-subsection-title">📈 Investasi</div>
          ${renderPerkGroupHtml('highYieldBond', 'High Yield Bond (Return %)', true, [
            { value: 1, label: 'I (+2% return)' },
            { value: 2, label: 'II (+4% return)' },
            { value: 3, label: 'III (+6% return)' }
          ])}
          ${renderPerkGroupHtml('timeWeaver', 'Time Weaver (Durasi)', true, [
            { value: 1, label: 'I (−12 jam)' },
            { value: 2, label: 'II (−24 jam / −1 hari)' }
          ])}

          <div class="config-subsection-title">🎁 Daily Login</div>
          ${renderPerkGroupHtml('earlyBird', 'Early Bird (+2/hari)', false)}
          ${renderPerkGroupHtml('nightOwl', 'Night Owl (+4/hari)', false)}
          ${renderPerkGroupHtml('loginMultiplier', 'Login Multiplier', true, [
            { value: 1, label: 'I (×1.05)' },
            { value: 2, label: 'II (×1.10)' }
          ])}

          <div class="config-subsection-title">🛒 Lainnya (info saja)</div>
          <div class="param-group">
            <label for="cfg-perk-auction">Auction Discount</label>
            <select id="cfg-perk-auction">
              <option value="0" ${_config.perks.auctionDiscount === 0 ? 'selected' : ''}>None</option>
              <option value="1" ${_config.perks.auctionDiscount === 1 ? 'selected' : ''}>I (5%)</option>
              <option value="2" ${_config.perks.auctionDiscount === 2 ? 'selected' : ''}>II (10%)</option>
            </select>
          </div>
          <div class="param-group">
            <label for="cfg-perk-haggler">Hagglers License</label>
            <select id="cfg-perk-haggler">
              <option value="0" ${_config.perks.haggler === 0 ? 'selected' : ''}>None</option>
              <option value="1" ${_config.perks.haggler === 1 ? 'selected' : ''}>I (2% diskon)</option>
              <option value="2" ${_config.perks.haggler === 2 ? 'selected' : ''}>II (4% diskon)</option>
              <option value="3" ${_config.perks.haggler === 3 ? 'selected' : ''}>III (6% diskon)</option>
            </select>
          </div>
          <div class="param-group">
            <label for="cfg-perk-refund">Refund Receipt</label>
            <select id="cfg-perk-refund">
              <option value="0" ${_config.perks.refundReceipt === 0 ? 'selected' : ''}>None</option>
              <option value="1" ${_config.perks.refundReceipt === 1 ? 'selected' : ''}>I (10%)</option>
              <option value="2" ${_config.perks.refundReceipt === 2 ? 'selected' : ''}>II (20%)</option>
            </select>
          </div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-perk-gacha-reset" ${_config.perks.gachaReset ? 'checked' : ''}/>
              Gacha Reset
            </label>
          </div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-perk-token-fortune" ${_config.perks.tokenOfFortune ? 'checked' : ''}/>
              Token of Fortune
            </label>
          </div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-perk-token-luck" ${_config.perks.tokenOfLuck ? 'checked' : ''}/>
              Token of Luck
            </label>
          </div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-perk-proxy-bidder" ${_config.perks.proxyBidder ? 'checked' : ''}/>
              Proxy Bidder (MAX)
            </label>
          </div>
          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" id="cfg-perk-streak-saver" ${_config.perks.streakSaver ? 'checked' : ''}/>
              Streak Saver
            </label>
          </div>

          <div class="param-group" id="perks-derived-box" style="margin-top:12px;padding:10px 12px;background:rgba(0,0,0,0.2);border-radius:8px;font-size:0.85rem;">
            <span id="perks-derived-text"></span>
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
      </div>
    `;

    bindConfigEvents(panel);
    bindLedgerEvents(panel);
    applyPerks();

    // Restore scroll position of config body
    const newBody = panel.querySelector('#config-body');
    if (newBody && prevScrollTop > 0) {
      newBody.scrollTop = prevScrollTop;
    }
  }

  async function importDataFromWebServer() {
    const btn = document.getElementById('btn-import-web');
    const statusEl = document.getElementById('import-web-status');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> Menghubungi Firebase...';
    }
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#c084fc';
      statusEl.innerHTML = '🔄 Mengambil data dari Firestore collection <code>botState/dashboardData</code>...';
    }

    try {
      const d = await FirebaseDB.fetchDashboardData();
      if (!d) {
        throw new Error('Dokumen botState/dashboardData tidak ditemukan di Firestore. Silakan jalankan bot Anda terlebih dahulu agar data terisi.');
      }

      const syncedItems = [];

      // ── 1. Perks sync ──────────────────────────────────────────────────────────
      if (_syncOptions.perks && d.perks && typeof d.perks === 'object') {
        const sd = d.perkStartDay || {};
        _config.perks = {
          ...DEFAULT_CONFIG.perks,
          ..._config.perks,
          ...d.perks,
          piggyBank: migratePerkToArray(d.perks.piggyBank, false, 1, sd.piggyBank || 1),
          earlyBird:  migratePerkToArray(d.perks.earlyBird,  false, 1, sd.earlyBird  || 1),
          nightOwl:   migratePerkToArray(d.perks.nightOwl,  false, 1, sd.nightOwl   || 1),
          bankbook:   migratePerkToArray(d.perks.bankbook,   true,  1, sd.bankbook   || 1),
          vault:      migratePerkToArray(d.perks.vault,      true,  1, sd.vault      || 1),
          highYieldBond: migratePerkToArray(d.perks.highYieldBond, true, 1, sd.highYieldBond || 1),
          timeWeaver: migratePerkToArray(d.perks.timeWeaver, true,  1, sd.timeWeaver || 1),
          loginMultiplier: migratePerkToArray(d.perks.loginMultiplier, true, 1, sd.loginMultiplier || 1),
        };
        applyPerks();
        syncedItems.push('Perks');
      }

      // ── 2. Saldo / Balance sync ───────────────────────────────────────────────
      if (_syncOptions.balance && d.balance !== null && d.balance !== undefined) {
        const ledgerState = Ledger.getState(_config);
        const currentLedger = ledgerState.currentBalance;
        const diff = d.balance - currentLedger;
        if (Math.abs(diff) >= 1) {
          Ledger.add({
            date: Ledger.todayISO(),
            type: diff > 0 ? 'adjustment' : 'expense',
            amount: Math.abs(diff),
            note: `Sync Firebase (saldo aktual ${d.balance} poin)`
          });
        }
        syncedItems.push('Saldo');
      }

      // ── 3. Investasi Aktif sync (Ke Simulator & Ke Ledger) ───────────────────
      let investImported = 0;
      if (_syncOptions.investments && d.investments && Array.isArray(d.investments)) {
        _config.seedInvestments = d.investments.filter(inv => inv.maturityDate && inv.returnAmount);
        _liveInvestments = d.investments;

        // Tampilkan juga di Ledger (Transaction History) sesuai permintaan user
        const existingNotes = new Set(
          Ledger.getAll().map(tx => tx.note)
        );
        d.investments.forEach(inv => {
          if (!inv.maturityDate || !inv.returnAmount) return;
          const matDate = inv.maturityDate.toString().split(' ')[0];
          const noteKey = `Cair Investasi ${inv.amount}pt → ${matDate}`;
          if (!existingNotes.has(noteKey)) {
            Ledger.add({
              date: matDate,
              type: 'maturity',
              amount: inv.returnAmount,
              note: noteKey
            });
            existingNotes.add(noteKey);
            investImported++;
          }
        });
        syncedItems.push(`Investasi (${d.investments.length} item)`);
      }

      // ── 4. Sync Income Harian & Streak ───────────────────────────────────────
      if (_syncOptions.streak) {
        applyPerks();
        const fixedAmt = _config.incomeFixedAmount || 0;
        const rawDailyIncome = d.latestDailyIncome || d.incomeBase;

        if (rawDailyIncome && rawDailyIncome > 0) {
          if (rawDailyIncome > fixedAmt) {
            _config.incomeBase = rawDailyIncome - fixedAmt;
          } else {
            _config.incomeBase = rawDailyIncome;
          }
        } else if (d.loginStreak && d.loginStreak > 0) {
          _config.incomeBase = 10 + (d.loginStreak - 1);
        }
        _config.incomeFixedEnabled = fixedAmt > 0;
        _config.incomeLinearEnabled = true;
        _config.incomeGrowthRate = 1;
        syncedItems.push('Streak');
      }

      // ── 5. Sync Ledger Transactions ──────────────────────────────────────────
      if (_syncOptions.ledger) {
        const remoteLedger = await FirebaseDB.fetchLedgerFromFirebase();
        if (remoteLedger && Array.isArray(remoteLedger.transactions)) {
          const existingIds = new Set(Ledger.getAll().map(tx => tx.id));
          let ledgerTxImported = 0;

          remoteLedger.transactions.forEach(tx => {
            if (!existingIds.has(tx.id)) {
              const isDuplicate = Ledger.getAll().some(
                t => t.date === tx.date && t.type === tx.type && t.amount === tx.amount && t.note === tx.note
              );
              if (!isDuplicate) {
                Ledger.add(tx);
                ledgerTxImported++;
              }
            }
          });
          syncedItems.push(`Ledger (${remoteLedger.transactions.length} item)`);
        }
      }

      saveConfig();
      renderConfigPanel();
      const summaryContainer = document.getElementById('summary-container');
      if (summaryContainer) summaryContainer.innerHTML = '';
      runSimulation();

      const rawPerksList = d.rawPerks && d.rawPerks.length ? d.rawPerks.join(', ') : 'Tidak ada';
      const formattedDate = d.lastUpdated
        ? (d.lastUpdated.toDate ? d.lastUpdated.toDate().toLocaleString('id-ID') : new Date(d.lastUpdated).toLocaleString('id-ID'))
        : 'Baru saja';

      const streakInfo = d.loginStreak 
        ? `🔥 Daily Income Terakhir: <strong>+${_config.incomeBase} Pt</strong> (Streak: ${d.loginStreak})<br>`
        : '';
      const newStatusEl = document.getElementById('import-web-status');
      if (newStatusEl) {
        newStatusEl.style.display = 'block';
        newStatusEl.style.color = '#4ade80';
        newStatusEl.innerHTML = `
          ✅ <strong>Sync Berhasil!</strong><br>
          📌 Item di-sync: <strong>${syncedItems.length ? syncedItems.join(', ') : 'Tidak ada (semua uncheck)'}</strong><br>
          ${_syncOptions.balance && d.balance !== null ? `💰 Saldo: <strong>${d.balance} Poin</strong> (disetel via Ledger)<br>` : ''}
          ${_syncOptions.streak ? streakInfo : ''}
          ${_syncOptions.perks ? `🏷 Perks (${d.rawPerks ? d.rawPerks.length : 0}): ${rawPerksList}<br>` : ''}
          ${_syncOptions.investments ? `📈 Investasi Aktif: <strong>${d.investments ? d.investments.length : 0} item</strong>${investImported > 0 ? ` (${investImported} baru masuk ke Ledger)` : ' (sudah ada di Ledger)'}<br>` : ''}
          <small style="color: #94a3b8; display: block; margin-top: 4px;">
            Update terakhir: ${formattedDate}
          </small>
        `;
      }

    } catch (err) {
      console.error('[Firebase Import Error]', err);
      const newStatusEl = document.getElementById('import-web-status');
      if (newStatusEl) {
        newStatusEl.style.display = 'block';
        newStatusEl.style.color = '#f87171';
        newStatusEl.innerHTML = `
          ❌ <strong>Gagal Sync Data:</strong> ${err.message || 'Koneksi Firestore gagal.'}
        `;
      }
    } finally {
      const newBtn = document.getElementById('btn-import-web');
      if (newBtn) {
        newBtn.disabled = false;
        newBtn.innerHTML = '<span>⚡</span> Sync Data Pilihan (Tarik)';
      }
    }
  }

  function bindConfigEvents(panel) {
    // Run button
    panel.querySelector('#btn-run-sim')?.addEventListener('click', runSimulation);

    // Import from Web button
    panel.querySelector('#btn-import-web')?.addEventListener('click', importDataFromWebServer);

    // Sync options listeners
    panel.querySelector('#sync-opt-perks')?.addEventListener('change', e => { _syncOptions.perks = e.target.checked; });
    panel.querySelector('#sync-opt-balance')?.addEventListener('change', e => { _syncOptions.balance = e.target.checked; });
    panel.querySelector('#sync-opt-streak')?.addEventListener('change', e => { _syncOptions.streak = e.target.checked; });
    panel.querySelector('#sync-opt-investments')?.addEventListener('change', e => { _syncOptions.investments = e.target.checked; });
    panel.querySelector('#sync-opt-ledger')?.addEventListener('change', e => { _syncOptions.ledger = e.target.checked; });

    // Income toggles: show/hide fields based on enabled
    panel.querySelector('#cfg-income-fixed-enabled')?.addEventListener('change', e => {
      const fixedAmt = panel.querySelector('#cfg-income-fixed-amount');
      if (fixedAmt) fixedAmt.closest('.param-group').style.display = e.target.checked ? '' : 'none';
    });
    panel.querySelector('#cfg-income-linear-enabled')?.addEventListener('change', e => {
      const growthGroup = panel.querySelector('#income-growth-group');
      if (growthGroup) growthGroup.style.display = e.target.checked ? '' : 'none';
    });

    // Auto-save + update sweet spots preview on any input change
    const onAnyChange = () => {
      const prevPerks = { ...(_config.perks || {}) };
      readConfig();
      saveConfig();
      const preview = panel.querySelector('#sweet-spots-preview');
      if (preview) {
        const spots = Calculator.generateSweetSpots(_config);
        preview.textContent = spots.slice(0, 30).join(', ') + (spots.length > 30 ? '...' : '');
      }
      const perksChanged = Object.keys(prevPerks).some(
        k => prevPerks[k] !== _config.perks?.[k]
      );
      if (perksChanged) {
        flashPerksBox();
        scheduleReRun(150);
      } else {
        scheduleReRun(500);
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
      incomeType: 'linear',
      incomeFixedEnabled: getCheck('cfg-income-fixed-enabled') ?? true,
      incomeLinearEnabled: getCheck('cfg-income-linear-enabled') ?? true,
      incomeFixedAmount: getNum('cfg-income-fixed-amount', 12),
      incomeBase: getNum('cfg-income-base', 12),
      incomeGrowthRate: getNum('cfg-income-growth', 1),
      incomeDailyEnabled: getCheck('cfg-income-daily-enabled') ?? true,
      weeklyBonusEnabled: getCheck('cfg-bonus-enabled') ?? true,
      weeklyBonus: getNum('cfg-bonus', 50),
      weeklyBonusInterval: getInt('cfg-bonus-interval', 7),
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
      perks: {
        bankbook: readPerkArray('bankbook', true),
        vault: readPerkArray('vault', true),
        piggyBank: readPerkArray('piggyBank', false),
        highYieldBond: readPerkArray('highYieldBond', true),
        timeWeaver: readPerkArray('timeWeaver', true),
        earlyBird: readPerkArray('earlyBird', false),
        nightOwl: readPerkArray('nightOwl', false),
        loginMultiplier: readPerkArray('loginMultiplier', true),
        auctionDiscount: getInt('cfg-perk-auction', 0),
        haggler: getInt('cfg-perk-haggler', 0),
        gachaReset: getCheck('cfg-perk-gacha-reset') ?? false,
        tokenOfFortune: getCheck('cfg-perk-token-fortune') ?? false,
        tokenOfLuck: getCheck('cfg-perk-token-luck') ?? false,
        proxyBidder: getCheck('cfg-perk-proxy-bidder') ?? false,
        refundReceipt: getInt('cfg-perk-refund', 0),
        streakSaver: getCheck('cfg-perk-streak-saver') ?? false,
      },
    };
    if (_prevIB !== _config.initialBalance) {
      console.debug('[DEBUG] readConfig — initialBalance changed via DOM: ', _prevIB, '->', _config.initialBalance, '| cfg-initial value:', get('cfg-initial'));
    }
    applyPerks();
    _config.sweetSpots = Calculator.generateSweetSpots(_config);
  }

  /**
   * Derive simulation variables from active Class Perks.
   * Called after readConfig() so perk toggles override the manual fields.
   */
  function isPerkEntryActiveOnDay(entry, day) {
    const fromDay = entry.fromDay || 1;
    const effectiveDay = entry.timing === 'after' ? fromDay + 1 : fromDay;
    return day >= effectiveDay;
  }

  function applyPerks() {
    const p = _config.perks || {};
    const bankbookRates = [0, 0.005, 0.01, 0.015];

    // Bankbook generate rate (initial/baseline on Day 1)
    const bankbookEntries = Array.isArray(p.bankbook) ? p.bankbook : [];
    const totalGenRate = bankbookEntries
      .filter(e => isPerkEntryActiveOnDay(e, 1))
      .reduce((sum, e) => sum + (bankbookRates[e.tier] || 0) * (e.count || 1), 0);
    _config.generateEnabled = totalGenRate > 0;
    _config.generateRate = totalGenRate;

    // Fixed income from Vault & Piggy Bank (initial/baseline on Day 1)
    const vaultEntries = Array.isArray(p.vault) ? p.vault : [];
    const vaultAmt = vaultEntries
      .filter(e => isPerkEntryActiveOnDay(e, 1))
      .reduce((sum, e) => sum + (e.tier === 2 ? 15 : e.tier === 1 ? 10 : 0) * (e.count || 1), 0);

    const piggyEntries = Array.isArray(p.piggyBank) ? p.piggyBank : [];
    const piggyAmt = piggyEntries
      .filter(e => isPerkEntryActiveOnDay(e, 1))
      .reduce((sum, e) => sum + 5 * (e.count || 1), 0);

    const fixedPerkTotal = vaultAmt + piggyAmt;
    if (fixedPerkTotal > 0) {
      _config.incomeFixedAmount = fixedPerkTotal;
      _config.incomeFixedEnabled = true;
      const fixedInput = document.getElementById('cfg-income-fixed-amount');
      if (fixedInput && document.activeElement !== fixedInput) {
        fixedInput.value = fixedPerkTotal;
      }
      const fixedCheck = document.getElementById('cfg-income-fixed-enabled');
      if (fixedCheck) {
        fixedCheck.checked = true;
      }
    } else {
      _config.incomeFixedAmount = 0;
      const fixedInput = document.getElementById('cfg-income-fixed-amount');
      if (fixedInput && document.activeElement !== fixedInput) {
        fixedInput.value = 0;
      }
    }

    // High Yield Bond: return rate (initial/baseline on Day 1)
    const hybEntries = Array.isArray(p.highYieldBond) ? p.highYieldBond : [];
    const hybBonus = hybEntries
      .filter(e => isPerkEntryActiveOnDay(e, 1))
      .reduce((sum, e) => sum + ([0, 0.02, 0.04, 0.06][e.tier] || 0) * (e.count || 1), 0);
    _config.returnRate = 1.18 + hybBonus;

    // Time Weaver: duration (initial/baseline on Day 1)
    // Only full 24-hour reductions count as 1 day (Math.floor(totalHours / 24))
    const twEntries = Array.isArray(p.timeWeaver) ? p.timeWeaver : [];
    const twTotalHours = twEntries
      .filter(e => isPerkEntryActiveOnDay(e, 1))
      .reduce((sum, e) => sum + (e.tier === 2 ? 24 : e.tier === 1 ? 12 : 0) * (e.count || 1), 0);
    const twDaysReduction = Math.floor(twTotalHours / 24);
    _config.investDuration = Math.max(1, 30 - twDaysReduction);

const derivedEl = document.getElementById('perks-derived-text');
    if (derivedEl) {
      const parts = [];
      if (_config.generateRate > 0) parts.push(`Generate ${(_config.generateRate * 100).toFixed(1)}%/hari`);
      if (_config.incomeFixedAmount > 0 && _config.incomeFixedEnabled !== false) {
        parts.push(`Income tetap ${_config.incomeFixedAmount}/hari`);
      } else if (_config.incomeFixedAmount > 0) {
        parts.push(`Income tetap ${_config.incomeFixedAmount}/hari (Off)`);
      }
      parts.push(`Return ${(_config.returnRate * 100).toFixed(0)}%`);
      parts.push(`Durasi ${_config.investDuration} hari`);

      const formatTimingLabel = e => {
        const h = e.fromDay || 1;
        return e.timing === 'after' ? `H${h} Setelah Login → Cair H${h + 1}` : `H${h} Sebelum Login`;
      };

      const activeParts = [];
      bankbookEntries.forEach(e => activeParts.push(`Bankbook ${['', 'Bronze', 'Silver', 'Gold'][e.tier]}×${e.count || 1} (${formatTimingLabel(e)})`));
      vaultEntries.forEach(e => activeParts.push(`Vault ${['', 'I', 'II'][e.tier]}×${e.count || 1} (${formatTimingLabel(e)})`));
      piggyEntries.forEach(e => activeParts.push(`Piggy Bank×${e.count || 1} (${formatTimingLabel(e)})`));
      hybEntries.forEach(e => activeParts.push(`HYB ${['', 'I', 'II', 'III'][e.tier]}×${e.count || 1} (${formatTimingLabel(e)})`));
      twEntries.forEach(e => activeParts.push(`TimeWeaver ${['', 'I', 'II'][e.tier]}×${e.count || 1} (${formatTimingLabel(e)})`));
      (Array.isArray(p.earlyBird) ? p.earlyBird : []).forEach(e => activeParts.push(`Early Bird×${e.count || 1} (${formatTimingLabel(e)})`));
      (Array.isArray(p.nightOwl) ? p.nightOwl : []).forEach(e => activeParts.push(`Night Owl×${e.count || 1} (${formatTimingLabel(e)})`));
      (Array.isArray(p.loginMultiplier) ? p.loginMultiplier : []).forEach(e => activeParts.push(`Login Mult ${['', 'I', 'II'][e.tier]}×${e.count || 1} (${formatTimingLabel(e)})`));

      const baseHtml = 'Hasil turunan (Hari 1): ' + parts.join(' • ');
      const aktifHtml = activeParts.length
        ? '<br><small style="opacity:0.7">Perk terpasang: ' + activeParts.join(' • ') + '</small>'
        : '';
      derivedEl.innerHTML = baseHtml + aktifHtml;
    }
  }

  function scheduleReRun(delay) {
    if (_reRunTimer) clearTimeout(_reRunTimer);
    _reRunTimer = setTimeout(() => {
      _reRunTimer = null;
      if (_baseResult) runSimulation();
    }, delay);
  }

  function flashPerksBox() {
    const el = document.getElementById('perks-derived-text');
    if (!el) return;
    el.classList.add('perks-flash');
    setTimeout(() => el.classList.remove('perks-flash'), 1200);
  }

  // ── Simulation ────────────────────────────────────────────────────────────
  function buildRuntimeConfig() {
    const cfg = { ..._config };
    cfg.startDate = cfg.startDate || Ledger.todayISO();
    if (cfg.realtimeEnabled !== false) {
      const ledgerState = Ledger.getState(cfg);
      cfg.ledgerState = ledgerState;
    }
    cfg.liveInvestments = _liveInvestments;
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

    // Preserve scroll position and active tab
    const prevScrollTop = content.scrollTop;
    const prevScrollLeft = content.scrollLeft;
    const currentTab = _activeTab || 'calendar';

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
            onclick="syncToFirebase(App.getConfig && App.getConfig())"
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
          <button class="tab-btn ${currentTab === 'calendar' ? 'active' : ''}" data-tab="calendar" role="tab" aria-selected="${currentTab === 'calendar'}" id="tab-btn-calendar">
            📅 Kalender
          </button>
          <button class="tab-btn ${currentTab === 'summary' ? 'active' : ''}" data-tab="summary" role="tab" aria-selected="${currentTab === 'summary'}" id="tab-btn-summary">
            📊 Ringkasan
          </button>
          <button class="tab-btn ${currentTab === 'whatif' ? 'active' : ''}" data-tab="whatif" role="tab" aria-selected="${currentTab === 'whatif'}" id="tab-btn-whatif">
            🔮 What If
          </button>
          <button class="tab-btn ${currentTab === 'botstatus' ? 'active' : ''}" data-tab="botstatus" role="tab" aria-selected="${currentTab === 'botstatus'}" id="tab-btn-botstatus">
            🤖 Status Bot
          </button>
          <button class="tab-btn ${currentTab === 'leaderboardanalytics' ? 'active' : ''}" data-tab="leaderboardanalytics" role="tab" aria-selected="${currentTab === 'leaderboardanalytics'}" id="tab-btn-leaderboardanalytics">
            🏆 Leaderboard Analytic
          </button>
        </div>

        <!-- Tab Panels -->
        <div id="tab-calendar" class="tab-panel ${currentTab === 'calendar' ? 'active' : ''}" role="tabpanel" style="${currentTab === 'calendar' ? '' : 'display:none'}">
          <div id="calendar-container"></div>
        </div>

        <div id="tab-summary" class="tab-panel ${currentTab === 'summary' ? 'active' : ''}" role="tabpanel" style="${currentTab === 'summary' ? '' : 'display:none'}">
          <div id="summary-container"></div>
        </div>

        <div id="tab-whatif" class="tab-panel ${currentTab === 'whatif' ? 'active' : ''}" role="tabpanel" style="${currentTab === 'whatif' ? '' : 'display:none'}">
          <div id="whatif-container"></div>
        </div>

        <div id="tab-botstatus" class="tab-panel ${currentTab === 'botstatus' ? 'active' : ''}" role="tabpanel" style="${currentTab === 'botstatus' ? '' : 'display:none'}">
          <div id="botstatus-container"></div>
        </div>

        <div id="tab-leaderboardanalytics" class="tab-panel ${currentTab === 'leaderboardanalytics' ? 'active' : ''}" role="tabpanel" style="${currentTab === 'leaderboardanalytics' ? '' : 'display:none'}">
          <div id="leaderboard-analytics-container"></div>
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

    // If active tab is not calendar, render its content immediately
    if (currentTab === 'summary') {
      const container = document.getElementById('summary-container');
      if (container) {
        SummaryUI.render(container, _baseResult.summary, _baseResult.records, buildRuntimeConfig());
      }
    } else if (currentTab === 'whatif') {
      const container = document.getElementById('whatif-container');
      if (container) {
        ComparisonUI.render(container);
      }
    } else if (currentTab === 'botstatus') {
      const container = document.getElementById('botstatus-container');
      if (container && typeof BotStatusUI !== 'undefined') {
        BotStatusUI.render(container);
      }
    } else if (currentTab === 'leaderboardanalytics') {
      const container = document.getElementById('leaderboard-analytics-container');
      if (container && typeof LeaderboardAnalyticsUI !== 'undefined') {
        LeaderboardAnalyticsUI.render(container);
      }
    }

    _activeTab = currentTab;

    if (prevScrollTop > 0) content.scrollTop = prevScrollTop;
    if (prevScrollLeft > 0) content.scrollLeft = prevScrollLeft;
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

    if (tabId === 'leaderboardanalytics') {
      const container = document.getElementById('leaderboard-analytics-container');
      if (container && typeof LeaderboardAnalyticsUI !== 'undefined') {
        LeaderboardAnalyticsUI.render(container);
      }
    }
  }

  function renderLedgerItems(transactions) {
    if (!transactions.length) {
      return '<div class="ledger-empty">Belum ada transaksi aktual.</div>';
    }
    return transactions.slice().reverse().map(tx => {
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
      const amtInput = panel.querySelector('#ledger-amount');
      const noteInput = panel.querySelector('#ledger-note');
      const tx = {
        date: panel.querySelector('#ledger-date')?.value || Ledger.todayISO(),
        type: panel.querySelector('#ledger-type')?.value || 'expense',
        amount: amtInput?.value,
        note: noteInput?.value || '',
      };
      if (!Ledger.add(tx)) return;
      if (amtInput) amtInput.value = '';
      if (noteInput) noteInput.value = '';
      readConfig();
      saveConfig();
      renderConfigPanel();
      runSimulation();
    });

    panel.querySelector('#btn-reset-ledger')?.addEventListener('click', () => {
      if (confirm('Apakah Anda yakin ingin menghapus SEMUA transaksi Ledger? Saldo akan kembali mengikuti saldo awal.')) {
        Ledger.removeAll();
        readConfig();
        saveConfig();
        renderConfigPanel();
        runSimulation();
      }
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
      if (targetInput) targetInput.value = '';
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
      _config.perks = { ...DEFAULT_CONFIG.perks, ...(cleanRemote.perks || {}) };
      _config.perkStartDay = { ...DEFAULT_CONFIG.perkStartDay, ...(cleanRemote.perkStartDay || {}) };
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
    setDayOverride: (dayKey, amount) => {
      if (!_config.dayOverrides) _config.dayOverrides = {};
      const num = Math.max(0, parseFloat(amount) || 0);
      _config.dayOverrides[dayKey] = num;
      saveConfig();
      runSimulation();
    },
    clearDayOverride: (dayKey) => {
      if (_config.dayOverrides && _config.dayOverrides[dayKey] !== undefined) {
        delete _config.dayOverrides[dayKey];
        saveConfig();
        runSimulation();
      }
    },
    clearAllDayOverrides: () => {
      _config.dayOverrides = {};
      saveConfig();
      runSimulation();
    },
    setDayIncomeOverride: (dayKey, amount) => {
      if (!_config.dayIncomeOverrides) _config.dayIncomeOverrides = {};
      const num = Math.max(0, parseFloat(amount) || 0);
      _config.dayIncomeOverrides[dayKey] = num;
      saveConfig();
      runSimulation();
    },
    setIncomeOverride: (dayKey, amount) => {
      App.setDayIncomeOverride(dayKey, amount);
    },
    clearDayIncomeOverride: (dayKey) => {
      if (_config.dayIncomeOverrides && _config.dayIncomeOverrides[dayKey] !== undefined) {
        delete _config.dayIncomeOverrides[dayKey];
        saveConfig();
        runSimulation();
      }
    },
    clearIncomeOverride: (dayKey) => {
      App.clearDayIncomeOverride(dayKey);
    },
    clearAllDayIncomeOverrides: () => {
      _config.dayIncomeOverrides = {};
      saveConfig();
      runSimulation();
    },
    clearAllIncomeOverrides: () => {
      App.clearAllDayIncomeOverrides();
    },
    addPerkRow,
    removePerkRow,
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

// ── Firebase Sync Handler (called from sync button) ───────────────────────
async function syncToFirebase(config) {
  const btn = document.getElementById('btn-sync-firebase') || document.getElementById('btn-upload-schedule');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '⏳ Sync Config...';

  try {
    const schedule = (typeof App !== 'undefined' && App.getSchedule) ? App.getSchedule() : [];
    await FirebaseDB.syncToFirebase(config, schedule);
    btn.innerHTML = '✅ Config & Schedule Tersinkron!';

    const txns = Ledger.getAll();
    if (txns.length > 0) {
      btn.innerHTML = '⏳ Sync Ledger...';
      await FirebaseDB.syncLedgerToFirebase(txns);
      btn.innerHTML = `✅ Ledger (${txns.length}) Tersinkron!`;
    }

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
      App.setSchedule(result.schedule);
      console.log('Schedule overridden from Firebase:', result.schedule.length, 'entries');
    }

    // ── Fetch Ledger Transactions ─────────────────────────────────────────
    btn.innerHTML = '⏳ Ambil Ledger...';
    const remoteLedger = await FirebaseDB.fetchLedgerFromFirebase();
    if (remoteLedger && Array.isArray(remoteLedger.transactions)) {
      const existingIds = new Set(Ledger.getAll().map(tx => tx.id));
      let imported = 0;
      remoteLedger.transactions.forEach(tx => {
        if (!existingIds.has(tx.id)) {
          const isDuplicate = Ledger.getAll().some(
            t => t.date === tx.date && t.type === tx.type && t.amount === tx.amount && t.note === tx.note
          );
          if (!isDuplicate) {
            Ledger.add(tx);
            imported++;
          }
        }
      });
      if (imported > 0) {
        console.log('Imported ledger transactions from Firebase:', imported);
      }
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

