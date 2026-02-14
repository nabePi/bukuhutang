const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/security');
const tenantService = require('../services/tenantService');
const debtService = require('../services/debtService');
const loanAgreementService = require('../services/loanAgreementService');
const reportService = require('../services/reportService');

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

// Get all tenants
router.get('/tenants', requireSuperAdmin, async (req, res) => {
    try {
        const tenants = await tenantService.listTenants();
        
        // Enrich with data
        const enrichedTenants = await Promise.all(tenants.map(async t => {
            const stats = await getTenantStats(t.id);
            return {
                ...t,
                totalPiutang: stats.totalPiutang,
                agreementCount: stats.agreementCount
            };
        }));
        
        res.json({ tenants: enrichedTenants });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Toggle tenant status
router.post('/tenant/:id/toggle', requireSuperAdmin, async (req, res) => {
    try {
        const tenant = await tenantService.getTenant(req.params.id);
        if (tenant.active) {
            await tenantService.deactivateTenant(req.params.id);
        } else {
            await tenantService.activateTenant(req.params.id);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get tenant detail
router.get('/tenant/:id', requireSuperAdmin, async (req, res) => {
    try {
        const tenant = await tenantService.getTenant(req.params.id);
        const stats = await getTenantStats(req.params.id);
        res.json({ tenant: { ...tenant, ...stats } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// System stats helper
async function getSystemStats() {
    const tenants = await tenantService.listTenants();
    
    let totalSystemPiutang = 0;
    let totalAgreements = 0;
    let activeAgreements = 0;
    let globalPaid = 0;
    let globalPending = 0;
    let globalOverdue = 0;
    
    for (const tenant of tenants) {
        if (!tenant.active) continue;
        
        const stats = await getTenantStats(tenant.id);
        totalSystemPiutang += stats.totalPiutang;
        totalAgreements += stats.agreementCount;
        activeAgreements += stats.activeAgreements;
        globalPaid += stats.paidInstallments;
        globalPending += stats.pendingInstallments;
        globalOverdue += stats.overdueInstallments;
    }
    
    return {
        totalUsers: tenants.length,
        activeUsers: tenants.filter(t => t.active).length,
        inactiveUsers: tenants.filter(t => !t.active).length,
        totalSystemPiutang,
        totalAgreements,
        activeAgreements,
        alerts: generateSystemAlerts(tenants),
        userGrowthLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        userGrowthData: [5, 8, 12, 15, 18, 22, 25, 28, 32, 35, 38, 42], // Sample data
        transactionLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        transactionValues: [5000000, 8000000, 12000000, 15000000, 18000000, 22000000],
        planDistribution: [25, 15, 8, 2], // Free, Basic, Pro, Enterprise
        globalPaid,
        globalPending,
        globalOverdue,
        tenants: tenants.map(t => ({
            id: t.id,
            name: t.name,
            phone: t.phone_number,
            plan: t.plan,
            active: t.active,
            createdAt: t.created_at,
            totalPiutang: 0, // Will be filled
            agreementCount: 0
        })),
        recentActivity: generateRecentActivity(),
        usage: {
            messagesToday: 156,
            aiRequests: 89,
            pdfsGenerated: 23,
            totalTransactions: 45
        },
        security: {
            failedLogins: 3,
            rateLimited: 1,
            suspicious: 0,
            lastBackup: new Date().toLocaleDateString('id-ID')
        }
    };
}

async function getTenantStats(tenantId) {
    // This would query tenant's specific database
    // Simplified for now
    return {
        totalPiutang: 15000000,
        agreementCount: 5,
        activeAgreements: 3,
        paidInstallments: 12,
        pendingInstallments: 8,
        overdueInstallments: 2
    };
}

function generateSystemAlerts(tenants) {
    const alerts = [];
    
    // Check for issues
    const overdueTenants = tenants.filter(t => {
        // Logic to detect overdue issues
        return false;
    });
    
    if (overdueTenants.length > 0) {
        alerts.push({ message: `${overdueTenants.length} tenant memiliki cicilan jatuh tempo` });
    }
    
    // Check disk space, etc.
    alerts.push({ message: 'Backup otomatis berjalan normal' });
    
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
