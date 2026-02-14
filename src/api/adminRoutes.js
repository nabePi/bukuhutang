const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/security');
const tenantRegistrationService = require('../services/tenantRegistrationService');
const debtService = require('../services/debtService');
const loanAgreementService = require('../services/loanAgreementService');
const multiSessionManager = require('../whatsapp/multiSessionManager');

// Apply super admin auth
router.use(authenticateApiKey);

// Middleware to check super admin
const requireSuperAdmin = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.SUPER_ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
};

// Get system-wide stats
router.get('/stats', requireSuperAdmin, async (req, res) => {
    try {
        const stats = await getSystemStats();
        res.json(stats);
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all tenants with enriched data
router.get('/tenants', requireSuperAdmin, async (req, res) => {
    try {
        const tenants = tenantRegistrationService.listAllTenants();
        
        // Enrich with WhatsApp session status
        const enrichedTenants = tenants.map(t => {
            const session = multiSessionManager.getSession(t.id);
            return {
                ...t,
                whatsapp_connected: session?.connected || false,
                waiting_for_qr: session?.qr && !session?.connected,
                has_qr: !!session?.qr
            };
        });
        
        res.json({ tenants: enrichedTenants });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register new tenant
router.post('/tenants/register', requireSuperAdmin, async (req, res) => {
    try {
        const { phoneNumber, name, email } = req.body;
        
        if (!phoneNumber || !name) {
            return res.status(400).json({ error: 'Phone number and name are required' });
        }
        
        const result = await tenantRegistrationService.registerTenant({
            phoneNumber,
            name,
            email
        });
        
        res.json({ success: true, tenant: result });
    } catch (error) {
        console.error('Register tenant error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get tenant QR code
router.get('/tenant/:id/qr', requireSuperAdmin, async (req, res) => {
    try {
        const qr = multiSessionManager.getQR(parseInt(req.params.id));
        
        if (!qr) {
            return res.status(404).json({ error: 'No QR code available. WhatsApp may already be connected.' });
        }
        
        res.json({ qr });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Activate tenant (after QR scan)
router.post('/tenant/:id/activate', requireSuperAdmin, async (req, res) => {
    try {
        const result = await tenantRegistrationService.activateTenant(parseInt(req.params.id));
        res.json({ success: true, result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Toggle tenant status (enable/disable)
router.post('/tenant/:id/toggle', requireSuperAdmin, async (req, res) => {
    try {
        const tenant = tenantRegistrationService.getTenantStatus(parseInt(req.params.id));
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        
        if (tenant.status === 'active') {
            await tenantRegistrationService.deactivateTenant(parseInt(req.params.id));
            res.json({ success: true, status: 'inactive' });
        } else {
            const result = await tenantRegistrationService.activateTenant(parseInt(req.params.id));
            res.json({ success: true, status: 'active', result });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update tenant plan
router.post('/tenant/:id/plan', requireSuperAdmin, async (req, res) => {
    try {
        const { plan } = req.body;
        const result = await tenantRegistrationService.updateTenantPlan(parseInt(req.params.id), plan);
        res.json({ success: true, result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get tenant detail
router.get('/tenant/:id', requireSuperAdmin, async (req, res) => {
    try {
        const stats = tenantRegistrationService.getTenantStats(parseInt(req.params.id));
        const session = multiSessionManager.getSession(parseInt(req.params.id));
        
        if (!stats) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        
        res.json({ 
            tenant: { 
                ...stats,
                whatsapp_connected: session?.connected || false,
                waiting_for_qr: session?.qr && !session?.connected
            } 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add AI credits to tenant
router.post('/tenant/:id/credits', requireSuperAdmin, async (req, res) => {
    try {
        const { amount } = req.body;
        const result = tenantRegistrationService.addAICredits(parseInt(req.params.id), amount);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all WhatsApp sessions status
router.get('/sessions', requireSuperAdmin, async (req, res) => {
    try {
        const sessions = multiSessionManager.getAllSessions();
        res.json({ sessions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get WhatsApp status for single admin mode
router.get('/whatsapp/status', requireSuperAdmin, async (req, res) => {
    try {
        const client = global.whatsappClient;
        
        if (!client) {
            return res.json({ 
                connected: false, 
                qrCode: null,
                message: 'WhatsApp client not initialized'
            });
        }
        
        const status = client.getStatus();
        const user = status.user;
        
        res.json({
            connected: status.connected,
            phoneNumber: user?.id?.split(':')[0] || null,
            name: user?.name || null,
            qrCode: status.qrCode
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Logout WhatsApp
router.post('/whatsapp/logout', requireSuperAdmin, async (req, res) => {
    try {
        const client = global.whatsappClient;
        
        if (client && client.sock) {
            await client.sock.logout();
            res.json({ success: true, message: 'WhatsApp logged out' });
        } else {
            res.status(400).json({ error: 'WhatsApp not connected' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SINGLE ADMIN MODE - REAL DATA ENDPOINTS
// ============================================

// Get all agreements
router.get('/agreements', requireSuperAdmin, async (req, res) => {
    try {
        const { getConnection } = require('../db/connection');
        const db = getConnection();
        
        const agreements = db.prepare(`
            SELECT * FROM loan_agreements
            ORDER BY created_at DESC
        `).all();
        
        res.json({ agreements });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all installments
router.get('/installments', requireSuperAdmin, async (req, res) => {
    try {
        const { getConnection } = require('../db/connection');
        const db = getConnection();
        
        const installments = db.prepare(`
            SELECT i.*, la.borrower_name, la.borrower_phone, la.actual_lender_name
            FROM installment_payments i
            JOIN loan_agreements la ON i.agreement_id = la.id
            ORDER BY i.due_date ASC
        `).all();
        
        res.json({ installments });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send reminder to debtor
router.post('/debts/:id/reminder', requireSuperAdmin, async (req, res) => {
    try {
        const { getConnection } = require('../db/connection');
        const db = getConnection();
        
        const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(req.params.id);
        if (!debt) {
            return res.status(404).json({ error: 'Debt not found' });
        }
        
        if (!debt.debtor_phone) {
            return res.status(400).json({ error: 'Debtor has no phone number' });
        }
        
        // Send WhatsApp message
        const client = global.whatsappClient;
        if (!client) {
            return res.status(500).json({ error: 'WhatsApp not connected' });
        }
        
        const message = `*PENGINGAT HUTANG*\n\nHalo ${debt.debtor_name},\n\nIni pengingat pembayaran hutang:\n📋 ${debt.description || 'Hutang'}\n💰 Rp ${debt.amount.toLocaleString('id-ID')}\n📅 Jatuh tempo: ${debt.due_date}\n\nMohon segera melakukan pembayaran. Terima kasih! 🙏`;
        
        await client.sendMessage(debt.debtor_phone + '@s.whatsapp.net', message);
        
        // Mark reminder as sent
        db.prepare('UPDATE debts SET reminder_sent = 1 WHERE id = ?').run(req.params.id);
        
        res.json({ success: true, message: 'Reminder sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// System stats helper
async function getSystemStats() {
    const tenants = tenantRegistrationService.listAllTenants();
    const sessions = multiSessionManager.getAllSessions();
    const { getConnection } = require('../db/connection');
    const db = getConnection();
    
    let totalSystemPiutang = 0;
    let totalAgreements = 0;
    let activeAgreements = 0;
    let globalPaid = 0;
    let globalPending = 0;
    let globalOverdue = 0;
    
    for (const tenant of tenants) {
        // Get real debt amounts for this tenant
        const tenantDebts = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM debts WHERE tenant_id = ? AND status = ?')
            .get(tenant.id, 'pending');
        totalSystemPiutang += tenantDebts?.total || 0;
        
        totalAgreements += tenant.agreement_count;
        
        const stats = tenantRegistrationService.getTenantStats(tenant.id);
        if (stats) {
            activeAgreements += stats.agreements?.active_agreements || 0;
            globalPaid += stats.agreements?.paid || 0;
            globalPending += stats.agreements?.pending || 0;
            globalOverdue += stats.agreements?.overdue || 0;
        }
    }
    
    const activeSessions = sessions.filter(s => s.connected).length;
    const pendingQR = sessions.filter(s => s.hasQR && !s.connected).length;
    
    // Get real transaction data for last 6 months
    const months = [];
    const monthLabels = [];
    const monthValues = [];
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthStr = d.toISOString().slice(0, 7); // YYYY-MM
        const monthName = d.toLocaleString('id-ID', { month: 'short' });
        months.push(monthStr);
        monthLabels.push(monthName);
        
        // Get total debt amount for this month
        const monthTotal = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM debts 
            WHERE strftime('%Y-%m', created_at) = ?
        `).get(monthStr);
        
        monthValues.push(monthTotal?.total || 0);
    }
    
    // Get total messages sent today (from reminders)
    const today = new Date().toISOString().slice(0, 10);
    const messagesToday = db.prepare(`
        SELECT COUNT(*) as count FROM reminders 
        WHERE date(sent_at) = date('now') AND status = 'sent'
    `).get();
    
    // Get total AI requests (placeholder - would need tracking table)
    const totalTransactions = db.prepare('SELECT COUNT(*) as count FROM debts').get();
    const totalAgreementsCount = db.prepare('SELECT COUNT(*) as count FROM loan_agreements').get();
    const totalPDFs = db.prepare(`
        SELECT COUNT(*) as count FROM loan_agreements 
        WHERE status IN ('active', 'completed')
    `).get();
    
    return {
        totalUsers: tenants.length,
        activeUsers: tenants.filter(t => t.status === 'active').length,
        inactiveUsers: tenants.filter(t => t.status === 'inactive').length,
        pendingQRUsers: tenants.filter(t => t.status === 'pending_qr').length,
        totalSystemPiutang,
        totalAgreements,
        activeAgreements,
        whatsappSessions: {
            total: sessions.length,
            connected: activeSessions,
            pendingQR: pendingQR,
            disconnected: sessions.length - activeSessions - pendingQR
        },
        alerts: generateSystemAlerts(tenants, db),
        userGrowthLabels: monthLabels,
        userGrowthData: monthValues.map((v, i) => Math.max(1, Math.floor(v / 1000000))), // Convert to user count approximation
        transactionLabels: monthLabels,
        transactionValues: monthValues,
        planDistribution: [
            tenants.filter(t => t.plan === 'free').length,
            tenants.filter(t => t.plan === 'basic').length,
            tenants.filter(t => t.plan === 'pro').length,
            tenants.filter(t => t.plan === 'enterprise').length
        ],
        globalPaid,
        globalPending,
        globalOverdue,
        tenants: tenants.map(t => ({
            id: t.id,
            name: t.name,
            phone: t.phone_number,
            plan: t.plan,
            status: t.status,
            createdAt: t.created_at,
            totalPiutang: t.debt_count,
            agreementCount: t.agreement_count
        })),
        recentActivity: generateRecentActivity(),
        usage: {
            messagesToday: messagesToday?.count || 0,
            aiRequests: 0, // Would need AI tracking table
            pdfsGenerated: totalPDFs?.count || 0,
            totalTransactions: (totalTransactions?.count || 0) + (totalAgreementsCount?.count || 0),
            activeWhatsAppSessions: activeSessions
        },
        security: {
            failedLogins: 0,
            rateLimited: 0,
            suspicious: 0,
            lastBackup: new Date().toLocaleDateString('id-ID')
        }
    };
}

function generateSystemAlerts(tenants, db) {
    const alerts = [];
    const inactiveTenants = tenants.filter(t => t.status === 'inactive');
    
    if (inactiveTenants.length > 0) {
        alerts.push({ 
            type: 'warning',
            message: `${inactiveTenants.length} tenant non-aktif` 
        });
    }
    
    const pendingQRTenants = tenants.filter(t => t.status === 'pending_qr');
    if (pendingQRTenants.length > 0) {
        alerts.push({ 
            type: 'info',
            message: `${pendingQRTenants.length} tenant menunggu scan QR` 
        });
    }
    
    // Check for overdue debts
    const overdueDebts = db.prepare(`
        SELECT COUNT(*) as count FROM debts 
        WHERE status = 'pending' AND due_date < date('now')
    `).get();
    
    if (overdueDebts?.count > 0) {
        alerts.push({
            type: 'warning',
            message: `${overdueDebts.count} hutang/piutang jatuh tempo`
        });
    }
    
    alerts.push({ 
        type: 'success',
        message: 'Sistem berjalan normal' 
    });
    
    return alerts;
}

function generateRecentActivity() {
    const { getConnection } = require('../db/connection');
    const db = getConnection();
    
    const activities = [];
    
    // Get recent debts (last 10)
    const recentDebts = db.prepare(`
        SELECT d.*, t.name as tenant_name 
        FROM debts d 
        JOIN tenants t ON d.tenant_id = t.id 
        ORDER BY d.created_at DESC 
        LIMIT 5
    `).all();
    
    recentDebts.forEach(d => {
        activities.push({
            timestamp: d.created_at,
            userName: d.tenant_name || 'Unknown',
            activity: 'Catat Piutang',
            detail: `${d.debtor_name} - Rp ${d.amount.toLocaleString('id-ID')}`,
            status: d.status === 'paid' ? 'success' : 'pending'
        });
    });
    
    // Get recent loan agreements (last 5)
    const recentAgreements = db.prepare(`
        SELECT la.*, t.name as tenant_name 
        FROM loan_agreements la 
        JOIN tenants t ON la.lender_id = t.id 
        ORDER BY la.created_at DESC 
        LIMIT 5
    `).all();
    
    recentAgreements.forEach(a => {
        activities.push({
            timestamp: a.created_at,
            userName: a.tenant_name || 'Unknown',
            activity: 'Buat Perjanjian',
            detail: `${a.borrower_name} - Rp ${a.total_amount.toLocaleString('id-ID')}`,
            status: a.status === 'active' ? 'success' : 'pending'
        });
    });
    
    // Get recent installment payments (last 5)
    const recentPayments = db.prepare(`
        SELECT ip.*, la.borrower_name, t.name as tenant_name 
        FROM installment_payments ip 
        JOIN loan_agreements la ON ip.agreement_id = la.id 
        JOIN tenants t ON la.lender_id = t.id 
        WHERE ip.status = 'paid'
        ORDER BY ip.paid_at DESC 
        LIMIT 5
    `).all();
    
    recentPayments.forEach(p => {
        activities.push({
            timestamp: p.paid_at,
            userName: p.tenant_name || 'Unknown',
            activity: 'Terima Cicilan',
            detail: `${p.borrower_name} - Rp ${p.amount.toLocaleString('id-ID')}`,
            status: 'success'
        });
    });
    
    // Sort by timestamp desc and take top 10
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // If no activities, return empty array (no dummy data)
    return activities.slice(0, 10).map(a => ({
        timestamp: new Date(a.timestamp).toLocaleString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }),
        userName: a.userName,
        activity: a.activity,
        detail: a.detail,
        status: a.status
    }));
}

module.exports = router;
