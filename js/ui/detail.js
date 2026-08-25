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

    const bodyEl = _modal.querySelector('.modal-body');
    if (bodyEl) bodyEl.scrollTop = 0;

    const closeBtn = _modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    const btnOverride = _modal.querySelector('#btn-modal-override');
    if (btnOverride) {
      btnOverride.addEventListener('click', () => {
        const userInput = prompt(`[Hari ke-${record.day}] Masukkan nominal investasi manual (contoh: 2, atau 0 untuk membatalkan):`, record.investedAmount || 0);
        if (userInput !== null) {
          const val = parseFloat(userInput);
          if (!isNaN(val)) {
            App.setDayOverride(record.day, val);
            close();
          }
        }
      });
    }

    const btnClearOverride = _modal.querySelector('#btn-modal-clear-override');
    if (btnClearOverride) {
      btnClearOverride.addEventListener('click', () => {
        App.clearDayOverride(record.day);
        close();
      });
    }
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
          <div style="overflow-x: auto;">
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
                    <td>${inv.startSource === 'ledger' ? '📘 ' + inv.id : inv.id}</td>
                    <td>Hari ${inv.startDay}</td>
                    <td>${Calculator.display(inv.amount)}</td>
                    <td>Hari ${inv.maturityDay}</td>
                    <td class="return-val">+${Calculator.display(inv.expectedReturn)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : '';

    // Build matured investments section
    const maturedHtml = r.maturedInvestments.length > 0
      ? `
        <div class="detail-section matured-section">
          <div class="detail-section-title">🟡 Investasi Cair Hari Ini</div>
          ${r.maturedInvestments.map(inv => `
            <div class="matured-item">
              <span>${inv.startSource === 'ledger' ? '📘 Ledger Invest ' : 'Investasi #'}${inv.id} (Hari ${inv.startDay})</span>
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

        <!-- Manual Override Control Box -->
        <div style="margin: 12px 0; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div style="font-size: 13px;">
            ✏️ <strong>Manual Investment Override</strong>
            ${r.isOverride ? `<span style="color:#f59e0b; display:block; font-size:11px; margin-top:2px;">Status: Custom nominal ${r.investedAmount} pt</span>` : `<span style="color:#94a3b8; display:block; font-size:11px; margin-top:2px;">Status: Mengikuti Rekomendasi Algoritma</span>`}
          </div>
          <div style="display:flex; gap:6px; flex-shrink: 0;">
            <button id="btn-modal-override" type="button" style="padding: 6px 12px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
              ${r.isOverride ? '✏️ Ubah Nominal' : '✏️ Override Nominal'}
            </button>
            ${r.isOverride ? `
              <button id="btn-modal-clear-override" type="button" style="padding: 6px 10px; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                ❌ Reset
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Day Stats Grid -->
        <div class="detail-grid">
          <div class="detail-stat">
            <div class="detail-stat-label">Saldo Sebelum</div>
            <div class="detail-stat-value">${Calculator.display(r.balanceBefore)}</div>
          </div>
          <div class="detail-stat ${r.totalDayIncome > 0 ? 'highlight-bonus' : ''}">
            <div class="detail-stat-label">💵 Daily Income</div>
            <div class="detail-stat-value income-color">+${Calculator.display(r.totalDayIncome !== undefined ? r.totalDayIncome : (r.dailyIncome + r.weeklyBonus + (r.generate || 0)))}</div>
          </div>
          ${r.ledgerNet && r.ledgerNet !== 0 ? `
            <div class="detail-stat" style="border: 1px dashed rgba(16,185,129,0.3); background: rgba(16,185,129,0.02);">
              <div class="detail-stat-label">🔧 Ledger Net</div>
              <div class="detail-stat-value" style="color: ${r.ledgerNet >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">
                ${r.ledgerNet >= 0 ? '+' : ''}${Calculator.display(r.ledgerNet)}
              </div>
            </div>
           ` : ''}
          <div class="detail-stat">
            <div class="detail-stat-label">Saldo Tersedia</div>
            <div class="detail-stat-value">${Calculator.display(r.balanceBefore + (r.totalDayIncome !== undefined ? r.totalDayIncome : (r.dailyIncome + r.weeklyBonus + (r.generate || 0))) + r.maturedTotal + (r.ledgerNet || 0) - (r.ledgerInvestTotal || 0))}</div>
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
          ${r.ledgerInvestTotal > 0 ? `
            <div class="detail-stat highlight-invest">
              <div class="detail-stat-label">📘 Ledger Invest</div>
              <div class="detail-stat-value">−${Calculator.display(r.ledgerInvestTotal)}</div>
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

        <!-- Income Breakdown Section -->
        ${(() => {
          const linearVal = r.incomeLinear !== undefined ? r.incomeLinear : 0;
          const vaultVal = r.vaultIncome !== undefined ? r.vaultIncome : 0;
          const piggyVal = r.piggyBankIncome !== undefined ? r.piggyBankIncome : 0;
          const otherFixedVal = r.otherFixedIncome !== undefined ? r.otherFixedIncome : (r.incomeFixed ? Math.max(0, r.incomeFixed - vaultVal - piggyVal) : 0);
          const generateVal = r.generate || 0;
          const bonusVal = r.weeklyBonus || 0;
          const maturedVal = r.maturedTotal || 0;
          const manualVal = r.manualIncome || 0;
          const ledgerIncomeVal = (r.ledgerTxns || [])
            .filter(tx => ['income', 'bonus', 'maturity', 'adjustment'].includes(tx.type))
            .reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);

          // totalIncomeToday includes ALL income (login + vault + piggy + otherFixed + generate + bonus + matured + manual + ledger)
          const totalIncomeToday = Calculator.fmt(linearVal + vaultVal + piggyVal + otherFixedVal + generateVal + bonusVal + maturedVal + manualVal + ledgerIncomeVal);

          return `
            <div class="detail-section income-breakdown-card">
              <div class="detail-section-title">💵 Rincian Pemasukan Hari Ini (+${Calculator.display(totalIncomeToday)})</div>
              <div class="income-breakdown-list">
                ${linearVal > 0 ? `
                  <div class="income-breakdown-item">
                    <span class="income-item-title">🎁 Daily Login Streak (Linear)</span>
                    <span class="income-item-val">+${Calculator.display(linearVal)} pt</span>
                  </div>
                ` : ''}
                ${vaultVal > 0 ? `
                  <div class="income-breakdown-item">
                    <span class="income-item-title">🏦 Perk Vault</span>
                    <span class="income-item-val">+${Calculator.display(vaultVal)} pt</span>
                  </div>
                ` : ''}
                ${piggyVal > 0 ? `
                  <div class="income-breakdown-item">
                    <span class="income-item-title">🐷 Perk Piggy Bank</span>
                    <span class="income-item-val">+${Calculator.display(piggyVal)} pt</span>
                  </div>
                ` : ''}
                ${otherFixedVal > 0 ? `
                  <div class="income-breakdown-item">
                    <span class="income-item-title">💵 Pemasukan Tetap</span>
                    <span class="income-item-val">+${Calculator.display(otherFixedVal)} pt</span>
                  </div>
                ` : ''}
                ${generateVal > 0 ? `
                  <div class="income-breakdown-item">
                    <span class="income-item-title">🟣 Bankbook Generate</span>
                    <span class="income-item-val">+${Calculator.display(generateVal)} pt</span>
                  </div>
                ` : ''}
                 ${bonusVal > 0 ? `
                   <div class="income-breakdown-item">
                     <span class="income-item-title">🔵 Weekly Bonus (Hari Senin)</span>
                     <span class="income-item-val">+${Calculator.display(bonusVal)} pt</span>
                   </div>
                 ` : ''}
                 ${maturedVal > 0 ? `
                   <div class="income-breakdown-item">
                     <span class="income-item-title">🟡 Investasi Cair (Maturity)</span>
                     <span class="income-item-val">+${Calculator.display(maturedVal)} pt</span>
                   </div>
                 ` : ''}
                ${manualVal > 0 ? `
                  <div class="income-breakdown-item">
                    <span class="income-item-title">💰 Manual Income</span>
                    <span class="income-item-val">+${Calculator.display(manualVal)} pt</span>
                  </div>
                ` : ''}
                ${ledgerIncomeVal > 0 ? `
                  <div class="income-breakdown-item">
                    <span class="income-item-title">🔧 Ledger Income / Adjustment</span>
                    <span class="income-item-val">+${Calculator.display(ledgerIncomeVal)} pt</span>
                  </div>
                ` : ''}
                ${totalIncomeToday === 0 ? `
                  <div class="income-breakdown-item muted">
                    <span class="income-item-title">Tidak ada pemasukan hari ini</span>
                    <span class="income-item-val">0 pt</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        })()}

        <!-- Matured investments today -->
        ${maturedHtml}

        <!-- Ledger transactions today -->
        ${r.ledgerTxns && r.ledgerTxns.length > 0 ? `
          <div class="detail-section">
            <div class="detail-section-title">🔧 Transaksi Ledger Hari Ini (${r.ledgerTxns.length})</div>
            <div style="overflow-x: auto;">
              <table class="detail-inv-table">
                <thead>
                  <tr>
                    <th>Tipe</th>
                    <th>Nominal</th>
                    <th>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  ${r.ledgerTxns.map(tx => `
                    <tr>
                      <td><strong>${Ledger.typeLabel(tx.type)}</strong></td>
                      <td style="color:${['income', 'bonus', 'maturity', 'adjustment'].includes(tx.type) ? 'var(--accent-green)' : 'var(--accent-red)'}">
                        ${['income', 'bonus', 'maturity', 'adjustment'].includes(tx.type) ? '+' : '-'}${Calculator.display(tx.amount)}
                      </td>
                      <td>${tx.note || '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Reasons -->
        ${reasonsHtml}

        <!-- Active investments -->
        ${activeInvHtml}

        <!-- Flags indicator -->
        <div class="detail-flags">
          ${r.flags.isInvestDay ? '<span class="flag-pill flag-invest">🟢 Hari Investasi</span>' : ''}
          ${r.flags.isMaturityDay ? '<span class="flag-pill flag-maturity">🟡 Investasi Cair</span>' : ''}
          ${r.flags.isDelayDay ? '<span class="flag-pill flag-delay">🔴 Sengaja Menunggu</span>' : ''}
          ${r.flags.isSweetSpot ? '<span class="flag-pill flag-sweet">🎯 Sweet Spot</span>' : ''}
          ${r.flags.hasLedgerInvestment ? '<span class="flag-pill flag-invest">📘 Ledger Invest</span>' : ''}
        </div>
      </div>
    `;
  }

  return { init, open, close };
})();
