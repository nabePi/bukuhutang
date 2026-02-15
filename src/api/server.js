const express = require('express');
const path = require('path');
const debtService = require('../services/debtService');
const loanAgreementService = require('../services/loanAgreementService');
const openclawService = require('../services/openclawService');
const policyService = require('../services/policyService');
const reportService = require('../services/reportService');
const userService = require('../services/userService');
const { parseCommand } = require('../parser/commandParser');
const { authenticateApiKey, rateLimit, validateRequest, requestLogger } = require('../middleware/security');

const app = express();
app.use(express.json());

// Enable CORS for all origins (development)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Serve static files
app.use(express.static('public'));

// Redirect /admin to /admin/dashboard.html
app.get('/admin', (req, res) => {
  res.redirect('/admin/dashboard.html');
});

app.get('/admin/', (req, res) => {
  res.redirect('/admin/dashboard.html');
});

// Apply middleware
app.use(requestLogger);
app.use(rateLimit);
app.use(validateRequest);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public WhatsApp status endpoint (for dashboard QR display)
app.get('/api/public/whatsapp/status', async (req, res) => {
  try {
    const client = global.whatsappClient;
    
    if (!client) {
      // WhatsApp belum initialized (setelah logout)
      return res.json({ 
        connected: false, 
        phoneNumber: null,
        name: null,
        qrCode: null,
        message: 'WhatsApp not initialized. Please restart server.'
      });
    }
    
    const status = client.getStatus ? client.getStatus() : { connected: false, qrCode: null };
    const user = status.user || (client.sock?.user || null);
    
    res.json({
      connected: status.connected || false,
      phoneNumber: user?.id?.split(':')[0] || null,
      name: user?.name || null,
      qrCode: status.qrCode || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public WhatsApp logout endpoint
app.post('/api/public/whatsapp/logout', async (req, res) => {
  try {
    console.log('[Logout] Received logout request');
    const client = global.whatsappClient;
    
    if (!client) {
      console.log('[Logout] WhatsApp not initialized');
      return res.status(400).json({ error: 'WhatsApp not initialized' });
    }
    
    try {
      if (client.sock) {
        console.log('[Logout] Attempting logout...');
        await client.sock.logout();
      }
    } catch (logoutError) {
      console.log('[Logout] Connection error (expected):', logoutError.message);
    }
    
    // Reset state
    client.connectionState = 'disconnected';
    client.qrCode = null;
    client.sock = null;
    
    // Hapus global reference
    global.whatsappClient = null;
    
    // Hapus session file biar gak auto-reconnect
    const fs = require('fs');
    const path = require('path');
    const authPath = path.join(__dirname, '..', '..', 'auth_info_baileys');
    
    if (fs.existsSync(authPath)) {
      console.log('[Logout] Removing auth files...');
      fs.rmSync(authPath, { recursive: true, force: true });
    }
    
    console.log('[Logout] Logout successful, restarting server...');
    
    // Send response before restart
    res.json({ success: true, message: 'WhatsApp logged out. Server restarting...' });
    
    // Auto-restart using PM2
    setTimeout(() => {
      console.log('[Logout] Executing PM2 restart...');
      const { exec } = require('child_process');
      exec('pm2 restart bukuhutang', (error) => {
        if (error) {
          console.error('[Logout] PM2 restart failed:', error);
        }
      });
    }, 1000);
    
  } catch (error) {
    console.error('[Logout] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Public agreements endpoint (for dashboard)
app.get('/api/public/agreements', async (req, res) => {
  try {
    const { getConnection } = require('../db/connection');
    const db = getConnection();
    
    const agreements = db.prepare(`
      SELECT id, borrower_name, borrower_phone, total_amount, 
             installment_amount, installment_count, status,
             actual_lender_name, actual_lender_phone, created_at
      FROM loan_agreements
      ORDER BY created_at DESC
    `).all();
    
    res.json({ agreements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public installments endpoint (for dashboard)
app.get('/api/public/installments', async (req, res) => {
  try {
    const { getConnection } = require('../db/connection');
    const db = getConnection();
    
    const installments = db.prepare(`
      SELECT i.*, la.borrower_name, la.actual_lender_name
      FROM installment_payments i
      JOIN loan_agreements la ON i.agreement_id = la.id
      ORDER BY i.due_date ASC
    `).all();
    
    res.json({ installments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public policy endpoint (for dashboard)
app.get('/api/public/policy', async (req, res) => {
  try {
    const policy = policyService.getAll();
    res.json({ policy });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public agent status endpoint (for dashboard)
app.get('/api/public/agent-status', async (req, res) => {
  try {
    // Get stats from services (Single Admin Mode - no tenant filter)
    const [activeAgreements, pendingInstallments] = await Promise.all([
      loanAgreementService.getAllActiveCount(),
      loanAgreementService.getAllPendingInstallmentCount()
    ]);

    // Get upcoming installments for next 7 days
    const upcomingInstallments = await loanAgreementService.getAllUpcomingInstallments(10);
    
    // Get reminder jobs ready to send
    const reminderJobs = await openclawService.getReminderJobs(20);
    const installmentJobs = await openclawService.getInstallmentJobs(20);

    res.json({
      status: 'active',
      timestamp: new Date().toISOString(),
      stats: {
        pendingDebts: 0,
        overdueDebts: 0,
        activeAgreements,
        pendingInstallments,
        totalJobs: reminderJobs.length + installmentJobs.length,
        upcomingReminders: upcomingInstallments.length
      },
      jobs: {
        reminders: reminderJobs.length,
        installments: installmentJobs.length,
        total: reminderJobs.length + installmentJobs.length
      },
      nextCheck: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() // 6 hours from now
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public system resources endpoint (for dashboard)
app.get('/api/public/system-resources', async (req, res) => {
  try {
    const os = require('os');
    
    // Get memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100);
    
    // Get CPU info
    const cpus = os.cpus();
    const cpuCount = cpus.length;
    const cpuModel = cpus[0]?.model || 'Unknown';
    
    // Calculate CPU usage (simple calculation)
    const loadAvg = os.loadavg();
    const cpuUsagePercent = Math.round((loadAvg[0] / cpuCount) * 100);
    
    // Get process-specific memory usage
    const processMemory = process.memoryUsage();
    
    // Get uptime
    const systemUptime = os.uptime();
    const processUptime = process.uptime();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      memory: {
        total: Math.round(totalMemory / 1024 / 1024), // MB
        free: Math.round(freeMemory / 1024 / 1024), // MB
        used: Math.round(usedMemory / 1024 / 1024), // MB
        usagePercent: memoryUsagePercent,
        process: {
          rss: Math.round(processMemory.rss / 1024 / 1024), // MB
          heapTotal: Math.round(processMemory.heapTotal / 1024 / 1024), // MB
          heapUsed: Math.round(processMemory.heapUsed / 1024 / 1024), // MB
          external: Math.round(processMemory.external / 1024 / 1024) // MB
        }
      },
      cpu: {
        count: cpuCount,
        model: cpuModel,
        usagePercent: Math.min(cpuUsagePercent, 100),
        loadAverage: loadAvg
      },
      uptime: {
        system: Math.round(systemUptime),
        process: Math.round(processUptime)
      },
      platform: os.platform(),
      hostname: os.hostname()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// OPENCLAW WEBHOOK ENDPOINTS
// ============================================

/**
 * Main OpenClaw Webhook - Called by OpenClaw cron jobs
 * Returns jobs for OpenClaw to process
 */
app.get('/api/openclaw/jobs', authenticateApiKey, async (req, res) => {
  try {
    const { type = 'all', limit = 50 } = req.query;
    const jobs = [];

    if (type === 'all' || type === 'reminders') {
      const reminderJobs = await openclawService.getReminderJobs(parseInt(limit));
      jobs.push(...reminderJobs);
    }

    if (type === 'all' || type === 'installments') {
      const installmentJobs = await openclawService.getInstallmentJobs(parseInt(limit));
      jobs.push(...installmentJobs);
    }

    res.json({
      status: 'ok',
      count: jobs.length,
      jobs
    });
  } catch (error) {
    console.error('OpenClaw jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * OpenClaw Job Report - Called by OpenClaw after processing jobs
 */
app.post('/api/openclaw/report', authenticateApiKey, async (req, res) => {
  const { jobId, jobType, status, error, metadata } = req.body;
  
  try {
    if (status === 'success') {
      await openclawService.markReminderSent(jobId, jobType);
      console.log(`✅ Job ${jobId} marked as sent`);
    } else {
      console.error(`❌ Job ${jobId} failed:`, error);
    }
    
    res.json({ status: 'ok', recorded: true });
  } catch (err) {
    console.error('Job report error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * OpenClaw Status Check - For health monitoring
 */
app.get('/api/openclaw/status', authenticateApiKey, async (req, res) => {
  try {
    const status = await openclawService.getSystemStatus();
    res.json(status);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get Policy Config - For OpenClaw to read runtime config
 */
app.get('/api/openclaw/policy', authenticateApiKey, async (req, res) => {
  try {
    const policy = policyService.getAll();
    res.json({ status: 'ok', policy });
  } catch (error) {
    console.error('Policy error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update Policy - For admin to change runtime config
 */
app.post('/api/openclaw/policy', authenticateApiKey, async (req, res) => {
  const { key, value } = req.body;
  
  try {
    policyService.set(key, value);
    res.json({ status: 'ok', key, value });
  } catch (error) {
    console.error('Policy update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WHATSAPP SEND ENDPOINT (Called by OpenClaw)
// ============================================

/**
 * Send WhatsApp Message - Called by OpenClaw worker (Single Admin Mode)
 */
app.post('/api/whatsapp/send', authenticateApiKey, async (req, res) => {
  const { phone, message, type = 'text' } = req.body;
  
  try {
    // Use global WhatsApp client (single admin mode)
    const client = global.whatsappClient;
    if (!client) {
      throw new Error('WhatsApp client not initialized');
    }

    // Format phone number
    const formattedPhone = phone.replace(/\D/g, '');
    const jid = formattedPhone + '@s.whatsapp.net';

    let result;
    if (type === 'text') {
      result = await client.sendMessage(jid, message);
    } else if (type === 'pdf') {
      // Handle PDF sending if needed
      result = await client.sendMessage(jid, { 
        document: { url: message },
        mimetype: 'application/pdf'
      });
    }

    res.json({ 
      status: 'ok', 
      messageId: result?.key?.id,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('WhatsApp send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LEGACY WEBHOOK (Backward compatibility)
// ============================================

app.post('/api/openclaw/webhook', authenticateApiKey, async (req, res) => {
  const { action, payload } = req.body;
  
  try {
    switch(action) {
      case 'CHECK_REMINDERS':
        const reminders = await debtService.getAllUpcomingReminders(50);
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
        const installments = await loanAgreementService.getUpcomingInstallments(50);
        res.json({
          status: 'ok',
          count: installments.length,
          jobs: installments.map(i => ({
            type: 'SEND_INSTALLMENT_REMINDER',
            installmentId: i.id,
            agreementId: i.agreement_id,
            debtorPhone: i.borrower_phone,
            amount: i.amount,
            dueDate: i.due_date
          }))
        });
        break;
        
      case 'REPORT_STATUS':
        const status = await openclawService.getSystemStatus();
        res.json(status);
        break;
        
      default:
        res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DASHBOARD API
// ============================================

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const userId = 1; // Default for now
        const stats = await getDashboardStats(userId);
        res.json(stats);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: error.message });
    }
});

async function getDashboardStats(userId) {
    const totalPiutang = await debtService.getTotalPending(userId);
    const totalHutang = await debtService.getTotalHutang(userId);
    const activeAgreements = await loanAgreementService.getActiveCount(userId);
    const overdueCount = await debtService.getOverdueCount(userId);
    const monthlyData = reportService.getMonthlyStats(userId, 6);
    const installmentStats = await loanAgreementService.getInstallmentStats(userId);
    const topBorrowers = await debtService.getTopBorrowers(userId, 5);
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

// Dashboard HTML
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
});

// ============================================
// ADMIN ROUTES
// ============================================

// Handle login POST (MUST be before adminRoutes middleware)
app.post('/api/admin/login', express.json(), async (req, res) => {
    console.log('Login request received:', req.body);
    const { apiKey } = req.body;
    
    if (!apiKey) {
        console.log('No API key provided');
        return res.status(400).json({ error: 'API key required' });
    }
    
    console.log('Checking API key:', apiKey.substring(0, 10) + '...');
    console.log('Expected:', process.env.SUPER_ADMIN_API_KEY ? process.env.SUPER_ADMIN_API_KEY.substring(0, 10) + '...' : 'NOT SET');
    
    if (apiKey !== process.env.SUPER_ADMIN_API_KEY) {
        console.log('API key mismatch');
        return res.status(401).json({ error: 'Invalid API key' });
    }
    
    const token = require('crypto').randomBytes(32).toString('hex');
    
    console.log('Login successful');
    res.json({ success: true, token, message: 'Login successful' });
});

// Admin routes
const adminRoutes = require('./adminRoutes');
app.use('/api/admin', adminRoutes);

// Serve admin dashboard
app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/admin/dashboard.html'));
});

app.get('/admin/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Super Admin Login - BukuHutang</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .login-container {
                    background: #1e293b;
                    padding: 40px;
                    border-radius: 20px;
                    border: 1px solid #334155;
                    width: 100%;
                    max-width: 400px;
                    box-shadow: 0 25px 50px rgba(0,0,0,0.5);
                }
                h1 {
                    color: #f8fafc;
                    margin-bottom: 10px;
                    text-align: center;
                }
                .subtitle {
                    color: #94a3b8;
                    text-align: center;
                    margin-bottom: 30px;
                }
                .input-group {
                    margin-bottom: 20px;
                }
                label {
                    color: #cbd5e1;
                    display: block;
                    margin-bottom: 8px;
                    font-size: 14px;
                }
                input[type="password"] {
                    width: 100%;
                    padding: 12px 16px;
                    background: #0f172a;
                    border: 1px solid #334155;
                    border-radius: 10px;
                    color: #f8fafc;
                    font-size: 16px;
                }
                input[type="password"]:focus {
                    outline: none;
                    border-color: #3b82f6;
                }
                button {
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
                    border: none;
                    border-radius: 10px;
                    color: white;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                }
                button:hover {
                    transform: translateY(-2px);
                }
                #error {
                    color: #ef4444;
                    margin-top: 15px;
                    text-align: center;
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h1>🔐 Super Admin</h1>
                <p class="subtitle">BukuHutang Dashboard</p>
                <form id="loginForm">
                    <div class="input-group">
                        <label>API Key</label>
                        <input type="password" name="apiKey" id="apiKey" placeholder="Masukkan Super Admin API Key" required />
                    </div>
                    <button type="submit">Login</button>
                    <p id="error"></p>
                </form>
            </div>
            <script>
                document.getElementById('loginForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const apiKey = document.getElementById('apiKey').value;
                    
                    const res = await fetch('/api/admin/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ apiKey })
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        localStorage.setItem('adminApiKey', apiKey);
                        window.location.href = '/admin/dashboard';
                    } else {
                        document.getElementById('error').style.display = 'block';
                        document.getElementById('error').textContent = 'API Key salah!';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

module.exports = app;
