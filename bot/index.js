require('dotenv').config();
const cron = require('node-cron');
const { runDailyJob } = require('./executor');
const { sendAlert } = require('./alert');

const schedule = process.env.BOT_CRON_SCHEDULE || '0 6 * * *';

function start() {
  console.log(`Bot started, schedule: ${schedule}`);
  sendAlert(`🤖 Invest Bot started! Schedule: ${schedule}`);

  cron.schedule(schedule, () => {
    console.log(`[${new Date().toISOString()}] Running daily job...`);
    runDailyJob();
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  sendAlert(`❌ Bot FATAL CRASH: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  sendAlert(`❌ Bot FATAL REJECTION: ${reason}`);
});

if (require.main === module) {
  start();
}

module.exports = { start };
