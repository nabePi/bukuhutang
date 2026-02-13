const { getConnection } = require('../db/connection');

class DebtService {
  constructor() {
    this.db = getConnection();
  }

  createDebt({ userId, debtorName, debtorPhone, amount, description, days }) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + days);
    
    const stmt = this.db.prepare(`
      INSERT INTO debts (user_id, debtor_name, debtor_phone, amount, description, due_date, reminder_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Set reminder 1 day before due
    const reminderTime = new Date(dueDate);
    reminderTime.setDate(reminderTime.getDate() - 1);
    
    const result = stmt.run(userId, debtorName, debtorPhone, amount, description, dueDate.toISOString().split('T')[0], reminderTime.toISOString());
    
    return this.getDebtById(result.lastInsertRowid);
  }

  getDebtById(id) {
    const stmt = this.db.prepare('SELECT * FROM debts WHERE id = ?');
    return stmt.get(id);
  }

  getPendingDebts(userId) {
    const stmt = this.db.prepare(`
      SELECT * FROM debts 
      WHERE user_id = ? AND status = 'pending'
      ORDER BY due_date ASC
    `);
    return stmt.all(userId);
  }

  getOverdueDebts(userId) {
    const stmt = this.db.prepare(`
      SELECT * FROM debts 
      WHERE user_id = ? AND status = 'pending' AND due_date < date('now')
      ORDER BY due_date ASC
    `);
    return stmt.all(userId);
  }

  getUpcomingReminders() {
    const stmt = this.db.prepare(`
      SELECT d.*, u.phone_number as owner_phone
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

  getSummary(userId) {
    const totalDebt = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM debts 
      WHERE user_id = ? AND status = 'pending'
    `).get(userId);

    const overdueCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM debts 
      WHERE user_id = ? AND status = 'pending' AND due_date < date('now')
    `).get(userId);

    return {
      totalPending: totalDebt.total,
      overdueCount: overdueCount.count
    };
  }

  getPendingCount() {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM debts WHERE status = 'pending'`);
    return stmt.get().count;
  }

  getOverdueCount() {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM debts WHERE status = 'pending' AND due_date < date('now')`);
    return stmt.get().count;
  }

  // Dashboard methods
  getTotalPending(userId) {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM debts 
      WHERE user_id = ? AND status = 'pending'
    `);
    return stmt.get(userId).total;
  }

  getTotalHutang(userId) {
    // For user's own debts (if any) - placeholder implementation
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM debts 
      WHERE user_id = ? AND status = 'pending'
    `);
    return stmt.get(userId).total;
  }

  getTopBorrowers(userId, limit = 5) {
    const stmt = this.db.prepare(`
      SELECT debtor_name as name, SUM(amount) as amount 
      FROM debts 
      WHERE user_id = ? AND status = 'pending'
      GROUP BY debtor_name 
      ORDER BY amount DESC 
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  }

  getRecentTransactions(userId, limit = 10) {
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
      WHERE user_id = ?
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  }
}

module.exports = new DebtService();
