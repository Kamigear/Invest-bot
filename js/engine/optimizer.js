'use strict';

/**
 * Optimizer — Decision engine with lookahead strategy.
 * Determines whether to INVEST, WAIT, or SKIP each day.
 */
const Optimizer = (() => {

  /**
   * Find the best amount to invest given current total balance, balance before today's income, and config.
   */
  function findBestAmount(totalBalance, balanceBefore, config) {
    const limitToBefore = config.limitToBalanceBefore !== false;
    const rawMax = limitToBefore ? (balanceBefore !== undefined ? balanceBefore : totalBalance) : totalBalance;

    // Subtract reserve so the algorithm never invests below the user's minimum cash floor
    const reserve = config.reserveBalance || 0;
    const maxAllowed = rawMax - reserve;

    if (maxAllowed < config.minInvest) return 0;

    let upperLimit = Math.floor(maxAllowed);
    if (config.maxInvest > 0 && upperLimit > config.maxInvest) {
      upperLimit = config.maxInvest;
    }

    // Use pre-generated sweet spots for efficiency
    if (config.sweetSpots && config.sweetSpots.length > 0) {
      // Find the largest sweet spot <= upperLimit (sweetSpots are already >= minInvest)
      for (let i = config.sweetSpots.length - 1; i >= 0; i--) {
        if (config.sweetSpots[i] <= upperLimit) {
          return config.sweetSpots[i];
        }
      }
    }

    // Fallback: search downwards for the nearest sweet spot
    const threshold = config.maxLostDecimal !== undefined ? config.maxLostDecimal : 0.10;
    const r = config.returnRate || 1.18;

    for (let A = upperLimit; A >= config.minInvest; A--) {
      const returnAmt = A * r;
      const lost = parseFloat((returnAmt % 1).toFixed(4));
      if (lost <= threshold) {
        return A; // Found the largest sweet spot <= maxAllowed
      }
    }

    // Fallback if no sweet spot found
    if (config.sweetSpotOnly) return 0;
    return upperLimit;
  }

  /**
   * Find the nearest sweet spot <= balance.
   * Sweet spots are predefined round amounts (config.sweetSpots[]).
   * Returns the largest sweet spot that fits.
   */
  function findSweetSpot(balance, config) {
    const threshold = config.maxLostDecimal !== undefined ? config.maxLostDecimal : 0.10;
    const r = config.returnRate || 1.18;
    const upperLimit = Math.floor(balance);
    
    for (let A = upperLimit; A > 0; A--) {
      const returnAmt = A * r;
      const lost = parseFloat((returnAmt % 1).toFixed(4));
      if (lost <= threshold) return A;
    }
    return 0;
  }

  /**
   * Determine if a given invest amount is on a "sweet spot"
   */
  function isSweetSpot(amount, balance, config) {
    if (amount <= 0) return false;
    const threshold = config.maxLostDecimal !== undefined ? config.maxLostDecimal : 0.10;
    const r = config.returnRate || 1.18;
    const returnAmt = amount * r;
    const lost = parseFloat((returnAmt % 1).toFixed(4));
    return lost <= threshold;
  }

  /**
   * Perform lookahead to find the best future investment opportunity.
   * Returns the best future opportunity or null.
   */
  function doLookahead(currentDay, balance, config, balanceBefore) {
    let bestFuture = null;

    for (let waitDays = 1; waitDays <= config.lookaheadDays; waitDays++) {
      const proj = Calculator.projectFutureBalance(currentDay, balance, waitDays, config);
      const futureAmount = findBestAmount(proj.balance, proj.lastDayBalanceBefore, config);
      if (futureAmount === 0) continue;

      const futureReturn = Calculator.getReturnAmount(futureAmount, config);
      const futureProfit = futureReturn - futureAmount;

      if (!bestFuture || futureProfit > bestFuture.profit) {
        bestFuture = {
          waitDays,
          amount: futureAmount,
          return: futureReturn,
          profit: futureProfit,
          projBalance: proj.balance,
          bonusEvents: proj.events.filter(e => e.type === 'bonus'),
          generateEvents: proj.events.filter(e => e.type === 'generate'),
          lostDecimal: Calculator.getLostDecimal(futureAmount, config),
          lostDecimalPct: futureAmount > 0 ? (Calculator.getLostDecimal(futureAmount, config) / futureAmount) * 100 : 0,
        };
      }
    }

    return bestFuture;
  }

  /**
   * Build reason array for WAIT decision
   */
  function buildWaitReasons(bestFuture, config, noSweetSpotToday) {
    const reasons = [];

    if (bestFuture.bonusEvents.length > 0) {
      const bonus = bestFuture.bonusEvents[0];
      reasons.push(
        `Weekly Bonus +${Calculator.display(config.weeklyBonus)} dalam ${bonus.daysFromNow} hari (Hari ${bonus.day})`
      );
    }

    if (bestFuture.generateEvents.length > 0) {
      const totalGen = bestFuture.generateEvents.reduce((s, e) => s + e.amount, 0);
      reasons.push(`Generate diperkirakan menambah +${Calculator.display(totalGen)} poin`);
    }

    reasons.push(
      `Proyeksi saldo setelah ${bestFuture.waitDays} hari: ${Calculator.display(bestFuture.projBalance)}`
    );
    reasons.push(
      `Investasi ${Calculator.display(bestFuture.amount)} → return ${Calculator.display(bestFuture.return)}`
    );

    if (noSweetSpotToday) {
      reasons.push(`Tidak ada sweet spot hari ini — menunggu sweet spot dalam ${bestFuture.waitDays} hari`);
    } else {
      reasons.push(`vs invest sekarang → return ${Calculator.display(bestFuture.return - bestFuture.profit + bestFuture.amount)}`);
      reasons.push(
        `Keuntungan tambahan dengan menunggu: +${Calculator.display(bestFuture.extraProfit)}`
      );
    }

    return reasons;
  }

  /**
   * Main decision function.
   * Returns: { decision, amount, lostDecimal, returnAmount, profit, reason[], flags }
   */
  function decide(currentDay, balance, activeInvestments, config, balanceBefore) {
    const balBefore = balanceBefore !== undefined ? balanceBefore : balance;
    // Step 1: Can we invest at all?
    const investAmount = findBestAmount(balance, balBefore, config);

    if (investAmount === 0) {
      // If sweetSpotOnly is active, do lookahead to see if waiting enables a sweet spot investment
      if (config.sweetSpotOnly) {
        const bestFuture = doLookahead(currentDay, balance, config, balBefore);
        if (bestFuture && bestFuture.waitDays <= config.maxWaitDays) {
          return {
            decision: 'WAIT',
            amount: 0,
            lostDecimal: 0,
            returnAmount: 0,
            profit: 0,
            waitDays: bestFuture.waitDays,
            projectedInvest: bestFuture.amount,
            projectedReturn: bestFuture.return,
            projectedBalance: bestFuture.projBalance,
            reason: buildWaitReasons(bestFuture, config, true),
            flags: { isSweetSpot: false, isDeliberate: true },
          };
        }
      }

      const reserve = config.reserveBalance || 0;
      const effectiveMax = balBefore - reserve;
      const isReserveBlock = reserve > 0 && effectiveMax < config.minInvest && balBefore >= config.minInvest;
      return {
        decision: 'SKIP',
        amount: 0,
        lostDecimal: 0,
        returnAmount: 0,
        profit: 0,
        reason: isReserveBlock
          ? [
              `🛡️ Saldo Cadangan aktif: ${Calculator.display(reserve)} — saldo tidak boleh dikurangi`,
              `Investable: ${Calculator.display(effectiveMax)} < minimum ${config.minInvest}`,
              'Menunggu saldo tumbuh di atas cadangan',
            ]
          : [
              `Saldo ${Calculator.display(balBefore)} < minimum investasi ${config.minInvest}`,
              'Menunggu saldo terkumpul lebih banyak',
            ],
        flags: { isSweetSpot: false, isDeliberate: isReserveBlock, isReserveBlock },
      };
    }

    const limitToBefore = config.limitToBalanceBefore !== false;
    const maxAllowed = (limitToBefore ? balBefore : balance) - (config.reserveBalance || 0);
    const lostDecimalNow = Calculator.getLostDecimal(investAmount, config);
    const returnNow = Calculator.getReturnAmount(investAmount, config);
    const profitNow = returnNow - investAmount;
    const sweetSpotNow = isSweetSpot(investAmount, balance, config);

    // Step 2: Lookahead — simulate next N days WITHOUT investing
    const bestFuture = doLookahead(currentDay, balance, config, balBefore);
    if (bestFuture) {
      bestFuture.extraProfit = bestFuture.profit - profitNow;
    }

    // Step 3: Should we wait?
    const waitThreshold = profitNow * config.waitThresholdPct;
    const shouldWait =
      bestFuture !== null &&
      bestFuture.extraProfit > waitThreshold &&
      bestFuture.waitDays <= config.maxWaitDays;

    // When sweetSpotOnly is active and today IS a sweet spot, never wait — invest now
    const forceInvestOnSweetSpot = config.sweetSpotOnly && sweetSpotNow;

    if (shouldWait && !forceInvestOnSweetSpot) {
      return {
        decision: 'WAIT',
        amount: 0,
        lostDecimal: 0,
        returnAmount: 0,
        profit: 0,
        waitDays: bestFuture.waitDays,
        projectedInvest: bestFuture.amount,
        projectedReturn: bestFuture.return,
        projectedBalance: bestFuture.projBalance,
        reason: buildWaitReasons(bestFuture, config, false),
        flags: { isSweetSpot: false, isDeliberate: true },
      };
    }

    // Step 4: Invest now
    const reasons = [];
    const lostDecimalPct = investAmount > 0 ? (lostDecimalNow / investAmount) * 100 : 0;

    if (sweetSpotNow) {
      reasons.push('✦ Sweet Spot — efisiensi pembulatan sangat optimal');
    }

    if (lostDecimalNow === 0) {
      reasons.push('Lost Decimal: 0 — investasi sempurna tanpa sisa!');
    } else {
      reasons.push(
        `Lost Decimal: ${Calculator.display(lostDecimalNow)} (${lostDecimalPct.toFixed(1)}%)`
      );
    }

    reasons.push(
      `Expected Return: +${Calculator.display(profitNow)} setelah ${config.investDuration} hari`
    );

    if (bestFuture) {
      if (bestFuture.extraProfit <= 0) {
        reasons.push('Menunggu tidak meningkatkan return — lebih baik invest sekarang');
      } else if (bestFuture.extraProfit <= waitThreshold) {
        reasons.push(
          `Selisih dengan menunggu hanya +${Calculator.display(bestFuture.extraProfit)} — tidak signifikan`
        );
      }
    }

    // Check if this is near a sweet spot threshold
    if (config.sweetSpots && config.sweetSpots.length > 0) {
      const nearestHigher = config.sweetSpots.find(sp => sp > balance);
      if (nearestHigher) {
        const diff = nearestHigher - balance;
        if (diff > 0 && diff < balance * 0.1) {
          reasons.push(
            `Mendekati Sweet Spot ${nearestHigher} (kurang ${Calculator.display(diff)})`
          );
        }
      }
    }

    return {
      decision: 'INVEST',
      amount: investAmount,
      lostDecimal: lostDecimalNow,
      returnAmount: returnNow,
      profit: profitNow,
      reason: reasons,
      flags: { isSweetSpot: sweetSpotNow, isDeliberate: false },
    };
  }

  return { decide, findBestAmount, findSweetSpot, isSweetSpot };
})();
