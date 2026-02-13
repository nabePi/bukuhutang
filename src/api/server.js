const express = require('express');
const debtService = require('../services/debtService');
const loanAgreementService = require('../services/loanAgreementService');
const userService = require('../services/userService');
const { parseCommand } = require('../parser/commandParser');

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OpenClaw Webhook Endpoint
app.post('/api/openclaw/webhook', async (req, res) => {
  const { action, payload } = req.body;
  
  try {
    switch(action) {
      case 'CHECK_REMINDERS':
        const reminders = await debtService.getUpcomingReminders(50);
        res.json({
          status: 'ok',
          count: reminders.length,
          jobs: reminders.map(r => ({
            type: 'SEND_REMINDER',
            debtId: r.id,
            debtorPhone: r.debtor_phone,
            debtorName: r.debtor_name,
            amount: r.amount,
            description: r.description,
            ownerPhone: r.owner_phone
          }))
        });
        break;
        
      case 'CHECK_INSTALLMENTS':
        const { agreementId } = payload || {};
        const installments = await loanAgreementService.getUpcomingInstallments(50);
        res.json({
          status: 'ok',
          count: installments.length,
          jobs: installments.map(i => ({
            type: 'SEND_INSTALLMENT_REMINDER',
            installmentId: i.id,
            agreementId: i.agreement_id,
            debtorPhone: i.debtor_phone,
            amount: i.amount,
            dueDate: i.due_date
          }))
        });
        break;
        
      case 'REPORT_STATUS':
        const stats = {
          pendingDebts: await debtService.getPendingCount(),
          overdueDebts: await debtService.getOverdueCount(),
          activeAgreements: await loanAgreementService.getActiveCount(),
          pendingInstallments: await loanAgreementService.getPendingInstallmentCount()
        };
        res.json({ status: 'ok', stats });
        break;
        
      case 'GET_POLICY':
        const policy = await getPolicyFromDB();
        res.json({ status: 'ok', policy });
        break;
        
      default:
        res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Job Report Endpoint (OpenClaw report back results)
app.post('/api/openclaw/report', async (req, res) => {
  const { jobType, jobId, status, error, metadata } = req.body;
  
  try {
    switch(jobType) {
      case 'REMINDER_SENT':
        await debtService.markReminderSent(jobId);
        break;
      case 'INSTALLMENT_REMINDER_SENT':
        await loanAgreementService.markInstallmentReminderSent(jobId);
        break;
      case 'PAYMENT_RECORDED':
        await loanAgreementService.recordPayment(jobId, metadata);
        break;
    }
    
    res.json({ status: 'ok', recorded: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp Send Endpoint (OpenClaw call this to send WA)
app.post('/api/whatsapp/send', async (req, res) => {
  const { phone, message, type = 'text' } = req.body;
  
  try {
    // This will be implemented to use Baileys
    const result = await global.whatsappClient.sendMessage(
      phone + '@s.whatsapp.net', 
      message
    );
    res.json({ status: 'ok', messageId: result.key.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get policy from DB
async function getPolicyFromDB() {
  const { getConnection } = require('../db/connection');
  const db = getConnection();
  const stmt = db.prepare('SELECT key, value FROM ops_policy');
  const rows = stmt.all();
  const policy = {};
  rows.forEach(row => {
    policy[row.key] = row.value;
  });
  return policy;
}

module.exports = app;
