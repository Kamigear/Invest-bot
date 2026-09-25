'use strict';

/**
 * =============================================================================
 * app.js — Investment Monitoring Dashboard Orchestrator
 * =============================================================================
 * Sistem telah direstrukturisasi. Web ini HANYA berfungsi sebagai:
 *   1. 🏆 Leaderboard & Competitor Analytics (Real-time)
 *   2. 🤖 Bot Status & Automated Decision Log
 *
 * Semua keputusan investasi sepenuhnya dikelola oleh Bot di Orange Pi / GitHub Actions
 * melalui Decision Engine yang berjalan otomatis jam 01:00 WIB.
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
        <div class="result-summary-bar" style="justify-content:center;gap:20px;flex-wrap:wrap;">
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
          <div class="rsb-item" style="display:flex;align-items:center;gap:8px;">
            <span id="user-display" class="rsb-value" style="font-size:12px;color:#94a3b8;">—</span>
            <button id="logout-btn" type="button" title="Keluar dari sesi" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer;">Keluar</button>
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

    renderShell();

    // Attach logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (confirm('Yakin ingin keluar dari dashboard monitoring?')) {
          await FirebaseDB.logout();
        }
      });
    }

    const user = FirebaseDB.getCurrentUser();
    const userDisplay = document.getElementById('user-display');
    if (userDisplay && user) {
      userDisplay.textContent = user.email || 'Admin';
    }
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
document.addEventListener('DOMContentLoaded', () => {
  const overlay       = document.getElementById('auth-overlay');
  const googleBtn     = document.getElementById('google-login-btn');
  const emailForm     = document.getElementById('email-login-form');
  const authEmail     = document.getElementById('auth-email');
  const authPassword  = document.getElementById('auth-password');
  const emailBtn      = document.getElementById('email-login-btn');
  const authError     = document.getElementById('auth-error');
  const authStatus    = document.getElementById('auth-status');

  function showError(msg) {
    if (authStatus) authStatus.style.display = 'none';
    if (authError) {
      authError.textContent = msg;
      authError.style.display = 'block';
    }
  }

  function showStatus(msg) {
    if (authError) authError.style.display = 'none';
    if (authStatus) {
      authStatus.textContent = msg;
      authStatus.style.display = 'block';
    }
  }

  function clearAlerts() {
    if (authError) authError.style.display = 'none';
    if (authStatus) authStatus.style.display = 'none';
  }

  function getErrorMessage(error) {
    if (!error) return 'Terjadi kesalahan autentikasi.';
    switch (error.code) {
      case 'auth/popup-closed-by-user':
        return 'Jendela login Google ditutup sebelum selesai.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email atau password salah.';
      case 'auth/invalid-email':
        return 'Format email tidak valid.';
      case 'auth/too-many-requests':
        return 'Terlalu banyak percobaan gagal. Silakan coba beberapa saat lagi.';
      default:
        return error.message || 'Gagal masuk. Periksa koneksi internet Anda.';
    }
  }

  // Google Login
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      clearAlerts();
      googleBtn.disabled = true;
      showStatus('Membuka jendela login Google...');
      try {
        await FirebaseDB.loginWithGoogle();
      } catch (err) {
        showError(getErrorMessage(err));
      } finally {
        googleBtn.disabled = false;
      }
    });
  }

  // Email / Password Login
  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();
      const email = authEmail.value.trim();
      const password = authPassword.value;
      if (!email || !password) return;

      emailBtn.disabled = true;
      emailBtn.textContent = 'Memverifikasi...';
      showStatus('Memverifikasi kredensial...');

      try {
        await FirebaseDB.loginWithEmail(email, password);
      } catch (err) {
        showError(getErrorMessage(err));
      } finally {
        emailBtn.disabled = false;
        emailBtn.textContent = 'Masuk dengan Email';
      }
    });
  }

  // Monitor Auth State (Single Source of Truth)
  FirebaseDB.onAuthStateChanged(async (user) => {
    if (user) {
      // Periksa apakah user diizinkan
      const isAllowed = FirebaseDB.isEmailAllowed(user.email);
      if (!isAllowed) {
        showError(`⛔ Akses Ditolak: Akun (${user.email}) tidak berhak mengakses dashboard monitoring ini.`);
        await FirebaseDB.logout();
        if (overlay) overlay.style.display = 'flex';
        return;
      }

      // Akses diterima
      clearAlerts();
      if (overlay) overlay.style.display = 'none';
      await MonitoringApp.init();

      const allowedList = FirebaseDB.getAllowedEmails();
      if (allowedList.length === 0) {
        console.warn(`[InvestBot Security] TIPS: Daftarkan email "${user.email}" ke ALLOWED_EMAILS di js/firebase.js dan firestore.rules agar dashboard terkunci eksklusif.`);
      }
    } else {
      // User belum login atau telah logout
      MonitoringApp.cleanup();
      const content = document.getElementById('main-content');
      if (content) content.innerHTML = '';
      if (overlay) overlay.style.display = 'flex';
    }
  });

  window.addEventListener('beforeunload', () => {
    MonitoringApp.cleanup?.();
  });
});
