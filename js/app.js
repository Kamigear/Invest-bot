'use strict';

/**
 * =============================================================================
 * app.js — Investment Monitoring Dashboard Orchestrator
 * =============================================================================
 * Sistem telah direstrukturisasi. Web ini HANYA berfungsi sebagai:
 *   1. 🏆 Leaderboard & Competitor Analytics (Real-time)
 *   2. 🤖 Bot Status & Automated Decision Log
 *
 * Semua keputusan investasi sepenuhnya dikelola oleh Bot di Orange Pi
 * melalui Decision Engine yang berjalan otomatis jam 23:00 WIB.
 * =============================================================================
 */

// ── Monitoring App ────────────────────────────────────────────────────────────
const MonitoringApp = (() => {
  let _leaderboardUnsubscribe = null;
  let _decisionLogUnsubscribe = null;
  let _activeTab = 'leaderboardanalytics';

  // ── Tab Rendering ───────────────────────────────────────────────────────
  function renderShell() {
    const content = document.getElementById('main-content');
    if (!content) return;

    content.innerHTML = `
      <div class="results-wrapper">

        <!-- Header Info Bar -->
        <div class="result-summary-bar" style="justify-content:center;gap:24px;">
          <div class="rsb-item">
            <span class="rsb-label">Mode</span>
            <span class="rsb-value" style="color:#4facfe;">📊 Monitoring Real-Time</span>
          </div>
          <div class="rsb-item">
            <span class="rsb-label">Bot Engine</span>
            <span id="bot-engine-status" class="rsb-value">⏳ Memeriksa...</span>
          </div>
          <div class="rsb-item">
            <span class="rsb-label">Keputusan Terakhir</span>
            <span id="last-decision-badge" class="rsb-value">—</span>
          </div>
        </div>

        <!-- Tabs -->
        <div class="tab-bar" role="tablist">
          <button class="tab-btn ${_activeTab === 'leaderboardanalytics' ? 'active' : ''}"
            data-tab="leaderboardanalytics" role="tab"
            aria-selected="${_activeTab === 'leaderboardanalytics'}">
            🏆 Leaderboard Analytics
          </button>
          <button class="tab-btn ${_activeTab === 'botstatus' ? 'active' : ''}"
            data-tab="botstatus" role="tab"
            aria-selected="${_activeTab === 'botstatus'}">
            🤖 Status Bot & Decision Log
          </button>
        </div>

        <!-- Tab Panels -->
        <div id="tab-leaderboardanalytics" class="tab-panel ${_activeTab === 'leaderboardanalytics' ? 'active' : ''}"
          role="tabpanel" style="${_activeTab === 'leaderboardanalytics' ? '' : 'display:none'}">
          <div id="leaderboard-analytics-container"></div>
        </div>

        <div id="tab-botstatus" class="tab-panel ${_activeTab === 'botstatus' ? 'active' : ''}"
          role="tabpanel" style="${_activeTab === 'botstatus' ? '' : 'display:none'}">
          <div id="botstatus-container"></div>
        </div>

      </div>
    `;

    // Bind tab click
    content.addEventListener('click', handleTabClick);

    // Render active tab
    renderActiveTab();

    // Load last decision info into header
    loadDecisionSummary();
  }

  function renderActiveTab() {
    if (_activeTab === 'leaderboardanalytics') {
      const container = document.getElementById('leaderboard-analytics-container');
      if (container && typeof LeaderboardAnalyticsUI !== 'undefined') {
        LeaderboardAnalyticsUI.render(container);
      }
    } else if (_activeTab === 'botstatus') {
      const container = document.getElementById('botstatus-container');
      if (container && typeof BotStatusUI !== 'undefined') {
        BotStatusUI.render(container);
      }
    }
  }

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

    // Lazy-render tab content
    renderActiveTab();
  }

  // ── Load Decision Summary dari Firestore untuk Header Bar ──────────────
  async function loadDecisionSummary() {
    try {
      if (!FirebaseDB || !FirebaseDB.isAuthReady()) return;

      const engineStatusEl  = document.getElementById('bot-engine-status');
      const lastDecisionEl  = document.getElementById('last-decision-badge');

      // Subscribe to decisionLog real-time
      if (typeof firebase !== 'undefined') {
        firebase.firestore()
          .collection('botState').doc('decisionLog')
          .onSnapshot(snap => {
            if (!snap.exists) return;
            const data = snap.data();
            const lastDecision = data.lastDecision;
            const lastReason   = data.lastDecisionReason || '';

            if (engineStatusEl) {
              engineStatusEl.textContent = '🟢 Online';
              engineStatusEl.style.color = '#10b981';
            }

            if (lastDecisionEl) {
              if (lastDecision === 'YES') {
                lastDecisionEl.innerHTML = `<span style="color:#10b981;">✅ YA — Invest ${data.lastDecisionAmount || '?'} Pt</span>`;
              } else if (lastDecision === 'NO') {
                lastDecisionEl.innerHTML = `<span style="color:#f59e0b;">⏸ TIDAK — ${lastReason}</span>`;
              } else {
                lastDecisionEl.textContent = '—';
              }
            }
          }, err => {
            console.warn('decisionLog subscription error:', err);
            if (engineStatusEl) {
              engineStatusEl.textContent = '🔴 Offline';
              engineStatusEl.style.color = '#ef4444';
            }
          });
      }
    } catch (e) {
      console.warn('Gagal load decision summary:', e);
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────
  async function init() {
    // Sidebar tidak dipakai lagi (tidak ada config panel)
    const sidebar = document.getElementById('config-panel');
    if (sidebar) sidebar.style.display = 'none';

    // Setup Firebase anonymous auth jika diperlukan
    try {
      if (FirebaseDB.initAnonymousAuth) {
        await FirebaseDB.initAnonymousAuth();
      }
    } catch (e) {
      console.log('Anonymous auth not required:', e.message);
    }

    renderShell();
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────
  function cleanup() {
    if (_leaderboardUnsubscribe) {
      _leaderboardUnsubscribe();
      _leaderboardUnsubscribe = null;
    }
    if (_decisionLogUnsubscribe) {
      _decisionLogUnsubscribe();
      _decisionLogUnsubscribe = null;
    }
  }

  return { init, cleanup };
})();

// ── Bootstrap + Auth Guard ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const overlay   = document.getElementById('auth-overlay');
  const authInput = document.getElementById('auth-input');
  const authBtn   = document.getElementById('auth-btn');
  const authError = document.getElementById('auth-error');
  const setupLink = document.getElementById('auth-setup-link');

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
        await MonitoringApp.init();
      } else {
        authError.style.display = 'block';
        authInput.value = '';
        authInput.focus();
      }
    } catch (e) {
      // Firebase tidak tersedia — izinkan masuk (offline mode)
      console.warn('Auth offline, skipping:', e);
      sessionStorage.setItem(SESSION_KEY, '1');
      overlay.style.display = 'none';
      await MonitoringApp.init();
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

  // Jika sudah auth di session ini — skip overlay
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    if (overlay) overlay.style.display = 'none';
    await MonitoringApp.init();
  } else {
    if (overlay) overlay.style.display = 'flex';
  }

  window.addEventListener('beforeunload', () => {
    MonitoringApp.cleanup?.();
  });

  FirebaseDB.initAnonymousAuth().catch(() => {});
});
