'use strict';

/**
 * Simulator — Core simulation loop.
 *
 * Ledger behaviour (per plan 1785720286196-date-based-transactions):
 * - Simulation always starts from config.initialBalance
 * - Ledger transactions are applied ONLY on their specific date as a visual
 *   adjustment to balance — future days continue from the algorithm prediction
 * - Bot balance is NEVER used as saldo awal; the user sets it manually
 */
const Simulator = (() => {

  function addDaysISO(startDate, offset) {
    if (!startDate) return '';
    const [year, month, day] = startDate.split('-').map(Number);
    const date = new Date(year, month - 1, day + offset);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  // Cache sweet spots by return rate to avoid recomputation per day
  const _sweetSpotCache = {};

  /**
   * Compute perk-derived config values for a specific simulation day.
   * Perks only affect the simulation from their configured start day
   * (perkStartDay). Sweet spots are cached per return rate.
   */
  function getDayConfig(day, config) {
    const p = config.perks || {};
    const cfg = { ...config };

    const bankbookRates = [0, 0.005, 0.01, 0.015];
    const hybRates = [0, 0.02, 0.04, 0.06];

    // Helper: evaluates if perk acquisition entry is active on current simulation day
    // 'after' (Dapat Setelah Login) -> takes effect on day >= fromDay + 1
    // 'before' (Dapat Sebelum Login) -> takes effect on day >= fromDay
    const isEntryActive = e => {
      const fromDay = e.fromDay || 1;
      const effectiveDay = e.timing === 'after' ? fromDay + 1 : fromDay;
      return day >= effectiveDay;
    };

    // Bankbook (Generate): sum of all active bankbook entries on this day
    const bankbookEntries = Array.isArray(p.bankbook) ? p.bankbook : [];
    const activeGenRate = bankbookEntries
      .filter(isEntryActive)
      .reduce((sum, e) => sum + (bankbookRates[e.tier] || 0) * (e.count || 1), 0);
    cfg.generateEnabled = activeGenRate > 0;
    cfg.generateRate = activeGenRate;

    // Vault & Piggy Bank (Fixed Income): sum of active entries on this day
    const vaultEntries = Array.isArray(p.vault) ? p.vault : [];
    const vaultAmt = vaultEntries
      .filter(isEntryActive)
      .reduce((sum, e) => sum + (e.tier === 2 ? 15 : e.tier === 1 ? 10 : 0) * (e.count || 1), 0);

    const piggyEntries = Array.isArray(p.piggyBank) ? p.piggyBank : [];
    const piggyAmt = piggyEntries
      .filter(isEntryActive)
      .reduce((sum, e) => sum + 5 * (e.count || 1), 0);

    const totalFixedFromPerk = vaultAmt + piggyAmt;
    if (totalFixedFromPerk > 0) {
      cfg.incomeFixedEnabled = true;
      cfg.incomeFixedAmount = totalFixedFromPerk;
    } else if (config.incomeFixedEnabled !== false) {
      cfg.incomeFixedEnabled = true;
      cfg.incomeFixedAmount = config.incomeFixedAmount || 0;
    } else {
      cfg.incomeFixedEnabled = false;
      cfg.incomeFixedAmount = 0;
    }

    // High Yield Bond: sum of return rate bonuses on this day
    const hybEntries = Array.isArray(p.highYieldBond) ? p.highYieldBond : [];
    const hybBonus = hybEntries
      .filter(isEntryActive)
      .reduce((sum, e) => sum + (hybRates[e.tier] || 0) * (e.count || 1), 0);
    cfg.returnRate = 1.18 + hybBonus;

    // Time Weaver: reduction per stack × count on this day
    const twEntries = Array.isArray(p.timeWeaver) ? p.timeWeaver : [];
    const twReduction = twEntries
      .filter(isEntryActive)
      .reduce((sum, e) => sum + (e.tier === 2 ? 2 : 1) * (e.count || 1), 0);
    cfg.investDuration = Math.max(1, (config.investDuration || 30) - twReduction);

    // Daily Login Perks: Early Bird (+2) & Night Owl (+4) on this day
    const ebEntries = Array.isArray(p.earlyBird) ? p.earlyBird : [];
    const ebAdd = ebEntries
      .filter(isEntryActive)
      .reduce((sum, e) => sum + 2 * (e.count || 1), 0);

    const noEntries = Array.isArray(p.nightOwl) ? p.nightOwl : [];
    const noAdd = noEntries
      .filter(isEntryActive)
      .reduce((sum, e) => sum + 4 * (e.count || 1), 0);

    let baseIncome = (config.incomeBase !== undefined ? config.incomeBase : 12) + ebAdd + noAdd;

    // Login Multiplier: compounded per stack on this day
    const lmEntries = Array.isArray(p.loginMultiplier) ? p.loginMultiplier : [];
    const activeLm = lmEntries.filter(isEntryActive);
    if (activeLm.length > 0) {
      let combinedMult = 1;
      for (const e of activeLm) {
        const singleMult = e.tier === 2 ? 1.10 : e.tier === 1 ? 1.05 : 1;
        combinedMult *= Math.pow(singleMult, e.count || 1);
      }
      baseIncome = Math.round(baseIncome * combinedMult);
    }
    cfg.incomeBase = baseIncome;

    const srKey = String(cfg.returnRate) + '_' + String(cfg.investDuration);
    if (!_sweetSpotCache[srKey]) {
      _sweetSpotCache[srKey] = Calculator.generateSweetSpots(cfg);
    }
    cfg.sweetSpots = _sweetSpotCache[srKey];

    return cfg;
  }

  /**
   * Run a complete simulation.
   * @param {object} config - Simulation configuration
   * @returns {{ records: DayRecord[], summary: Summary }}
   */
  function run(config) {
    const records = [];
    const activeInvestments = []; // { id, startDay, amount, maturityDay, expectedReturn }

    // Accumulators for summary
    let totalInvestCount = 0;
    let totalInvestedAmount = 0;
    let totalReturnReceived = 0;
    let totalReturnProfit = 0;
    let totalGenerate = 0;
    let totalLostDecimal = 0;
    let totalWeeklyBonus = 0;
    let totalDailyIncome = 0;
    let totalManualIncome = 0;
    let totalWaitDays = 0;
    let totalSkipDays = 0;
    let totalLedgerNet = 0;
    let totalLedgerInvest = 0;
    let totalLedgerInvestCount = 0;

    const investmentSchedule = []; // Track all investment decisions

    // ── Seed Active Investments from Firebase (rep panel "Active Investments") ─
    // These are real investments already running on the web, passed directly
    // as activeInvestments so the simulator accounts for their maturity correctly.
    // We do NOT use Ledger maturity entries for this — that was the old approach.
    if (config.seedInvestments && config.seedInvestments.length > 0) {
      const startDate = config.startDate || '';
      config.seedInvestments.forEach((inv, i) => {
        if (!inv.maturityDate || !inv.returnAmount) return;
        const matDateStr = inv.maturityDate.toString().split(' ')[0]; // YYYY-MM-DD
        // Calculate maturityDay relative to startDate (day 1 = startDate)
        let maturityDay = 1;
        if (startDate && matDateStr) {
          const [sy, sm, sd] = startDate.split('-').map(Number);
          const [my, mm, md] = matDateStr.split('-').map(Number);
          const start = new Date(sy, sm - 1, sd);
          const mat = new Date(my, mm - 1, md);
          const diffMs = mat - start;
          maturityDay = Math.round(diffMs / 86400000) + 1; // day 1-indexed
        }
        if (maturityDay < 1) return; // already matured, skip
        activeInvestments.push({
          id: 'F' + (i + 1),
          startDay: 0,           // started before simulation
          startSource: 'firebase',
          amount: inv.amount || 0,
          maturityDay,
          expectedReturn: inv.returnAmount,
        });
      });
    }

    // Pre-index ledger transactions by ISO date for O(1) lookup per day
    const ledgerByDate = {};
    const ledgerTxns = config.ledgerState?.transactions || [];
    for (const tx of ledgerTxns) {
      if (!ledgerByDate[tx.date]) ledgerByDate[tx.date] = [];
      ledgerByDate[tx.date].push(tx);
    }

    // Algorithm projection balance — always starts from initialBalance
    let balance = config.initialBalance;

    for (let day = 1; day <= config.simulationDays; day++) {
      const today = addDaysISO(config.startDate, day - 1);
      const dayCfg = getDayConfig(day, config);
      const balanceBefore = Calculator.fmt(balance);

      // ── Step 1: Weekly Bonus ────────────────────────────────────
      const weeklyBonus = Calculator.getWeeklyBonus(today, config);
      balance += weeklyBonus;
      totalWeeklyBonus = Calculator.fmt(totalWeeklyBonus + weeklyBonus);

      // ── Step 2: Daily Income (Linear Growth) ────────────────────
      const dailyIncome = dayCfg.incomeDailyEnabled !== false
        ? Calculator.getDailyIncome(day, dayCfg)
        : 0;
      balance += dailyIncome;
      totalDailyIncome = Calculator.fmt(totalDailyIncome + dailyIncome);

      // ── Step 2.5: Manual Income (day-specific entries) ──────────
      const dayManualIncome = (config.manualIncome || [])
        .filter(entry => entry.day === day)
        .reduce((sum, entry) => sum + entry.amount, 0);
      balance += dayManualIncome;
      totalManualIncome = Calculator.fmt(totalManualIncome + dayManualIncome);

      // ── Step 3: Mature Investments ──────────────────────────────
      const maturedToday = [];
      let maturedTotal = 0;

      for (let i = activeInvestments.length - 1; i >= 0; i--) {
        const inv = activeInvestments[i];
        if (inv.maturityDay <= day) {
           const returnAmt = Calculator.getReturnAmount(inv.amount, dayCfg);
          balance += returnAmt;
          maturedTotal = Calculator.fmt(maturedTotal + returnAmt);
          totalReturnReceived = Calculator.fmt(totalReturnReceived + returnAmt);
          totalReturnProfit = Calculator.fmt(totalReturnProfit + (returnAmt - inv.amount));
          maturedToday.push({ ...inv, returnAmount: Calculator.fmt(returnAmt) });
          activeInvestments.splice(i, 1);
        }
      }

      // ── Step 3.5: Ledger Adjustments (date-specific only) ───────
      // Transactions only affect THIS day's displayed balance.
      // The algorithm projection for subsequent days is NOT affected —
      // balance continues growing from the algorithm prediction baseline.
      // ── Step 4: Generate (BEFORE ledger expenses per user request) ─
      const generate = Calculator.getGenerate(balance, dayCfg);
      balance += generate;
      totalGenerate = Calculator.fmt(totalGenerate + generate);

      const todayTxns = ledgerByDate[today] || [];
      let ledgerIncome = 0;
      let ledgerExpense = 0;
      let ledgerInvestmentsToday = [];

      for (const tx of todayTxns) {
        const amt = parseFloat(tx.amount) || 0;
        if (tx.type === 'invest') {
          // Ledger investments become REAL investments in activeInvestments
          const inv = {
            id: 'L' + tx.id,
            startDay: day,
            startSource: 'ledger',
            startSourceId: tx.id,
            amount: amt,
            maturityDay: day + dayCfg.investDuration,
            expectedReturn: Calculator.getReturnAmount(amt, dayCfg),
          };
          activeInvestments.push(inv);
          investmentSchedule.push({
            id: inv.id,
            investDay: day,
            investDate: today,
            amount: amt,
            maturityDay: inv.maturityDay,
            maturityDate: addDaysISO(config.startDate, inv.maturityDay - 1),
            expectedReturn: Calculator.fmt(inv.expectedReturn),
            profit: Calculator.fmt(inv.expectedReturn - amt),
            balanceBefore,
            ledgerTxnId: tx.id,
            ledgerNote: tx.note || '',
          });
          ledgerInvestmentsToday.push({ ...inv, id: tx.id, note: tx.note || '' });
          balance -= amt;
          totalLedgerInvest = Calculator.fmt(totalLedgerInvest + amt);
          totalLedgerInvestCount++;
          totalInvestCount++;
          totalInvestedAmount = Calculator.fmt(totalInvestedAmount + amt);
          totalLostDecimal = Calculator.fmt(totalLostDecimal + Calculator.getLostDecimal(amt, dayCfg));
        } else if (tx.type === 'expense') {
          ledgerExpense += amt;
        } else if (tx.type === 'maturity' && tx.note && tx.note.startsWith('Cair Investasi ')) {
          // Purely visual/history entry for Ledger display — maturity income is already handled by seedInvestments / activeInvestments
        } else {
          ledgerIncome += amt;
        }
      }

      const ledgerNet = Calculator.fmt(ledgerIncome - ledgerExpense);
      // Apply ledger expenses/income to balance (investments already subtracted above)
      balance += ledgerNet;
      totalLedgerNet = Calculator.fmt(totalLedgerNet + ledgerNet);

      // ── Step 5: Optimizer Decision ──────────────────────────────
      const overrides = config.dayOverrides || {};
      const hasDayOverride = overrides[day] !== undefined || overrides[String(day)] !== undefined || (today && overrides[today] !== undefined);
      const rawOverride = overrides[day] ?? overrides[String(day)] ?? (today ? overrides[today] : undefined);
      const overrideAmt = hasDayOverride ? Math.max(0, parseFloat(rawOverride) || 0) : undefined;

      let result;
      if (hasDayOverride) {
        if (overrideAmt > 0) {
          result = {
            decision: 'INVEST',
            amount: Math.min(balance, overrideAmt),
            lostDecimal: Calculator.getLostDecimal(overrideAmt, dayCfg),
            reason: [`Manual override disetel ke ${overrideAmt}`],
            isOverride: true
          };
        } else {
          result = {
            decision: 'SKIP',
            amount: 0,
            lostDecimal: 0,
            reason: ['Manual override dibatalkan (0)'],
            isOverride: true
          };
        }
      } else {
        result = Optimizer.decide(day, balance, [...activeInvestments], dayCfg, balanceBefore);
      }

      let investedAmount = 0;
      let lostDecimal = 0;

      if (result.decision === 'INVEST') {
        investedAmount = result.amount;
        lostDecimal = result.lostDecimal;
        balance -= investedAmount;
        totalInvestedAmount = Calculator.fmt(totalInvestedAmount + investedAmount);
        totalLostDecimal = Calculator.fmt(totalLostDecimal + lostDecimal);
        totalInvestCount++;

        const inv = {
          id: totalInvestCount,
          startDay: day,
          amount: investedAmount,
          maturityDay: day + dayCfg.investDuration,
          expectedReturn: Calculator.fmt(Calculator.getReturnAmount(investedAmount, dayCfg)),
        };

        activeInvestments.push(inv);
        investmentSchedule.push({
          id: inv.id,
          investDay: day,
          investDate: today,
          amount: investedAmount,
          maturityDay: inv.maturityDay,
          maturityDate: addDaysISO(config.startDate, inv.maturityDay - 1),
          expectedReturn: inv.expectedReturn,
          profit: Calculator.fmt(inv.expectedReturn - investedAmount),
          balanceBefore,
          isOverride: hasDayOverride,
        });
      } else if (result.decision === 'WAIT') {
        totalWaitDays++;
      } else {
        totalSkipDays++;
      }

      // ── Step 6: Compute Post-Day State ──────────────────────────
      const balanceAfter = Calculator.fmt(balance);
      const activeClones = activeInvestments.map(inv => ({ ...inv }));
      const totalActiveExpected = activeClones.reduce((s, inv) => s + inv.expectedReturn, 0);
      const totalAssets = Calculator.fmt(balanceAfter + totalActiveExpected);

      // ── Step 7: Build Day Record ────────────────────────────────
       const isEntryActive = e => {
        const fromDay = e.fromDay || 1;
        const effectiveDay = e.timing === 'after' ? fromDay + 1 : fromDay;
        return day >= effectiveDay;
      };
      const vaultAmt = (Array.isArray(dayCfg.perks?.vault) ? dayCfg.perks.vault : [])
        .filter(isEntryActive)
        .reduce((sum, e) => sum + (e.tier === 2 ? 15 : e.tier === 1 ? 10 : 0) * (e.count || 1), 0);
      const piggyAmt = (Array.isArray(dayCfg.perks?.piggyBank) ? dayCfg.perks.piggyBank : [])
        .filter(isEntryActive)
        .reduce((sum, e) => sum + 5 * (e.count || 1), 0);

      // Decompose dailyIncome into fixed and linear components for reporting
      const incomeFixed = dayCfg.incomeFixedEnabled === true ? (dayCfg.incomeFixedAmount || 0) : 0;
      const incomeLinear = dayCfg.incomeLinearEnabled !== false
        ? (dayCfg.incomeBase || 0) + (day - 1) * (dayCfg.incomeGrowthRate || 0)
        : 0;

      const ledgerMaturityTotal = todayTxns
        .filter(tx => tx.type === 'maturity')
        .reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);

      records.push({
        day,
        date: today,
        balanceBefore,
        balanceAfter,
        totalDayIncome: Calculator.fmt(dailyIncome + weeklyBonus + generate), // true unified income: login + perk fixed + weekly bonus + bankbook generate
        dailyIncome: Calculator.fmt(dailyIncome),
        incomeFixed: Calculator.fmt(incomeFixed),
        vaultIncome: Calculator.fmt(vaultAmt),
        piggyBankIncome: Calculator.fmt(piggyAmt),
        otherFixedIncome: Calculator.fmt(Math.max(0, incomeFixed - vaultAmt - piggyAmt)),
        incomeLinear: Calculator.fmt(incomeLinear),
        manualIncome: Calculator.fmt(dayManualIncome),
        weeklyBonus: Calculator.fmt(weeklyBonus),
        generate: Calculator.fmt(generate),
        investedAmount: Calculator.fmt(investedAmount),
        lostDecimal: Calculator.fmt(lostDecimal),
        maturedTotal: Calculator.fmt(maturedTotal),
        ledgerMaturityTotal: Calculator.fmt(ledgerMaturityTotal),
        totalMaturedTotal: Calculator.fmt(maturedTotal + ledgerMaturityTotal),
        maturedInvestments: maturedToday,
        activeInvestments: activeClones,
        activeCount: activeClones.length,
        totalAssets,
        ledgerNet,
        ledgerTxns: todayTxns,
        ledgerInvestments: ledgerInvestmentsToday,
        ledgerInvestTotal: Calculator.fmt(ledgerInvestmentsToday.reduce((s, inv) => s + inv.amount, 0)),
        decision: result.decision,
        decisionLabel: hasDayOverride ? (result.decision === 'INVEST' ? `📈 Invest (Manual: ${investedAmount})` : '⏸ Skip (Manual: 0)') : getDecisionLabel(result, dayCfg),
        waitDays: result.waitDays || 0,
        projectedInvest: result.projectedInvest || 0,
        projectedReturn: result.projectedReturn || 0,
        reason: result.reason || [],
        isOverride: hasDayOverride,
        overrideAmount: overrideAmt,
        flags: {
          isInvestDay: result.decision === 'INVEST',
          isMaturityDay: maturedToday.length > 0 || ledgerMaturityTotal > 0,
          isWeeklyBonusDay: weeklyBonus > 0,
          isGenerateDay: generate > 0,
          isDelayDay: result.decision === 'WAIT',
          isSweetSpot: result.flags?.isSweetSpot || false,
          isManualIncomeDay: dayManualIncome > 0,
          isOverride: hasDayOverride,
          hasLedgerEntry: todayTxns.length > 0,
          hasLedgerInvestment: ledgerInvestmentsToday.length > 0,
          hasLedgerMaturity: ledgerMaturityTotal > 0,
        },
      });
    }

    // ── Final Summary ────────────────────────────────────────────
    const finalRecord = records[records.length - 1];
    const efficiency = totalInvestedAmount > 0
      ? Calculator.fmt(((totalInvestedAmount - totalLostDecimal) / totalInvestedAmount) * 100)
      : 100;

    const summary = {
      simulationDays: config.simulationDays,
      startDate: config.startDate || '',
      isRealtime: false,
      initialBalance: config.initialBalance,
      finalBalance: Calculator.fmt(balance),
      finalTotalAssets: finalRecord?.totalAssets ?? 0,
      totalInvestCount,
      totalInvestedAmount,
      totalReturnReceived,
      totalReturnProfit,
      totalGenerate,
      totalLostDecimal,
      totalWeeklyBonus,
      totalDailyIncome,
      totalManualIncome,
      totalLedgerNet,
      totalLedgerInvest,
      totalLedgerInvestCount,
      totalWaitDays,
      totalSkipDays,
      efficiency,
      investmentSchedule,
      baselineAssets: calcBaselineAssets(config),
      outperformancePct: 0,
    };

    summary.outperformancePct = summary.baselineAssets > 0
      ? Calculator.fmt(((summary.finalTotalAssets - summary.baselineAssets) / summary.baselineAssets) * 100)
      : 0;

    return { records, summary };
  }

  function getDecisionLabel(result, config) {
    if (result.decision === 'INVEST') {
      if (result.flags?.isSweetSpot) return '🎯 Sweet Spot';
      return '📈 Investasi';
    }
    if (result.decision === 'WAIT') return '⏳ Menunggu';
    return '⏸ Skip';
  }

  /**
   * Simple baseline: invest every single day possible (no lookahead).
   */
  function calcBaselineAssets(config) {
    let balance = config.initialBalance;
    const activeInv = [];
    let totalReturn = 0;
    let totalGenerate = 0;

    for (let day = 1; day <= config.simulationDays; day++) {
      const date = addDaysISO(config.startDate, day - 1);
      const dayCfg = getDayConfig(day, config);
      const balanceBefore = balance;
      balance += Calculator.getDailyIncome(day, dayCfg);
      balance += Calculator.getWeeklyBonus(date, config);
      balance += Calculator.getGenerate(balance, dayCfg);

      for (let i = activeInv.length - 1; i >= 0; i--) {
        if (activeInv[i].maturityDay <= day) {
          const ret = Calculator.getReturnAmount(activeInv[i].amount, dayCfg);
          balance += ret;
          totalReturn += ret;
          activeInv.splice(i, 1);
        }
      }

      const amt = Optimizer.findBestAmount(balance, balanceBefore, dayCfg);
      if (amt >= config.minInvest) {
        balance -= amt;
        activeInv.push({ amount: amt, maturityDay: day + dayCfg.investDuration });
      }
    }

    const activeExp = activeInv.reduce((s, inv) => s + Calculator.getReturnAmount(inv.amount, config), 0);
    return Calculator.fmt(balance + activeExp);
  }

  return { run };
})();
