const { db, runTransaction, serverTimestamp, getDoc, setDoc } = require('./firebase');
const { sendAlert } = require('./alert');
const { executeInvest } = require('./investor');

async function runDailyJob() {
  try {
    const version = process.env.BOT_VERSION || '1.0.0';
    const staleTimeout = parseInt(process.env.STALE_EXECUTING_TIMEOUT_MS) || 300000;

    // 1. Write heartbeat
    await setDoc('botState/heartbeat', {
      lastSeen: serverTimestamp(),
      version: version
    });

    // 2. Get today's date YYYY-MM-DD
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    // 3. entryId
    const entryId = 'inv_' + today;

    // 4. Read schedule
    const scheduleSnap = await getDoc(`schedules/${entryId}`);
    
    // 5. If no schedule -> return
    if (!scheduleSnap.exists) {
      console.log('No schedule today for', entryId);
      return;
    }
    
    const scheduleEntry = scheduleSnap.data();

    // 6. Read execution doc
    const execSnap = await getDoc(`executions/${entryId}`);
    const execData = execSnap.exists ? execSnap.data() : null;

    // 7. If DONE -> return
    if (execData && execData.status === 'DONE') {
      console.log('Already done for', entryId);
      return;
    }

    // 8. If EXECUTING
    if (execData && execData.status === 'EXECUTING') {
      const executingAt = execData.executingAt ? execData.executingAt.toDate().getTime() : 0;
      if (Date.now() - executingAt > staleTimeout) {
        await sendAlert(`⚠️ Bot crash detected! entryId: ${entryId} stuck in EXECUTING. Please check manually.`);
      } else {
        console.log('Currently executing', entryId);
      }
      return;
    }

    // 9. Atomic Transaction
    const execRef = db.doc(`executions/${entryId}`);
    const transactionResult = await runTransaction(async (t) => {
      const doc = await t.get(execRef);
      if (doc.exists) {
        const data = doc.data();
        if (data.status === 'DONE' || data.status === 'EXECUTING') {
          return false;
        }
      }
      
      t.set(execRef, {
        status: 'EXECUTING',
        executingAt: serverTimestamp(),
        botVersion: version
      });
      return true;
    });

    if (!transactionResult) {
      console.log('Aborted transaction, already processing or done', entryId);
      return;
    }

    // 10. Call investor
    const result = await executeInvest(scheduleEntry);

    if (result.success) {
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
    console.error('Error in runDailyJob:', error);
    await sendAlert(`❌ Bot Error in runDailyJob: ${error.message}`);
  }
}

module.exports = { runDailyJob };
