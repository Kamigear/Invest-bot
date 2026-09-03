/**
 * =============================================================================
 * decisionEngine.js — 100% Automated Investment Decision Engine (23:00 WIB)
 * =============================================================================
 * Dipanggil setiap pukul 23:00 WIB oleh cron di index.js.
 * Mengimplementasikan Dynamic Chasing & Compound Snowball Strategy:
 *
 * Rule 1 — Dynamic Target Reserve (The Chaser Rule):
 *   Target_Reserve = Saldo Kelas Tepat Di Atas + 50 Pt
 *   Jika (Saldo - Invest) < Target_Reserve → TIDAK
 *
 * Rule 2 — Pace Dominance Check:
 *   Jika Pace_Our < Pace_Rank1 → TIDAK (Tahan saldo, biarkan Bankbook 1% bekerja)
 *
 * Rule 3 — Rank Vulnerability Check (Pertahanan Belakang):
 *   Jika Gap_Behind < Rencana_Invest + 30 Pt → TIDAK
 *
 * Rule 4 — Adaptive Overflow Execution:
 *   Invest = min(Saldo - Target_Reserve, HARD_MAX_INVEST)
 *   Jika Invest < 50 Pt (min invest) → TIDAK
 *
 * Safety System (Fail-Closed):
 *   Layer 1 — Fail-Closed Network: Jika offline/scrape gagal → otomatis TIDAK
 *   Layer 2 — Scrape Anomaly Filter: 3x konsistensi sebelum data dianggap valid
 *   Layer 3 — Hard Circuit Breaker: HARD_MAX_INVEST & HARD_MIN_RESERVE terkunci hardcoded
 *   Layer 4 — Idempotency Lock: Cek Firestore sebelum buat jadwal duplikat
 *   Layer 5 — Remote Emergency Freeze: Cek EMERGENCY_FREEZE di Firestore
 * =============================================================================
 */

'use strict';

const { getDoc, setDoc, serverTimestamp } = require('./firebase');
const { Logger } = require('./logger');
const { withRetry } = require('./retry');
const { sendAlert } = require('./alert');

// ── Konstanta Safety System ───────────────────────────────────────────────────
const HARD_MAX_INVEST   = parseInt(process.env.HARD_MAX_INVEST,   10) || 100; // Batas invest per hari (hardcoded)
const HARD_MIN_RESERVE  = parseInt(process.env.HARD_MIN_RESERVE,  10) || 300; // Batas bawah saldo absolut (hardcoded)
const MIN_INVEST_AMOUNT = 50;  // Minimum nominal investasi di server
const INVEST_RETURN_RATE = 1.18;
const INVEST_DURATION_DAYS = 30;

// ── Identitas Kelas Kita ──────────────────────────────────────────────────────
const OUR_CLASS_ID       = process.env.REP_CLASS_ID || '4';
const OUR_CLASS_PATTERNS = ['kaleb', 'mr kaleb', 'class mr kaleb'];

// ── Safety Constants ──────────────────────────────────────────────────────────
const DEFAULT_RETRY       = { retries: 3, baseDelayMs: 2000 };
const SCRAPE_MAX_ATTEMPTS = 3;
const SCRAPE_INTERVAL_MS  = 20000; // 20 detik antar attempt

// ── Helpers ───────────────────────────────────────────────────────────────────
function findOurClass(classes = []) {
  return classes.find(c =>
    String(c.classId) === String(OUR_CLASS_ID) ||
    OUR_CLASS_PATTERNS.some(p => String(c.name || '').toLowerCase().includes(p))
  ) || null;
}

function todayInvId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `inv_${y}-${m}-${dd}`;
}

function tomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Log Keputusan ke Firestore ────────────────────────────────────────────────
async function logDecision({ decision, reason, amount, details, metrics }) {
  try {
    const dateKey = new Date().toISOString().slice(0, 10);
    await withRetry(
      () => setDoc('botState/decisionLog', {
        [dateKey]: {
          decision,
          reason,
          amount,
          details,
          metrics: metrics || {},
          decidedAt: serverTimestamp(),
        },
        lastDecision:       decision,
        lastDecisionAt:     serverTimestamp(),
        lastDecisionReason: reason,
        lastDecisionAmount: amount,
      }, { merge: true }),
      { label: 'decision:logDecision', ...DEFAULT_RETRY }
    );
  } catch (e) {
    Logger.warning('decisionEngine: Gagal simpan log keputusan ke Firestore:', { error: e.message });
  }
}

// ── Main Function: Evaluasi & Putuskan ───────────────────────────────────────
async function evaluateAndDecide() {
  Logger.banner('DECISION ENGINE (23:00) — Evaluasi Keputusan Investasi Dimulai');

  // ── Safety Layer 5: Remote Emergency Freeze ──────────────────────────────
  try {
    const controlDoc = await withRetry(
      () => getDoc('botState/control'),
      { label: 'decision:emergencyCheck', ...DEFAULT_RETRY }
    );
    if (controlDoc.exists && controlDoc.data().EMERGENCY_FREEZE === true) {
      Logger.warning('EMERGENCY_FREEZE aktif di Firestore — Batalkan evaluasi.');
      await sendAlert('⛔ EMERGENCY FREEZE aktif!\nBot tidak akan invest hari ini. Set EMERGENCY_FREEZE=false di Firestore untuk melanjutkan.');
      return { decision: 'NO', reason: 'EMERGENCY_FREEZE', amount: 0 };
    }
  } catch (e) {
    Logger.warning('decisionEngine: Gagal cek EMERGENCY_FREEZE, lanjut:', { error: e.message });
  }

  // ── Safety Layer 4: Idempotency Lock ─────────────────────────────────────
  const entryId = todayInvId();
  try {
    const existingDoc = await withRetry(
      () => getDoc(`schedules/${entryId}`),
      { label: 'decision:idempotency', ...DEFAULT_RETRY }
    );
    if (existingDoc.exists) {
      const status = existingDoc.data().status;
      if (['PENDING', 'EXECUTING', 'DONE'].includes(status)) {
        Logger.info(`Jadwal ${entryId} sudah ada (status: ${status}). Lewati.`);
        return { decision: 'SKIP', reason: 'ALREADY_SCHEDULED', amount: existingDoc.data().amount || 0 };
      }
    }
  } catch (e) {
    Logger.warning('decisionEngine: Gagal cek idempotency, lanjut:', { error: e.message });
  }

  // ── Safety Layer 2: Scrape Anomaly Filter (3x Konsistensi) ───────────────
  let validData = null;
  let prevBalance = null;
  let attemptNum   = 0;
  let lastError    = null;

  while (attemptNum < SCRAPE_MAX_ATTEMPTS) {
    attemptNum++;
    try {
      const lbDoc = await withRetry(
        () => getDoc('botState/leaderboardAnalytics'),
        { label: `decision:lbRead-${attemptNum}`, ...DEFAULT_RETRY }
      );

      if (!lbDoc.exists) throw new Error('Dokumen leaderboardAnalytics tidak ditemukan di Firestore.');

      const lbData = lbDoc.data();
      const classes = lbData.classes || [];
      const ourClass = findOurClass(classes);

      if (!ourClass) throw new Error('Data kelas kita tidak ditemukan di leaderboardAnalytics.');
      if (!ourClass.total || ourClass.total <= 0) throw new Error(`Saldo kelas terbaca tidak valid: ${ourClass.total}`);

      // Validasi konsistensi antar scrape
      if (prevBalance !== null && Math.abs(ourClass.total - prevBalance) > 20) {
        Logger.warning(`Anomali scrape: baca #${attemptNum} = ${ourClass.total} Pt vs sebelumnya = ${prevBalance} Pt. Lanjut cek ulang.`);
        prevBalance = ourClass.total;
        if (attemptNum < SCRAPE_MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, SCRAPE_INTERVAL_MS));
          continue;
        }
      }

      prevBalance = ourClass.total;
      validData = { classes, ourClass };
      Logger.info(`Scrape #${attemptNum} valid: saldo kita ${ourClass.total} Pt.`);

      if (attemptNum < SCRAPE_MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, SCRAPE_INTERVAL_MS));
      }
    } catch (e) {
      lastError = e;
      Logger.error(`Scrape attempt #${attemptNum} gagal: ${e.message}`);
    }
  }

  // Safety Layer 1: Fail-Closed — Jika data tidak valid setelah 3 attempts
  if (!validData) {
    const reason = `Scrape gagal ${SCRAPE_MAX_ATTEMPTS}x. Error: ${lastError?.message || 'Unknown'}`;
    Logger.error('KEPUTUSAN: TIDAK (Fail-Safe) —', reason);
    await logDecision({ decision: 'NO', reason: 'SCRAPE_FAILED', amount: 0, details: reason });
    await sendAlert(`⛔ Decision Engine (23:00)\nGagal baca data ${SCRAPE_MAX_ATTEMPTS}x berturut-turut.\nOtomatis TIDAK invest. Saldo kas aman.\nError: ${lastError?.message}`);
    return { decision: 'NO', reason: 'SCRAPE_FAILED', amount: 0 };
  }

  // ── Olah Data Leaderboard ─────────────────────────────────────────────────
  const { classes, ourClass } = validData;

  // Sort berdasarkan saldo descending (= ranking leaderboard)
  const sorted = [...classes].sort((a, b) => (b.total || 0) - (a.total || 0));

  const ourIdx     = sorted.findIndex(c =>
    String(c.classId) === String(OUR_CLASS_ID) ||
    OUR_CLASS_PATTERNS.some(p => String(c.name || '').toLowerCase().includes(p))
  );
  const ourRank    = ourIdx + 1;
  const classAbove = ourIdx > 0 ? sorted[ourIdx - 1] : null; // Kelas tepat di atas kita
  const classBelow = ourIdx < sorted.length - 1 ? sorted[ourIdx + 1] : null; // Kelas tepat di bawah
  const classRank1 = sorted[0]; // Kelas #1

  const currentBalance = ourClass.total  || 0;
  const growth7d       = ourClass.growth7d || 0;
  const paceOur        = growth7d / 7;
  const paceRank1      = (classRank1?.growth7d || 0) / 7;

  Logger.info('Decision Engine — Snapshot Leaderboard', {
    ourRank,
    ourBalance: currentBalance,
    growth7d,
    paceOur:    `${paceOur.toFixed(2)} Pt/hari`,
    paceRank1:  `${paceRank1.toFixed(2)} Pt/hari`,
    classAbove: classAbove ? `${classAbove.name} (${classAbove.total} Pt)` : '(Kita Rank #1)',
    classBelow: classBelow ? `${classBelow.name} (${classBelow.total} Pt)` : '(Tidak ada kelas bawah)',
    classRank1: `${classRank1?.name} (${classRank1?.total} Pt)`,
  });

  // ── Rule 1: Dynamic Target Reserve (The Chaser Rule) ─────────────────────
  let targetReserve;
  if (ourRank === 1 || !classAbove) {
    // Sudah #1 — pertahankan gap 100 Pt dari #2
    targetReserve = (sorted[1]?.total || 0) + 100;
  } else {
    // Targetkan menyalip kelas di atas kita (+50 Pt buffer)
    targetReserve = classAbove.total + 50;
  }

  const overflowAmount = currentBalance - targetReserve;

  if (overflowAmount < MIN_INVEST_AMOUNT) {
    const needed = targetReserve - currentBalance;
    const reason = `Rule 1 (Chaser): Saldo ${currentBalance} Pt, Target Salip ${classAbove?.name || '#2'} = ${targetReserve} Pt. Kurang ${Math.abs(needed)} Pt. Tabung dulu.`;
    Logger.info(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'RULE1_CHASER', amount: 0, details: reason, metrics: { currentBalance, targetReserve, ourRank, paceOur: +paceOur.toFixed(2), paceRank1: +paceRank1.toFixed(2) } });
    await sendAlert(`📊 Decision Engine (23:00)\n❌ KEPUTUSAN: TIDAK\n${reason}\nEstimasi salip: ~${Math.ceil(Math.abs(needed) / Math.max(paceOur, 0.1))} hari`);
    return { decision: 'NO', reason: 'RULE1_CHASER', amount: 0 };
  }

  // ── Rule 2: Pace Dominance Check ─────────────────────────────────────────
  if (paceOur < paceRank1) {
    const reason = `Rule 2 (Pace): Kita ${paceOur.toFixed(1)} Pt/hari < Rank #1 (${classRank1?.name}) ${paceRank1.toFixed(1)} Pt/hari. Tahan kas — biarkan Bankbook 1% mendongkrak pace.`;
    Logger.info(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'RULE2_PACE', amount: 0, details: reason, metrics: { currentBalance, targetReserve, ourRank, paceOur: +paceOur.toFixed(2), paceRank1: +paceRank1.toFixed(2) } });
    await sendAlert(`📊 Decision Engine (23:00)\n❌ KEPUTUSAN: TIDAK\n${reason}`);
    return { decision: 'NO', reason: 'RULE2_PACE', amount: 0 };
  }

  // ── Rule 3: Rank Vulnerability Check ─────────────────────────────────────
  const gapBehind     = classBelow ? currentBalance - classBelow.total : 99999;
  const plannedInvest = Math.min(overflowAmount, HARD_MAX_INVEST);

  if (gapBehind < plannedInvest + 30) {
    const reason = `Rule 3 (Vulnerability): Gap ke ${classBelow?.name || 'kelas bawah'} hanya ${gapBehind} Pt. Invest ${plannedInvest} Pt akan membuat kita disalip besok.`;
    Logger.info(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'RULE3_VULNERABILITY', amount: 0, details: reason, metrics: { currentBalance, gapBehind, plannedInvest, ourRank } });
    await sendAlert(`📊 Decision Engine (23:00)\n❌ KEPUTUSAN: TIDAK\n${reason}`);
    return { decision: 'NO', reason: 'RULE3_VULNERABILITY', amount: 0 };
  }

  // ── Rule 4: Adaptive Overflow Execution ──────────────────────────────────
  // Safety Layer 3: Hard Circuit Breaker
  const finalAmount = Math.min(plannedInvest, HARD_MAX_INVEST);

  if (currentBalance - finalAmount < HARD_MIN_RESERVE) {
    const reason = `Hard Circuit Breaker: Saldo setelah invest ${currentBalance - finalAmount} Pt < batas keras ${HARD_MIN_RESERVE} Pt.`;
    Logger.warning(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'HARD_CIRCUIT_BREAKER', amount: 0, details: reason });
    await sendAlert(`⚠️ Decision Engine: CIRCUIT BREAKER Aktif\n${reason}`);
    return { decision: 'NO', reason: 'HARD_CIRCUIT_BREAKER', amount: 0 };
  }

  if (finalAmount < MIN_INVEST_AMOUNT) {
    const reason = `Rule 4: Dana luberan ${finalAmount} Pt < minimum invest ${MIN_INVEST_AMOUNT} Pt.`;
    Logger.info(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'RULE4_INSUFFICIENT', amount: 0, details: reason });
    await sendAlert(`📊 Decision Engine (23:00)\n❌ KEPUTUSAN: TIDAK\n${reason}`);
    return { decision: 'NO', reason: 'RULE4_INSUFFICIENT', amount: 0 };
  }

  // ── ✅ SEMUA RULES LOLOS — Buat Jadwal Investasi ────────────────────────
  const investDate    = tomorrowDateStr();
  const expectedReturn = Math.floor(finalAmount * INVEST_RETURN_RATE);
  const maturityDate  = addDays(investDate, INVEST_DURATION_DAYS);
  const metrics       = { ourRank, currentBalance, targetReserve, gapBehind, paceOur: +paceOur.toFixed(2), paceRank1: +paceRank1.toFixed(2), classAboveName: classAbove?.name || '(Kita #1)', classBelowName: classBelow?.name || '(Tidak ada)' };

  await withRetry(
    () => setDoc(`schedules/${entryId}`, {
      entryId,
      investDate,
      amount:         finalAmount,
      expectedReturn,
      maturityDate,
      status:         'PENDING',
      createdBy:      'decisionEngine',
      createdAt:      serverTimestamp(),
      updatedAt:      serverTimestamp(),
      decisionMetrics: metrics,
    }),
    { label: 'decision:writeSchedule', ...DEFAULT_RETRY }
  );

  const successMsg = [
    `📊 Decision Engine (23:00)`,
    `✅ KEPUTUSAN: YA — Invest ${finalAmount} Pt besok (${investDate})`,
    `Return Diharapkan: +${expectedReturn} Pt (Cair: ${maturityDate})`,
    `Rank Kita: #${ourRank} | Saldo: ${currentBalance} Pt`,
    `Target Salip: ${classAbove?.name || 'Pertahankan #1'} (${classAbove?.total || 'N/A'} Pt)`,
    `Gap ke Kelas Bawah: ${gapBehind} Pt ✅`,
    `Pace Kita: ${paceOur.toFixed(1)} Pt/hari ≥ Pace Rank #1: ${paceRank1.toFixed(1)} Pt/hari ✅`,
  ].join('\n');

  await logDecision({ decision: 'YES', reason: 'ALL_RULES_PASSED', amount: finalAmount, details: successMsg, metrics });
  await sendAlert(successMsg);

  Logger.success('KEPUTUSAN: YA — Jadwal investasi berhasil dibuat', { entryId, amount: finalAmount, investDate, expectedReturn, maturityDate });

  return { decision: 'YES', reason: 'ALL_RULES_PASSED', amount: finalAmount, entryId };
}

module.exports = { evaluateAndDecide };
