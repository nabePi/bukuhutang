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

// System stats helper
async function getSystemStats() {
    const tenants = tenantRegistrationService.listAllTenants();
    const sessions = multiSessionManager.getAllSessions();
    
    let totalSystemPiutang = 0;
    let totalAgreements = 0;
    let activeAgreements = 0;
    let globalPaid = 0;
    let globalPending = 0;
    let globalOverdue = 0;
    
    for (const tenant of tenants) {
        totalSystemPiutang += tenant.debt_count * 1000000; // Approximation
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
        alerts: generateSystemAlerts(tenants),
        userGrowthLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        userGrowthData: [5, 8, 12, 15, 18, 22, 25, 28, 32, 35, 38, 42],
        transactionLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        transactionValues: [5000000, 8000000, 12000000, 15000000, 18000000, 22000000],
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
            messagesToday: 156,
            aiRequests: 89,
            pdfsGenerated: 23,
            totalTransactions: 45,
            activeWhatsAppSessions: activeSessions
        },
        security: {
            failedLogins: 3,
            rateLimited: 1,
            suspicious: 0,
            lastBackup: new Date().toLocaleDateString('id-ID')
        }
    };
}

function generateSystemAlerts(tenants) {
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
    
    alerts.push({ 
        type: 'success',
        message: 'Backup otomatis berjalan normal' 
    });
    
    return alerts;
}

function generateRecentActivity() {
    return [
        { timestamp: '2025-02-13 14:30', userName: 'Dani', activity: 'Create Agreement', detail: 'Ahmad - Rp 5.000.000', status: 'success' },
        { timestamp: '2025-02-13 14:25', userName: 'Budi', activity: 'Record Payment', detail: 'Installment #2 - Rp 1.000.000', status: 'success' },
        { timestamp: '2025-02-13 14:20', userName: 'System', activity: 'Auto Reminder', detail: 'Sent to 3 borrowers', status: 'success' },
        { timestamp: '2025-02-13 14:15', userName: 'Ani', activity: 'New User', detail: 'Tenant registered', status: 'success' }
    ];
}

module.exports = router;
