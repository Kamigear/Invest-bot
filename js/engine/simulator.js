'use strict';

/**
 * Simulator — Core simulation loop.
 * Runs day-by-day and produces a full record for each day.
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
    let balance = config.initialBalance;
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
    let totalWaitDays = 0;
    let totalSkipDays = 0;

    const investmentSchedule = []; // Track all investment decisions

    for (let day = 1; day <= config.simulationDays; day++) {
      const date = addDaysISO(config.startDate, day - 1);
      const balanceBefore = Calculator.fmt(balance);

      // ── Step 1: Daily Income ─────────────────────────────────
      const dailyIncome = config.incomeDailyEnabled !== false ? Calculator.getDailyIncome(day, config) : 0;
      balance += dailyIncome;
      totalDailyIncome = Calculator.fmt(totalDailyIncome + dailyIncome);

      // ── Step 2: Weekly Bonus ─────────────────────────────────
      const weeklyBonus = Calculator.getWeeklyBonus(day, config);
      balance += weeklyBonus;
      totalWeeklyBonus = Calculator.fmt(totalWeeklyBonus + weeklyBonus);

      // ── Step 3: Generate ─────────────────────────────────────
      const generate = Calculator.getGenerate(balance, config);
      balance += generate;
      totalGenerate = Calculator.fmt(totalGenerate + generate);

      // ── Step 4: Mature Investments ───────────────────────────
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

      // ── Step 6: Optimizer Decision ───────────────────────────
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
          investDate: date,
          amount: investedAmount,
          maturityDay: inv.maturityDay,
          maturityDate: addDaysISO(config.startDate, inv.maturityDay - 1),
          expectedReturn: inv.expectedReturn,
          profit: Calculator.fmt(inv.expectedReturn - investedAmount),
          balanceBefore: balanceBefore,
        });
      } else if (result.decision === 'WAIT') {
        totalWaitDays++;
      } else {
        totalSkipDays++;
      }

      // ── Step 7: Compute Post-Day State ───────────────────────
      const balanceAfter = Calculator.fmt(balance);
      const activeClones = activeInvestments.map(inv => ({ ...inv }));
      const totalActiveExpected = activeClones.reduce((s, inv) => s + inv.expectedReturn, 0);
      const totalAssets = Calculator.fmt(balanceAfter + totalActiveExpected);

      // ── Step 8: Build Day Record ─────────────────────────────
      records.push({
        day,
        date,
        balanceBefore,
        balanceAfter,
        dailyIncome: Calculator.fmt(dailyIncome),
        weeklyBonus: Calculator.fmt(weeklyBonus),
        generate: Calculator.fmt(generate),
        investedAmount: Calculator.fmt(investedAmount),
        lostDecimal: Calculator.fmt(lostDecimal),
        maturedTotal: Calculator.fmt(maturedTotal),
        maturedInvestments: maturedToday,
        activeInvestments: activeClones,
        activeCount: activeClones.length,
        totalAssets,
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
        },
      });
    }

    // ── Final Summary ─────────────────────────────────────────
    const finalRecord = records[records.length - 1];
    const efficiency = totalInvestedAmount > 0
      ? Calculator.fmt(((totalInvestedAmount - totalLostDecimal) / totalInvestedAmount) * 100)
      : 100;

    const summary = {
      simulationDays: config.simulationDays,
      startDate: config.startDate || '',
      isRealtime: config.realtimeEnabled !== false && !!config.ledgerState,
      actualTransactionCount: config.ledgerState?.transactions?.length || 0,
      actualNet: config.ledgerState?.netActual || 0,
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
      totalWaitDays,
      totalSkipDays,
      efficiency,
      investmentSchedule,
      // Comparison with "invest every day" strategy
      baselineAssets: calcBaselineAssets(config),
      outperformancePct: 0, // Will be filled after baseline
    };

    // Calculate outperformance vs baseline
    summary.outperformancePct = summary.baselineAssets > 0
      ? Calculator.fmt(((summary.finalTotalAssets - summary.baselineAssets) / summary.baselineAssets) * 100)
      : 0;

    return { records, summary };
  }

  /**
   * Get human-readable decision label
   */
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
      const balanceBefore = balance;
      balance += Calculator.getDailyIncome(day, config);
      balance += Calculator.getWeeklyBonus(day, config);
      balance += Calculator.getGenerate(balance, config);

      // Mature
      for (let i = activeInv.length - 1; i >= 0; i--) {
        if (activeInv[i].maturityDay <= day) {
          const ret = Calculator.getReturnAmount(activeInv[i].amount, config);
          balance += ret;
          totalReturn += ret;
          activeInv.splice(i, 1);
        }
      }

      // Invest every day if possible using findBestAmount
      const amt = Optimizer.findBestAmount(balance, balanceBefore, config);
      if (amt >= config.minInvest) {
        balance -= amt;
        activeInv.push({
          amount: amt,
          maturityDay: day + config.investDuration,
        });
      }
    }

    const activeExp = activeInv.reduce((s, inv) => s + Calculator.getReturnAmount(inv.amount, config), 0);
    return Calculator.fmt(balance + activeExp);
  }

  return { run };
})();
