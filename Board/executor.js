const { db, runTransaction, serverTimestamp, getDoc, setDoc } = require('./firebase');
const { sendAlert } = require('./alert');
const { executeInvest } = require('./investor');
const { Logger } = require('./logger');

async function runDailyJob() {
  try {
    const version = process.env.BOT_VERSION || '1.0.0';
    const staleTimeout = parseInt(process.env.STALE_EXECUTING_TIMEOUT_MS) || 300000;

    Logger.info("Menulis heartbeat ke Firestore", { version });

    await setDoc('botState/heartbeat', {
      lastSeen: serverTimestamp(),
      version: version
    });

    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const entryId = 'inv_' + today;

    Logger.info("Membaca jadwal investasi hari ini", { entryId, today });

    const scheduleSnap = await getDoc(`schedules/${entryId}`);

    if (!scheduleSnap.exists) {
      Logger.info("Tidak ada jadwal investasi hari ini", { entryId });
      return;
    }

    const scheduleEntry = scheduleSnap.data();
    Logger.info("Jadwal investasi ditemukan", { entryId, amount: scheduleEntry.amount, expectedReturn: scheduleEntry.expectedReturn, maturityDate: scheduleEntry.maturityDate });

    const execSnap = await getDoc(`executions/${entryId}`);
    const execData = execSnap.exists ? execSnap.data() : null;

    if (execData && execData.status === 'DONE') {
      Logger.info("Investasi sudah dieksekusi hari ini", { entryId, status: execData.status });
      return;
    }

    if (execData && execData.status === 'EXECUTING') {
      const executingAt = execData.executingAt ? execData.executingAt.toDate().getTime() : 0;
      if (Date.now() - executingAt > staleTimeout) {
        Logger.critical("Bot crash terdeteksi! Investasi tertahan dalam status EXECUTING", { entryId, executingAt: new Date(executingAt).toISOString(), staleTimeout });
        await sendAlert(`⚠️ Bot crash detected! entryId: ${entryId} stuck in EXECUTING. Please check manually.`);
      } else {
        Logger.info("Investasi sedang dieksekusi", { entryId, status: execData.status, executingAt: new Date(executingAt).toISOString() });
      }
      return;
    }

    Logger.info("Memulai atomic transaction untuk lock eksekusi", { entryId });

    const execRef = db.doc(`executions/${entryId}`);
    const transactionResult = await runTransaction(async (t) => {
      const doc = await t.get(execRef);
      if (doc.exists) {
        const data = doc.data();
        if (data.status === 'DONE' || data.status === 'EXECUTING') {
          Logger.warning("Transaksi dibatalkan - sudah diproses atau selesai", { entryId, existingStatus: data.status });
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
      Logger.success("Transaction berhasil - status di-set ke EXECUTING", { entryId });
      return true;
    });

    if (!transactionResult) {
      Logger.warning("Transaksi dibatalkan, sudah diproses atau selesai", { entryId });
      return;
    }

    const INVEST_ENABLED = process.env.INVEST_ENABLED !== 'false' && process.env.INVEST_ENABLED !== '0';
    if (!INVEST_ENABLED) {
      Logger.info("Investasi dinonaktifkan via ENV - menandai sebagai SKIPPED", { entryId });
      await setDoc(`executions/${entryId}`, {
        status: 'SKIPPED',
        executedAt: serverTimestamp(),
        notes: JSON.stringify({ skipped: true, reason: 'Investasi disabled via ENV' })
      }, { merge: true });
      await setDoc(`schedules/${entryId}`, {
        status: 'SKIPPED'
      }, { merge: true });
      await sendAlert('ℹ️ Investasi hari ini dilewati karena fitur dinonaktifkan (INVEST_ENABLED=false).');
      return;
    }

    Logger.info("Memulai eksekusi investasi", { entryId, amount: scheduleEntry.amount, expectedReturn: scheduleEntry.expectedReturn, plan: "30 days" });

    const result = await executeInvest(scheduleEntry);

    if (result.success) {
      Logger.success("Investasi berhasil dieksekusi", { entryId, amount: scheduleEntry.amount, expectedReturn: scheduleEntry.expectedReturn, maturityDate: scheduleEntry.maturityDate });
      await setDoc(`executions/${entryId}`, {
        status: 'DONE',
        executedAt: serverTimestamp(),
        notes: JSON.stringify(result.data)
      }, { merge: true });

      await setDoc(`schedules/${entryId}`, {
        status: 'DONE'
      }, { merge: true });

      await sendAlert(`✅ Invest berhasil! ${scheduleEntry.amount} poin → Cair ${scheduleEntry.expectedReturn} tgl ${scheduleEntry.maturityDate}`);
    } else {
      Logger.error("Investasi gagal dieksekusi", { entryId, amount: scheduleEntry.amount, error: result.error });
      await setDoc(`executions/${entryId}`, {
        status: 'FAILED',
        failedAt: serverTimestamp(),
        error: result.error
      }, { merge: true });

      await setDoc(`schedules/${entryId}`, {
        status: 'FAILED'
      }, { merge: true });

      await sendAlert(`❌ GAGAL invest hari ini! Error: ${result.error}`);
    }

  } catch (error) {
    Logger.critical("Error di dalam runDailyJob", { error: error.message, stack: error.stack });
    await sendAlert(`❌ Bot Error in runDailyJob: ${error.message}`);
  }
}

module.exports = { runDailyJob };
