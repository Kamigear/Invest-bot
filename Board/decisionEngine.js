/**
 * =============================================================================
 * decisionEngine.js — 100% Automated Investment Decision Engine (01:00 WIB)
 * =============================================================================
 * Dipanggil setiap pukul 01:00 WIB (setelah Claim Daily & Weekly Streak).
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
 *   Invest = Saldo - Target_Reserve
 *   Jika Invest < MIN_INVEST_AMOUNT → TIDAK
 *
 * Safety System (Fail-Closed):
 *   Layer 1 — Fail-Closed Network: Jika offline/scrape gagal → otomatis TIDAK
 *   Layer 2 — Scrape Anomaly Filter: 3x konsistensi sebelum data dianggap valid
 *   Layer 3 — Hard Circuit Breaker: HARD_MIN_RESERVE terkunci hardcoded
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
const HARD_MIN_RESERVE  = parseInt(process.env.HARD_MIN_RESERVE,  10) || 300; // Batas bawah saldo absolut (hardcoded)
const MIN_INVEST_AMOUNT = parseInt(process.env.MIN_INVEST_AMOUNT, 10) || 1;   // Minimum nominal investasi (tanpa batasan minimal, default: 1 Pt)
const INVEST_RETURN_RATE = parseFloat(process.env.INVEST_RETURN_RATE) || 1.26; // Return 26% profit (1.26x total) dengan pembulatan Math.floor
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

function getWibDate(d = new Date()) {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
}

function todayInvId() {
  return `inv_${getWibDate()}`;
}

function tomorrowDateStr() {
  const d = new Date();
  d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
  return getWibDate(d);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00+07:00');
  d.setDate(d.getDate() + days);
  return getWibDate(d);
}

// ── Log Keputusan ke Firestore ────────────────────────────────────────────────
async function logDecision({ decision, reason, amount, details, metrics }) {
  try {
    const dateKey = getWibDate();
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
  Logger.banner('DECISION ENGINE (01:00 WIB) — Evaluasi Keputusan Investasi Dimulai');

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
    await sendAlert(`⛔ Decision Engine (01:00 WIB)\nGagal baca data ${SCRAPE_MAX_ATTEMPTS}x berturut-turut.\nOtomatis TIDAK invest. Saldo kas aman.\nError: ${lastError?.message}`);
    return { decision: 'NO', reason: 'SCRAPE_FAILED', amount: 0 };
  }

  // ── Olah Data Leaderboard ─────────────────────────────────────────────────
  const { classes, ourClass } = validData;

  // Filter kelas: Hanya bandingkan dengan kelas nyata dalam 1 grade yang sama (exclude admin/dummy)
  const targetGrade = ourClass.grade || 10;
  const filteredClasses = classes.filter(c => {
    const isSelf = String(c.classId) === String(OUR_CLASS_ID) ||
      OUR_CLASS_PATTERNS.some(p => String(c.name || '').toLowerCase().includes(p));
    if (isSelf) return true;
    const nameNorm = String(c.name || '').toLowerCase();
    const isDummy = nameNorm.includes('admin') || c.grade === 0 || String(c.classId) === '13';
    return !isDummy && (c.grade === targetGrade);
  });

  // Sort berdasarkan saldo descending (= ranking leaderboard di grade kita)
  const sorted = [...filteredClasses].sort((a, b) => (b.total || 0) - (a.total || 0));

  // Fail-Closed: Jika kompetitor dalam grade tidak terdeteksi (kurang dari 2 kelas), tolak investasi demi keamanan
  if (sorted.length < 2) {
    const reason = `Data kompetitor tidak lengkap di Grade ${targetGrade} (hanya terdeteksi ${sorted.length} kelas). Fail-Closed: TIDAK invest demi melindungi saldo kas.`;
    Logger.error('KEPUTUSAN: TIDAK (Fail-Closed) —', reason);
    await logDecision({ decision: 'NO', reason: 'INSUFFICIENT_COMPETITOR_DATA', amount: 0, details: reason });
    await sendAlert(`⛔ Decision Engine (01:00 WIB)\n❌ KEPUTUSAN: TIDAK\n${reason}`);
    return { decision: 'NO', reason: 'INSUFFICIENT_COMPETITOR_DATA', amount: 0 };
  }

  const ourIdx     = sorted.findIndex(c =>
    String(c.classId) === String(OUR_CLASS_ID) ||
    OUR_CLASS_PATTERNS.some(p => String(c.name || '').toLowerCase().includes(p))
  );
  const ourRank    = ourIdx !== -1 ? ourIdx + 1 : 1;
  const classAbove = ourIdx > 0 ? sorted[ourIdx - 1] : null; // Kelas tepat di atas kita di grade kita
  const classBelow = (ourIdx !== -1 && ourIdx < sorted.length - 1) ? sorted[ourIdx + 1] : null; // Kelas tepat di bawah
  const classRank1 = sorted[0] || ourClass; // Kelas #1 di grade kita

  const currentBalance = ourClass.total  || 0;
  const growth7d       = ourClass.growth7d || 0;
  const paceOur        = growth7d / 7;
  const paceRank1      = (classRank1?.growth7d || 0) / 7;

  Logger.info('Decision Engine — Snapshot Leaderboard (Grade ' + targetGrade + ')', {
    ourRank,
    ourBalance: currentBalance,
    growth7d,
    paceOur:    `${paceOur.toFixed(2)} Pt/hari`,
    paceRank1:  `${paceRank1.toFixed(2)} Pt/hari`,
    classAbove: classAbove ? `${classAbove.name} (${classAbove.total} Pt)` : '(Kita Rank #1)',
    classBelow: classBelow ? `${classBelow.name} (${classBelow.total} Pt)` : '(Tidak ada kelas bawah)',
    classRank1: `${classRank1?.name} (${classRank1?.total} Pt)`,
  });

  // ── Rule 1: Dynamic Target Reserve (The Chaser & Leader Rule) ────────────
  let targetReserve;
  if (ourRank === 1 || !classAbove) {
    // Posisi Rank 1: Wajib amankan keunggulan kas!
    // Cadangan kas = Saldo Rank 2 + 100 Pt, DAN minimal 85% total saldo kas saat ini, DAN minimal HARD_MIN_RESERVE
    const rank2Total = sorted[1]?.total || 0;
    targetReserve = Math.max(rank2Total + 100, Math.floor(currentBalance * 0.85), HARD_MIN_RESERVE);
  } else {
    // Targetkan menyalip kelas di atas kita (+50 Pt buffer)
    targetReserve = Math.max(classAbove.total + 50, HARD_MIN_RESERVE);
  }

  const overflowAmount = currentBalance - targetReserve;

  if (overflowAmount < MIN_INVEST_AMOUNT) {
    const needed = targetReserve - currentBalance;
    const targetName = (ourRank === 1 || !classAbove) ? (sorted[1]?.name || 'Rank #2') : (classAbove?.name || '#1');
    const reason = `Rule 1 (Chaser/Leader): Saldo ${currentBalance} Pt, Target Cadangan Aman (${targetName}) = ${targetReserve} Pt. Kurang ${Math.abs(needed)} Pt. Kas ditahan di tabungan.`;
    Logger.info(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'RULE1_CHASER', amount: 0, details: reason, metrics: { currentBalance, targetReserve, ourRank, paceOur: +paceOur.toFixed(2), paceRank1: +paceRank1.toFixed(2) } });
    await sendAlert(`📊 Decision Engine (01:00 WIB)\n❌ KEPUTUSAN: TIDAK\n${reason}\nEstimasi salip/capai target: ~${Math.ceil(Math.abs(needed) / Math.max(paceOur, 0.1))} hari`);
    return { decision: 'NO', reason: 'RULE1_CHASER', amount: 0 };
  }

  // ── Rule 2: Pace Dominance Check ─────────────────────────────────────────
  if (paceOur < paceRank1) {
    const reason = `Rule 2 (Pace): Kita ${paceOur.toFixed(1)} Pt/hari < Rank #1 (${classRank1?.name}) ${paceRank1.toFixed(1)} Pt/hari. Tahan kas — biarkan Bankbook 1% mendongkrak pace.`;
    Logger.info(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'RULE2_PACE', amount: 0, details: reason, metrics: { currentBalance, targetReserve, ourRank, paceOur: +paceOur.toFixed(2), paceRank1: +paceRank1.toFixed(2) } });
    await sendAlert(`📊 Decision Engine (01:00 WIB)\n❌ KEPUTUSAN: TIDAK\n${reason}`);
    return { decision: 'NO', reason: 'RULE2_PACE', amount: 0 };
  }

  // ── Rule 3: Rank Vulnerability Check (Pertahanan Posisi) ─────────────────
  const gapBehind     = classBelow ? currentBalance - classBelow.total : (currentBalance - (sorted[1]?.total || 0));
  const plannedInvest = overflowAmount;

  if (gapBehind < plannedInvest + 50) {
    const reason = `Rule 3 (Vulnerability): Gap ke ${classBelow?.name || 'kelas bawah'} hanya ${gapBehind} Pt. Rencana invest ${plannedInvest} Pt terlalu berisiko membuat kita disalip.`;
    Logger.info(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'RULE3_VULNERABILITY', amount: 0, details: reason, metrics: { currentBalance, gapBehind, plannedInvest, ourRank } });
    await sendAlert(`📊 Decision Engine (01:00 WIB)\n❌ KEPUTUSAN: TIDAK\n${reason}`);
    return { decision: 'NO', reason: 'RULE3_VULNERABILITY', amount: 0 };
  }

  // ── Rule 4: Adaptive Overflow Execution & Hard Floor Safeguard ───────────
  const finalAmount = plannedInvest;
  const remainingCash = currentBalance - finalAmount;

  // Sisa saldo kas setelah invest MUTLAK tidak boleh di bawah targetReserve atau HARD_MIN_RESERVE
  if (remainingCash < targetReserve || remainingCash < HARD_MIN_RESERVE) {
    const reason = `Hard Floor Safeguard: Saldo kas setelah invest tersisa ${remainingCash} Pt < batas aman ${Math.max(targetReserve, HARD_MIN_RESERVE)} Pt.`;
    Logger.warning(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'HARD_CIRCUIT_BREAKER', amount: 0, details: reason });
    await sendAlert(`⚠️ Decision Engine: CIRCUIT BREAKER Aktif\n${reason}`);
    return { decision: 'NO', reason: 'HARD_CIRCUIT_BREAKER', amount: 0 };
  }

  if (finalAmount < MIN_INVEST_AMOUNT) {
    const reason = `Rule 4: Dana luberan ${finalAmount} Pt < minimum invest ${MIN_INVEST_AMOUNT} Pt.`;
    Logger.info(`KEPUTUSAN: TIDAK — ${reason}`);
    await logDecision({ decision: 'NO', reason: 'RULE4_INSUFFICIENT', amount: 0, details: reason });
    await sendAlert(`📊 Decision Engine (01:00 WIB)\n❌ KEPUTUSAN: TIDAK\n${reason}`);
    return { decision: 'NO', reason: 'RULE4_INSUFFICIENT', amount: 0 };
  }

  // ── ✅ SEMUA RULES LOLOS — Buat Jadwal Investasi ────────────────────────
  const investDate    = getWibDate();
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
    `📊 Decision Engine (01:00 WIB)`,
    `✅ KEPUTUSAN: YA — Invest ${finalAmount} Pt hari ini (${investDate})`,
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
