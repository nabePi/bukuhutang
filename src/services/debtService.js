const { getConnection } = require('../db/connection');

class DebtService {
  constructor() {
    this.db = getConnection();
  }

  createDebt({ tenantId, userId, debtorName, debtorPhone, amount, description, days }) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + days);
    
    const stmt = this.db.prepare(`
      INSERT INTO debts (tenant_id, user_id, debtor_name, debtor_phone, amount, description, due_date, reminder_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Set reminder 1 day before due
    const reminderTime = new Date(dueDate);
    reminderTime.setDate(reminderTime.getDate() - 1);
    
    const result = stmt.run(tenantId, userId, debtorName, debtorPhone, amount, description, dueDate.toISOString().split('T')[0], reminderTime.toISOString());
    
    return this.getDebtById(result.lastInsertRowid);
  }

  getDebtById(id) {
    const stmt = this.db.prepare('SELECT * FROM debts WHERE id = ?');
    return stmt.get(id);
  }

  getPendingDebts(tenantId, userId) {
    const stmt = this.db.prepare(`
      SELECT * FROM debts 
      WHERE tenant_id = ? AND user_id = ? AND status = 'pending'
      ORDER BY due_date ASC
    `);
    return stmt.all(tenantId, userId);
  }

  getOverdueDebts(tenantId, userId) {
    const stmt = this.db.prepare(`
      SELECT * FROM debts 
      WHERE tenant_id = ? AND user_id = ? AND status = 'pending' AND due_date < date('now')
      ORDER BY due_date ASC
    `);
    return stmt.all(tenantId, userId);
  }

  getUpcomingReminders(tenantId) {
    const stmt = this.db.prepare(`
      SELECT d.*, u.phone_number as owner_phone
      FROM debts d
      JOIN users u ON d.user_id = u.id
      WHERE d.tenant_id = ? AND d.reminder_time <= datetime('now')
      AND d.reminder_sent = 0
      AND d.status = 'pending'
      LIMIT 100
    `);
    return stmt.all(tenantId);
  }
  
  // Get all upcoming reminders across all tenants (for cron job)
  getAllUpcomingReminders() {
    const stmt = this.db.prepare(`
      SELECT d.*, u.phone_number as owner_phone, d.tenant_id
      FROM debts d
      JOIN users u ON d.user_id = u.id
      WHERE d.reminder_time <= datetime('now')
      AND d.reminder_sent = 0
      AND d.status = 'pending'
      LIMIT 100
    `);
    return stmt.all();
  }

  markReminderSent(debtId) {
    const stmt = this.db.prepare(`
      UPDATE debts SET reminder_sent = 1 WHERE id = ?
    `);
    stmt.run(debtId);
  }

  markAsPaid(debtId) {
    const stmt = this.db.prepare(`
      UPDATE debts SET status = 'paid', paid_at = datetime('now') WHERE id = ?
    `);
    stmt.run(debtId);
  }

  getSummary(tenantId, userId) {
    const totalDebt = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM debts 
      WHERE tenant_id = ? AND user_id = ? AND status = 'pending'
    `).get(tenantId, userId);

    const overdueCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM debts 
      WHERE tenant_id = ? AND user_id = ? AND status = 'pending' AND due_date < date('now')
    `).get(tenantId, userId);

    return {
      totalPending: totalDebt.total,
      overdueCount: overdueCount.count
    };
  }

  getPendingCount(tenantId) {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM debts WHERE tenant_id = ? AND status = 'pending'`);
    return stmt.get(tenantId).count;
  }

  getOverdueCount(tenantId) {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM debts WHERE tenant_id = ? AND status = 'pending' AND due_date < date('now')`);
    return stmt.get(tenantId).count;
  }

  // Dashboard methods
  getTotalPending(tenantId, userId) {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM debts 
      WHERE tenant_id = ? AND user_id = ? AND status = 'pending'
    `);
    return stmt.get(tenantId, userId).total;
  }

  getTotalHutang(tenantId, userId) {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM debts 
      WHERE tenant_id = ? AND user_id = ? AND status = 'pending'
    `);
    return stmt.get(tenantId, userId).total;
  }

  getTopBorrowers(tenantId, userId, limit = 5) {
    const stmt = this.db.prepare(`
      SELECT debtor_name as name, SUM(amount) as amount 
      FROM debts 
      WHERE tenant_id = ? AND user_id = ? AND status = 'pending'
      GROUP BY debtor_name 
      ORDER BY amount DESC 
      LIMIT ?
    `);
    return stmt.all(tenantId, userId, limit);
  }

  getRecentTransactions(tenantId, userId, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT 
        created_at as date,
        debtor_name as name,
        CASE 
          WHEN status = 'paid' THEN 'Pembayaran'
          ELSE 'Pinjaman'
        END as type,
        amount,
        status
      FROM debts 
      WHERE tenant_id = ? AND user_id = ?
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(tenantId, userId, limit);
  }
  
  // Check if tenant has reached max debts limit
  checkDebtLimit(tenantId, maxDebts) {
    const currentCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM debts WHERE tenant_id = ?
    `).get(tenantId).count;
    
    return {
      current: currentCount,
      max: maxDebts,
      exceeded: currentCount >= maxDebts
    };
  }

  // Get debts due for reminder within days window (for OpenClaw cron)
  getDebtsDueForReminder(daysBeforeDue, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT 
        d.*, 
        u.phone_number as owner_phone,
        julianday(d.due_date) - julianday('now') as days_until_due
      FROM debts d
      JOIN users u ON d.user_id = u.id
      WHERE d.status = 'pending'
      AND d.reminder_sent = 0
      AND julianday(d.due_date) - julianday('now') <= ?
      AND julianday(d.due_date) - julianday('now') >= -30
      ORDER BY d.due_date ASC
      LIMIT ?
    `);
    return stmt.all(daysBeforeDue, limit);
  }
}

module.exports = new DebtService();
