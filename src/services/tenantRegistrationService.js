const { getConnection } = require('../db/connection');
const multiSessionManager = require('../whatsapp/multiSessionManager');

class TenantRegistrationService {
  constructor() {
    this.db = getConnection();
  }

  async registerTenant({ phoneNumber, name, email }) {
    // Normalize phone number
    const normalizedPhone = phoneNumber.replace(/[^0-9]/g, '');
    
    // Check if already exists
    const existing = this.db.prepare('SELECT * FROM tenants WHERE phone_number = ?').get(normalizedPhone);
    if (existing) {
      throw new Error('Nomor WhatsApp sudah terdaftar');
    }

    // Create tenant
    const result = this.db.prepare(`
      INSERT INTO tenants (phone_number, name, email, status)
      VALUES (?, ?, ?, 'pending_qr')
    `).run(normalizedPhone, name, email || null);

    const tenantId = result.lastInsertRowid;

    // Create default settings
    this.db.prepare(`
      INSERT INTO tenant_settings (tenant_id) VALUES (?)
    `).run(tenantId);

    // Initialize WhatsApp session
    await multiSessionManager.createSession(tenantId, normalizedPhone);

    return {
      tenantId,
      phoneNumber: normalizedPhone,
      status: 'pending_qr',
      message: 'Silakan scan QR code yang akan muncul untuk menghubungkan WhatsApp'
    };
  }

  async activateTenant(tenantId) {
    const session = multiSessionManager.getSession(tenantId);
    if (!session || !session.connected) {
      throw new Error('WhatsApp belum terhubung. Silakan scan QR code dulu.');
    }

    this.db.prepare('UPDATE tenants SET status = ? WHERE id = ?')
      .run('active', tenantId);

    return { success: true, message: 'Tenant aktif! Bisa mulai pakai BukuHutang.' };
  }

  getTenantStatus(tenantId) {
    const tenant = this.db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    if (!tenant) return null;

    const session = multiSessionManager.getSession(tenantId);
    
    return {
      ...tenant,
      whatsapp_connected: session?.connected || false,
      waiting_for_qr: session?.qr && !session?.connected
    };
  }

  getTenantByPhone(phoneNumber) {
    const normalizedPhone = phoneNumber.replace(/[^0-9]/g, '');
    return this.db.prepare('SELECT * FROM tenants WHERE phone_number = ?').get(normalizedPhone);
  }

  listAllTenants() {
    return this.db.prepare(`
      SELECT t.*, 
             (SELECT COUNT(*) FROM debts WHERE tenant_id = t.id) as debt_count,
             (SELECT COUNT(*) FROM loan_agreements WHERE lender_id = t.id) as agreement_count
      FROM tenants t
      ORDER BY t.created_at DESC
    `).all();
  }

  async deactivateTenant(tenantId) {
    await multiSessionManager.closeSession(tenantId);
    this.db.prepare('UPDATE tenants SET status = ? WHERE id = ?')
      .run('inactive', tenantId);
    return { success: true };
  }
  
  async updateTenantPlan(tenantId, plan) {
    const validPlans = ['free', 'basic', 'pro', 'enterprise'];
    if (!validPlans.includes(plan)) {
      throw new Error('Plan tidak valid. Pilihan: free, basic, pro, enterprise');
    }
    
    this.db.prepare('UPDATE tenants SET plan = ? WHERE id = ?').run(plan, tenantId);
    return { success: true, plan };
  }
  
  getTenantStats(tenantId) {
    const tenant = this.db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    if (!tenant) return null;
    
    const debtStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_debts,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as total_pending,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as total_paid,
        COUNT(CASE WHEN status = 'pending' AND due_date < date('now') THEN 1 END) as overdue_count
      FROM debts WHERE tenant_id = ?
    `).get(tenantId);
    
    const agreementStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_agreements,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_agreements,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_agreements
      FROM loan_agreements WHERE lender_id = ?
    `).get(tenantId);
    
    return {
      ...tenant,
      debts: debtStats,
      agreements: agreementStats
    };
  }
  
  deductAICredit(tenantId, amount = 1) {
    const result = this.db.prepare(`
      UPDATE tenants 
      SET ai_credits = MAX(0, ai_credits - ?)
      WHERE id = ? AND ai_credits >= ?
    `).run(amount, tenantId, amount);
    
    return result.changes > 0;
  }
  
  addAICredits(tenantId, amount) {
    this.db.prepare(`
      UPDATE tenants SET ai_credits = ai_credits + ? WHERE id = ?
    `).run(amount, tenantId);
    return { success: true };
  }
}

module.exports = new TenantRegistrationService();
