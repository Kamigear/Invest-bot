'use strict';

const Calculator = (() => {
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
   * Get daily income for a given simulation day
   * @param {number} day - Current simulation day (1-indexed)
   * @param {object} config - Simulation configuration
   * @param {string} [date] - ISO date string (YYYY-MM-DD)
   */
  function getDailyIncome(day, config, date = null) {
    const overrides = config.dayIncomeOverrides || config.incomeOverrides || {};
    const hasOverride = overrides[day] !== undefined || overrides[String(day)] !== undefined || (date && overrides[date] !== undefined);
    if (hasOverride) {
      const raw = overrides[day] ?? overrides[String(day)] ?? (date ? overrides[date] : undefined);
      return Math.max(0, parseFloat(raw) || 0);
    }

    let total = 0;

    // Legacy: incomeType single-select mode
    // Only fall through if BOTH new flags are explicitly undefined (legacy config)
    if (config.incomeFixedEnabled === undefined && config.incomeLinearEnabled === undefined && config.incomeType) {
      switch (config.incomeType) {
        case 'fixed': return config.incomeBase;
        case 'custom':
          if (config.incomeCustom && config.incomeCustom[day - 1] !== undefined) return config.incomeCustom[day - 1];
          return config.incomeBase + (day - 1) * config.incomeGrowthRate;
        default:
          return config.incomeBase + (day - 1) * config.incomeGrowthRate;
      }
    }

    // New mode: incomeFixedEnabled=false means perk NOT yet active on this day
    if (config.incomeFixedEnabled === true) {
      total += (config.incomeFixedAmount || 0);
    }
    if (config.incomeLinearEnabled !== false) {
      total += (config.incomeBase || 0) + (day - 1) * (config.incomeGrowthRate || 0);
    }
    return total;
  }

  /**
   * Get weekly bonus for a given date (triggers on Monday)
   */
  function getWeeklyBonus(dateOrDay, config) {
    if (!config.weeklyBonusEnabled) return 0;
    // Accept either date string (YYYY-MM-DD) or day number (for backward compat)
    let isMonday = false;
    if (typeof dateOrDay === 'string' && dateOrDay.includes('-')) {
      const d = new Date(dateOrDay + 'T00:00:00');
      isMonday = d.getDay() === 1; // 0=Sun, 1=Mon
    } else {
      // Fallback: legacy day number — treat day 1 as Monday
      isMonday = ((dateOrDay - 1) % config.weeklyBonusInterval) === 0;
    }
    return isMonday ? config.weeklyBonus : 0;
  }

  /**
   * Calculate generate points from current balance
   * Generate = floor(balance * generateRate)
   */
  function getGenerate(balance, config) {
    if (!config.generateEnabled || config.generateRate <= 0 || balance <= 0) return 0;
    return Math.floor(balance * config.generateRate);
  }

  /**
   * Calculate return amount for an investment (rounded down, decimals are lost)
   */
  function getReturnAmount(investAmount, config) {
    return Math.floor(investAmount * config.returnRate);
  }

  /**
   * Calculate the decimal amount lost due to rounding
   */
  function getLostDecimal(investAmount, config) {
    const raw = investAmount * config.returnRate;
    return parseFloat((raw - Math.floor(raw)).toFixed(4));
  }

  /**
   * Project balance N days into the future (without making investments)
   * Returns { balance, events[] }
   */
  function projectFutureBalance(startDay, startBalance, days, config) {
    let balance = startBalance;
    let lastDayBalanceBefore = startBalance;
    const events = [];
    let totalBonus = 0;
    let totalIncome = 0;
    let totalGenerate = 0;

    for (let d = 1; d <= days; d++) {
      lastDayBalanceBefore = balance;
      const futureDay = startDay + d;
      const date = config.startDate ? addDaysISO(config.startDate, futureDay - 1) : null;
      const income = getDailyIncome(futureDay, config, date);
      const bonus = getWeeklyBonus(date || futureDay, config);
      balance += income + bonus;
      const generate = getGenerate(lastDayBalanceBefore, config);
      balance += generate;

      totalIncome += income;
      totalBonus += bonus;
      totalGenerate += generate;

      if (bonus > 0) {
        events.push({ day: futureDay, daysFromNow: d, type: 'bonus', amount: bonus });
      }
      if (generate > 0) {
        events.push({ day: futureDay, daysFromNow: d, type: 'generate', amount: generate });
      }
    }

    return { balance, lastDayBalanceBefore, totalIncome, totalBonus, totalGenerate, events };
  }

  /**
   * Format number to fixed decimals
   */
  function fmt(n, decimals = 2) {
    return parseFloat(parseFloat(n).toFixed(decimals));
  }

  /**
   * Format number for display
   */
  function display(n, decimals = 2) {
    if (n === 0) return '0';
    return parseFloat(n).toLocaleString('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * Dynamically generate sweet spots where lost decimal <= maxLostDecimal threshold
   */
  function generateSweetSpots(config) {
    const spots = [];
    const min = config.minInvest || 50;
    const max = 10000;
    const limit = config.maxInvest > 0 ? config.maxInvest : max;
    const threshold = config.maxLostDecimal !== undefined ? config.maxLostDecimal : 0.10;
    const r = config.returnRate || 1.18;

    for (let A = min; A <= limit; A++) {
      const returnAmt = A * r;
      const lost = parseFloat((returnAmt % 1).toFixed(4));
      if (lost <= threshold) {
        spots.push(A);
      }
    }
    return spots;
  }

  return {
    getDailyIncome,
    getWeeklyBonus,
    getGenerate,
    getReturnAmount,
    getLostDecimal,
    projectFutureBalance,
    generateSweetSpots,
    fmt,
    display,
  };
})();
