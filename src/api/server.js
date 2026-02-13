const express = require('express');
const path = require('path');
const debtService = require('../services/debtService');
const loanAgreementService = require('../services/loanAgreementService');
const reportService = require('../services/reportService');
const userService = require('../services/userService');
const { parseCommand } = require('../parser/commandParser');
const { authenticateApiKey, rateLimit, validateRequest, requestLogger } = require('../middleware/security');

const app = express();
app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Dashboard API
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        // This would need userId from auth in production
        const userId = 1; // Default for now
        
        const stats = await getDashboardStats(userId);
        res.json(stats);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dashboard HTML
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
});

async function getDashboardStats(userId) {
    // Get basic stats
    const totalPiutang = await debtService.getTotalPending(userId);
    const totalHutang = await debtService.getTotalHutang(userId);
    const activeAgreements = await loanAgreementService.getActiveCount(userId);
    const overdueCount = await debtService.getOverdueCount(userId);
    
    // Get monthly data
    const monthlyData = reportService.getMonthlyStats(userId, 6);
    
    // Get installment status
    const installmentStats = await loanAgreementService.getInstallmentStats(userId);
    
    // Get top borrowers
    const topBorrowers = await debtService.getTopBorrowers(userId, 5);
    
    // Get recent transactions
    const recentTransactions = await debtService.getRecentTransactions(userId, 10);
    
    return {
        totalPiutang,
        totalHutang,
        activeAgreements,
        overdueCount,
        monthlyLabels: monthlyData.labels,
        monthlyPiutang: monthlyData.piutang,
        monthlyHutang: monthlyData.hutang,
        paidInstallments: installmentStats.paid,
        pendingInstallments: installmentStats.pending,
        overdueInstallments: installmentStats.overdue,
        topBorrowers,
        recentTransactions,
        cashflowLabels: monthlyData.labels,
        cashflowIn: monthlyData.collected,
        cashflowOut: monthlyData.lent
    };
}

// Apply middleware
app.use(requestLogger);
app.use(rateLimit);
app.use(validateRequest);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OpenClaw Webhook Endpoint
app.post('/api/openclaw/webhook', authenticateApiKey, async (req, res) => {
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
app.post('/api/openclaw/report', authenticateApiKey, async (req, res) => {
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
