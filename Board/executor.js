const { db, runTransaction, serverTimestamp, getDoc, setDoc } = require('./firebase');
const { sendAlert } = require('./alert');
const { executeInvest } = require('./investor');
const { Logger } = require('./logger');
const { withRetry, isTransientError } = require('./retry');
const Pending = require('./pending');

const DEFAULT_RETRY = { retries: 5, baseDelayMs: 2000 };

async function runDailyJob(targetDate) {
  const version = process.env.BOT_VERSION || '1.0.0';
  const staleTimeout = parseInt(process.env.STALE_EXECUTING_TIMEOUT_MS) || 300000;

  const now = targetDate ? new Date(targetDate + 'T12:00:00') : new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const entryId = 'inv_' + today;

  try {
    Logger.info('Menulis heartbeat ke Firestore', { version });
    await withRetry(
      () => setDoc('botState/heartbeat', { lastSeen: serverTimestamp(), version }),
      { label: 'heartbeat', ...DEFAULT_RETRY }
    );

    Logger.info('Membaca jadwal investasi hari ini', { entryId, today });

    let scheduleEntry = null;

    const scheduleSnap = await withRetry(
      () => getDoc(`schedules/${entryId}`),
      { label: `schedule:${entryId}`, ...DEFAULT_RETRY }
    );

    if (scheduleSnap.exists) {
      scheduleEntry = scheduleSnap.data();
      Logger.info('Jadwal investasi ditemukan di Firestore collection schedules', {
        entryId,
        amount: scheduleEntry.amount,
        expectedReturn: scheduleEntry.expectedReturn,
        maturityDate: scheduleEntry.maturityDate
      });
    } else {
      Logger.info(`Dokumen schedules/${entryId} tidak ditemukan, memeriksa botState/config`, { entryId });
      const configSnap = await withRetry(
        () => getDoc('botState/config'),
        { label: 'config:botState', ...DEFAULT_RETRY }
      );
      if (configSnap.exists) {
        const cfg = configSnap.data();
        const dashSnap = await withRetry(
          () => getDoc('botState/dashboardData'),
          { label: 'dashboardData:botState', ...DEFAULT_RETRY }
        );
        const dashData = dashSnap.exists ? dashSnap.data() : {};
        const currentBalance = dashData.balance || 0;
        const minInvest = cfg.minInvest || 50;
        const reserveBalance = cfg.reserveBalance || 0;
        const returnRate = cfg.returnRate || 1.18;
        const investDuration = cfg.investDuration || 30;

        const availableToInvest = currentBalance - reserveBalance;
        if (availableToInvest >= minInvest) {
          const amount = (cfg.maxInvest && cfg.maxInvest > 0)
            ? Math.min(availableToInvest, cfg.maxInvest)
            : availableToInvest;

          const expectedReturn = Math.floor(amount * returnRate);
          const matDate = new Date(now);
          matDate.setDate(matDate.getDate() + investDuration);
          const maturityDate = matDate.getFullYear() + '-' + String(matDate.getMonth() + 1).padStart(2, '0') + '-' + String(matDate.getDate()).padStart(2, '0');

          scheduleEntry = {
            entryId,
            investDate: today,
            amount,
            expectedReturn,
            maturityDate,
            generatedFromConfig: true
          };
          Logger.info('Jadwal investasi berhasil dihitung otomatis dari botState/config', scheduleEntry);
        } else {
          Logger.info('Saldo tidak mencukupi untuk investasi minimal berdasarkan config', { availableToInvest, minInvest });
        }
      }
    }

    if (!scheduleEntry) {
      Logger.info('Tidak ada jadwal investasi hari ini', { entryId });
      Pending.clearPending(entryId);
      return { status: 'NO_SCHEDULE', entryId };
    }

    const execSnap = await withRetry(
      () => getDoc(`executions/${entryId}`),
      { label: `execution:${entryId}`, ...DEFAULT_RETRY }
    );
    const execData = execSnap.exists ? execSnap.data() : null;

    if (execData && execData.status === 'DONE') {
      Logger.info('Investasi sudah dieksekusi hari ini', { entryId, status: execData.status });
      Pending.clearPending(entryId);
      return { status: 'DONE', entryId };
    }

    if (execData && execData.status === 'EXECUTING') {
      const executingAt = execData.executingAt ? execData.executingAt.toDate().getTime() : 0;
      if (Date.now() - executingAt > staleTimeout) {
        Logger.critical('Bot crash terdeteksi! Investasi tertahan dalam status EXECUTING', {
          entryId,
          executingAt: new Date(executingAt).toISOString(),
          staleTimeout
        });
        await sendAlert(`Bot crash detected! entryId: ${entryId} stuck in EXECUTING. Please check manually.`);
      } else {
        Logger.info('Investasi sedang dieksekusi', {
          entryId,
          status: execData.status,
          executingAt: new Date(executingAt).toISOString()
        });
      }
      Pending.clearPending(entryId);
      return { status: 'IN_PROGRESS', entryId };
    }

    Logger.info('Memulai atomic transaction untuk lock eksekusi', { entryId });

    const execRef = db.doc(`executions/${entryId}`);
    const transactionResult = await withRetry(
      () => runTransaction(async (t) => {
        const doc = await t.get(execRef);
        if (doc.exists) {
          const data = doc.data();
          if (data.status === 'DONE' || data.status === 'EXECUTING') {
            Logger.warning('Transaksi dibatalkan - sudah diproses atau selesai', { entryId, existingStatus: data.status });
            return false;
          }
        }

        t.set(execRef, {
          entryId: entryId,
          status: 'EXECUTING',
          executingAt: serverTimestamp(),
          botVersion: version,
          amount: scheduleEntry.amount,
          expectedReturn: scheduleEntry.expectedReturn,
          maturityDate: scheduleEntry.maturityDate,
          investDate: today
        });
        Logger.success('Transaction berhasil - status di-set ke EXECUTING', { entryId });
        return true;
      }),
      { label: `transaction:${entryId}`, ...DEFAULT_RETRY }
    );

    if (!transactionResult) {
      Logger.warning('Transaksi dibatalkan, sudah diproses atau selesai', { entryId });
      Pending.clearPending(entryId);
      return { status: 'DONE', entryId };
    }

    const INVEST_ENABLED = process.env.INVEST_ENABLED !== 'false' && process.env.INVEST_ENABLED !== '0';
    if (!INVEST_ENABLED) {
      Logger.info('Investasi dinonaktifkan via ENV - menandai sebagai SKIPPED', { entryId });
      await withRetry(
        () => setDoc(`executions/${entryId}`, {
          status: 'SKIPPED',
          executedAt: serverTimestamp(),
          notes: JSON.stringify({ skipped: true, reason: 'Investasi disabled via ENV' })
        }, { merge: true }),
        { label: `skip-exec:${entryId}`, ...DEFAULT_RETRY }
      );
      await withRetry(
        () => setDoc(`schedules/${entryId}`, { status: 'SKIPPED' }, { merge: true }),
        { label: `skip-sched:${entryId}`, ...DEFAULT_RETRY }
      );
      Pending.clearPending(entryId);
      await sendAlert('Investasi hari ini dilewati karena fitur dinonaktifkan (INVEST_ENABLED=false).');
      return { status: 'SKIPPED', entryId };
    }

    Logger.info('Memulai eksekusi investasi', {
      entryId,
      amount: scheduleEntry.amount,
      expectedReturn: scheduleEntry.expectedReturn,
      plan: '30 days'
    });

    const result = await withRetry(
      () => executeInvest(scheduleEntry),
      { label: `execute-invest:${entryId}`, retries: 3, baseDelayMs: 5000 }
    );

    if (result.success) {
      Logger.success('Investasi berhasil dieksekusi', {
        entryId,
        amount: scheduleEntry.amount,
        expectedReturn: scheduleEntry.expectedReturn,
        maturityDate: scheduleEntry.maturityDate
      });
      await withRetry(
        () => setDoc(`executions/${entryId}`, {
          status: 'DONE',
          executedAt: serverTimestamp(),
          notes: JSON.stringify(result.data)
        }, { merge: true }),
        { label: `done-exec:${entryId}`, ...DEFAULT_RETRY }
      );
      await withRetry(
        () => setDoc(`schedules/${entryId}`, { status: 'DONE' }, { merge: true }),
        { label: `done-sched:${entryId}`, ...DEFAULT_RETRY }
      );
      Pending.clearPending(entryId);
      await sendAlert(`Invest berhasil! ${scheduleEntry.amount} poin \u2192 Cair ${scheduleEntry.expectedReturn} tgl ${scheduleEntry.maturityDate}`);
      return { status: 'COMPLETED', entryId };
    } else {
      Logger.error('Investasi gagal dieksekusi', { entryId, amount: scheduleEntry.amount, error: result.error });
      await withRetry(
        () => setDoc(`executions/${entryId}`, {
          status: 'FAILED',
          failedAt: serverTimestamp(),
          error: result.error
        }, { merge: true }),
        { label: `fail-exec:${entryId}`, ...DEFAULT_RETRY }
      );
      await withRetry(
        () => setDoc(`schedules/${entryId}`, { status: 'FAILED' }, { merge: true }),
        { label: `fail-sched:${entryId}`, ...DEFAULT_RETRY }
      );
      Pending.clearPending(entryId);
      await sendAlert(`GAGAL invest hari ini! Error: ${result.error}`);
      return { status: 'FAILED', entryId };
    }

  } catch (error) {
    const transient = isTransientError(error);
    Logger.critical('Error di dalam runDailyJob', { error: error.message, stack: error.stack, transient });

    if (transient) {
      const cur = Pending.recordFailure(entryId, 'network', error.message);
      if (cur.attempts <= 1) {
        await sendAlert(`Internet/Firebase gagal diakses untuk ${entryId}. Bot akan mencoba ulang otomatis.`);
      }
      return { status: 'NETWORK_ERROR', entryId, transient, attempts: cur.attempts };
    }

    await sendAlert(`Bot Error in runDailyJob: ${error.message}`);
    return { status: 'ERROR', entryId, transient: false };
  }
}

module.exports = { runDailyJob };
