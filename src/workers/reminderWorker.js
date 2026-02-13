const reminderQueue = require('../queue/reminderQueue');
const debtService = require('../services/debtService');
const whatsappClient = require('../whatsapp/client');

class ReminderWorker {
  constructor() {
    this.setupProcessor();
  }

  setupProcessor() {
    reminderQueue.process(async (job) => {
      const { debtId, debtorPhone, debtorName, amount, description, ownerPhone } = job.data;
      
      console.log(`Processing reminder for ${debtorName}`);

      try {
        const message = `Halo ${debtorName},\n\nIni pengingat pembayaran:\nJumlah: Rp ${amount.toLocaleString('id-ID')}\nUntuk: ${description || 'Piutang'}\n\nMohon konfirmasi jika sudah membayar. Terima kasih!`;

        await whatsappClient.sendMessage(debtorPhone + '@s.whatsapp.net', message);
        await debtService.markReminderSent(debtId);
        await whatsappClient.sendMessage(ownerPhone + '@s.whatsapp.net', 
          `✅ Reminder otomatis terkirim ke ${debtorName}`);

        return { success: true };
      } catch (error) {
        console.error('Failed to send reminder:', error);
        throw error;
      }
    });

    reminderQueue.on('completed', (job) => {
      console.log(`Reminder job ${job.id} completed`);
    });

    reminderQueue.on('failed', (job, err) => {
      console.error(`Reminder job ${job.id} failed:`, err);
    });
  }

  async addReminder(data, delay) {
    await reminderQueue.add(data, {
      delay: delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000
      }
    });
  }
}

module.exports = new ReminderWorker();
