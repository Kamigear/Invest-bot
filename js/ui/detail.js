'use strict';

/**
 * Detail UI — Modal panel showing full details for a selected day.
 */
const DetailUI = (() => {
  let _modal = null;
  let _backdrop = null;

  function init() {
    // Create modal elements
    _backdrop = document.createElement('div');
    _backdrop.className = 'modal-backdrop';
    _backdrop.id = 'detail-backdrop';

    _modal = document.createElement('div');
    _modal.className = 'detail-modal';
    _modal.id = 'detail-modal';
    _modal.setAttribute('role', 'dialog');
    _modal.setAttribute('aria-modal', 'true');
    _modal.setAttribute('aria-label', 'Detail Hari');

    document.body.appendChild(_backdrop);
    document.body.appendChild(_modal);

    _backdrop.addEventListener('click', close);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
    });
  }

  function open(record) {
    if (!_modal) init();
    _modal.innerHTML = buildContent(record);
    _modal.classList.add('open');
    _backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';

    const closeBtn = _modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
  }

  function close() {
    if (_modal) _modal.classList.remove('open');
    if (_backdrop) _backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  function getDecisionColor(decision) {
    switch (decision) {
      case 'INVEST': return '#10b981';
      case 'WAIT': return '#ef4444';
      case 'SKIP': return '#94a3b8';
      default: return '#94a3b8';
    }
  }

  function getDecisionEmoji(decision) {
    switch (decision) {
      case 'INVEST': return '📈';
      case 'WAIT': return '⏳';
      case 'SKIP': return '⏸';
      default: return '❓';
    }
  }

  function buildContent(r) {
    const decisionColor = getDecisionColor(r.decision);
    const decisionEmoji = getDecisionEmoji(r.decision);

    // Build active investments table
    const activeInvHtml = r.activeInvestments.length > 0
      ? `
        <div class="detail-section">
          <div class="detail-section-title">💼 Investasi Aktif (${r.activeInvestments.length})</div>
          <table class="detail-inv-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Hari Mulai</th>
                <th>Jumlah</th>
                <th>Cair Hari</th>
                <th>Return</th>
              </tr>
            </thead>
            <tbody>
              ${r.activeInvestments.map(inv => `
                <tr>
                  <td>${inv.id}</td>
                  <td>Hari ${inv.startDay}</td>
                  <td>${Calculator.display(inv.amount)}</td>
                  <td>Hari ${inv.maturityDay}</td>
                  <td class="return-val">+${Calculator.display(inv.expectedReturn)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '';

    // Build matured investments section
    const maturedHtml = r.maturedInvestments.length > 0
      ? `
        <div class="detail-section matured-section">
          <div class="detail-section-title">🟡 Investasi Cair Hari Ini</div>
          ${r.maturedInvestments.map(inv => `
            <div class="matured-item">
              <span>Investasi #${inv.id} (Hari ${inv.startDay})</span>
              <span class="matured-amount">+${Calculator.display(inv.returnAmount)}</span>
            </div>
          `).join('')}
          <div class="matured-total">
            Total Cair: <strong>+${Calculator.display(r.maturedTotal)}</strong>
          </div>
        </div>
      ` : '';

    // Build reasons
    const reasonsHtml = r.reason.length > 0
      ? `
        <div class="detail-section reasons-section">
          <div class="detail-section-title">💡 Alasan Keputusan</div>
          <ul class="reason-list">
            ${r.reason.map(reason => `<li>${reason}</li>`).join('')}
          </ul>
        </div>
      ` : '';

    return `
      <div class="modal-header">
        <div class="modal-day-badge">HARI ${r.day}</div>
        <button class="modal-close" aria-label="Tutup">✕</button>
      </div>

      <div class="modal-body">
        <!-- Decision Banner -->
        <div class="decision-banner" style="--decision-color: ${decisionColor}">
          <span class="decision-emoji">${decisionEmoji}</span>
          <div class="decision-info">
            <div class="decision-label">KEPUTUSAN ALGORITMA</div>
            <div class="decision-value" style="color: ${decisionColor}">${r.decisionLabel}</div>
            ${r.decision === 'INVEST' ? `
              <div class="decision-amount">Invest: <strong>${Calculator.display(r.investedAmount)}</strong> poin</div>
            ` : ''}
            ${r.decision === 'WAIT' ? `
              <div class="decision-amount">Proyeksi investasi: <strong>${Calculator.display(r.projectedInvest)}</strong> poin dalam ${r.waitDays} hari</div>
            ` : ''}
          </div>
        </div>

        <!-- Day Stats Grid -->
        <div class="detail-grid">
          <div class="detail-stat">
            <div class="detail-stat-label">Saldo Sebelum</div>
            <div class="detail-stat-value">${Calculator.display(r.balanceBefore)}</div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-label">Daily Income</div>
            <div class="detail-stat-value income-color">+${Calculator.display(r.dailyIncome)}</div>
          </div>
          ${r.weeklyBonus > 0 ? `
            <div class="detail-stat highlight-bonus">
              <div class="detail-stat-label">🔵 Weekly Bonus</div>
              <div class="detail-stat-value">+${Calculator.display(r.weeklyBonus)}</div>
            </div>
          ` : `
            <div class="detail-stat muted">
              <div class="detail-stat-label">Weekly Bonus</div>
              <div class="detail-stat-value">—</div>
            </div>
          `}
          <div class="detail-stat ${r.generate > 0 ? 'highlight-generate' : 'muted'}">
            <div class="detail-stat-label">🟣 Generate</div>
            <div class="detail-stat-value">${r.generate > 0 ? `+${Calculator.display(r.generate)}` : '—'}</div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-label">Saldo Tersedia</div>
            <div class="detail-stat-value">${Calculator.display(r.balanceBefore + r.dailyIncome + r.weeklyBonus + r.generate + r.maturedTotal)}</div>
          </div>
          ${r.investedAmount > 0 ? `
            <div class="detail-stat highlight-invest">
              <div class="detail-stat-label">🟢 Diinvestasikan</div>
              <div class="detail-stat-value">−${Calculator.display(r.investedAmount)}</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-label">Lost Decimal</div>
              <div class="detail-stat-value ${r.lostDecimal < 1 ? 'good-color' : 'warn-color'}">${Calculator.display(r.lostDecimal)}</div>
            </div>
          ` : ''}
          <div class="detail-stat final-balance">
            <div class="detail-stat-label">Saldo Sesudah</div>
            <div class="detail-stat-value">${Calculator.display(r.balanceAfter)}</div>
          </div>
          <div class="detail-stat total-assets-stat">
            <div class="detail-stat-label">Total Aset</div>
            <div class="detail-stat-value">${Calculator.display(r.totalAssets)}</div>
          </div>
        </div>

        <!-- Matured investments today -->
        ${maturedHtml}

        <!-- Reasons -->
        ${reasonsHtml}

        <!-- Active investments -->
        ${activeInvHtml}

        <!-- Flags indicator -->
        <div class="detail-flags">
          ${r.flags.isInvestDay ? '<span class="flag-pill flag-invest">🟢 Hari Investasi</span>' : ''}
          ${r.flags.isMaturityDay ? '<span class="flag-pill flag-maturity">🟡 Investasi Cair</span>' : ''}
          ${r.flags.isWeeklyBonusDay ? '<span class="flag-pill flag-bonus">🔵 Weekly Bonus</span>' : ''}
          ${r.flags.isGenerateDay ? '<span class="flag-pill flag-generate">🟣 Generate Aktif</span>' : ''}
          ${r.flags.isDelayDay ? '<span class="flag-pill flag-delay">🔴 Sengaja Menunggu</span>' : ''}
          ${r.flags.isSweetSpot ? '<span class="flag-pill flag-sweet">🎯 Sweet Spot</span>' : ''}
        </div>
      </div>
    `;
  }

  return { init, open, close };
})();
