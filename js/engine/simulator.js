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

  /**
   * Run a complete simulation.
   * @param {object} config - Simulation configuration
   * @returns {{ records: DayRecord[], summary: Summary }}
   */
  function run(config) {
    // Generate dynamic sweet spots based on returnRate & maxLostDecimal
    config.sweetSpots = Calculator.generateSweetSpots(config);

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

    const investmentSchedule = []; // Track all investment decisions

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
      const balanceBefore = Calculator.fmt(balance);

      // ── Step 1: Weekly Bonus ────────────────────────────────────
      const weeklyBonus = Calculator.getWeeklyBonus(today, config);
      balance += weeklyBonus;
      totalWeeklyBonus = Calculator.fmt(totalWeeklyBonus + weeklyBonus);

      // ── Step 2: Daily Income (Linear Growth) ────────────────────
      const dailyIncome = config.incomeDailyEnabled !== false
        ? Calculator.getDailyIncome(day, config)
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
          const returnAmt = Calculator.getReturnAmount(inv.amount, config);
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
      // The algorithm's projection for subsequent days is NOT affected —
      // balance continues growing from the algorithm prediction baseline.
      const todayTxns = ledgerByDate[today] || [];
      let ledgerIncome = 0;
      let ledgerExpense = 0;
      for (const tx of todayTxns) {
        const amt = parseFloat(tx.amount) || 0;
        if (tx.type === 'expense' || tx.type === 'invest') {
          ledgerExpense += amt;
        } else {
          // income, bonus, maturity, adjustment
          ledgerIncome += amt;
        }
      }
      const ledgerNet = Calculator.fmt(ledgerIncome - ledgerExpense);
      // Apply to balance for THIS day only; algorithm continues from here
      balance += ledgerNet;
      totalLedgerNet = Calculator.fmt(totalLedgerNet + ledgerNet);

      // ── Step 4: Generate (after ALL inflows incl. ledger) ───────
      const generate = Calculator.getGenerate(balance, config);
      balance += generate;
      totalGenerate = Calculator.fmt(totalGenerate + generate);

      // ── Step 5: Optimizer Decision ──────────────────────────────
      const result = Optimizer.decide(day, balance, [...activeInvestments], config, balanceBefore);

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
          maturityDay: day + config.investDuration,
          expectedReturn: Calculator.fmt(Calculator.getReturnAmount(investedAmount, config)),
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
      records.push({
        day,
        date: today,
        balanceBefore,
        balanceAfter,
        dailyIncome: Calculator.fmt(dailyIncome),
        manualIncome: Calculator.fmt(dayManualIncome),
        weeklyBonus: Calculator.fmt(weeklyBonus),
        generate: Calculator.fmt(generate),
        investedAmount: Calculator.fmt(investedAmount),
        lostDecimal: Calculator.fmt(lostDecimal),
        maturedTotal: Calculator.fmt(maturedTotal),
        maturedInvestments: maturedToday,
        activeInvestments: activeClones,
        activeCount: activeClones.length,
        totalAssets,
        ledgerNet,
        ledgerTxns: todayTxns,
        decision: result.decision,
        decisionLabel: getDecisionLabel(result, config),
        waitDays: result.waitDays || 0,
        projectedInvest: result.projectedInvest || 0,
        projectedReturn: result.projectedReturn || 0,
        reason: result.reason || [],
        flags: {
          isInvestDay: result.decision === 'INVEST',
          isMaturityDay: maturedToday.length > 0,
          isWeeklyBonusDay: weeklyBonus > 0,
          isGenerateDay: generate > 0,
          isDelayDay: result.decision === 'WAIT',
          isSweetSpot: result.flags?.isSweetSpot || false,
          isManualIncomeDay: dayManualIncome > 0,
          hasLedgerEntry: todayTxns.length > 0,
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

    for (let day = 1; day <= config.simulationDays; day++) {
      const date = addDaysISO(config.startDate, day - 1);
      const balanceBefore = balance;
      balance += Calculator.getDailyIncome(day, config);
      balance += Calculator.getWeeklyBonus(date, config);
      balance += Calculator.getGenerate(balance, config);

      for (let i = activeInv.length - 1; i >= 0; i--) {
        if (activeInv[i].maturityDay <= day) {
          const ret = Calculator.getReturnAmount(activeInv[i].amount, config);
          balance += ret;
          totalReturn += ret;
          activeInv.splice(i, 1);
        }
      }

      const amt = Optimizer.findBestAmount(balance, balanceBefore, config);
      if (amt >= config.minInvest) {
        balance -= amt;
        activeInv.push({ amount: amt, maturityDay: day + config.investDuration });
      }
    }

    const activeExp = activeInv.reduce((s, inv) => s + Calculator.getReturnAmount(inv.amount, config), 0);
    return Calculator.fmt(balance + activeExp);
  }

  return { run };
})();
