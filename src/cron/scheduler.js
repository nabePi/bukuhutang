const cron = require('node-cron');
const debtService = require('../services/debtService');
const reminderWorker = require('../workers/reminderWorker');

class Scheduler {
  start() {
    cron.schedule('*/5 * * * *', async () => {
      console.log('Checking for upcoming reminders...');
      
      try {
        const reminders = await debtService.getUpcomingReminders();
        
        for (const debt of reminders) {
          const delay = new Date(debt.reminder_time) - Date.now();
          
          if (delay > 0) {
            await reminderWorker.addReminder({
              debtId: debt.id,
              debtorPhone: debt.debtor_phone,
              debtorName: debt.debtor_name,
              amount: debt.amount,
              description: debt.description,
              ownerPhone: debt.owner_phone
            }, delay);
            
            console.log(`Queued reminder for ${debt.debtor_name} in ${Math.floor(delay/1000/60)} minutes`);
          }
        }
      } catch (error) {
        console.error('Scheduler error:', error);
      }
    });

    console.log('Scheduler started');
  }
}

module.exports = new Scheduler();
