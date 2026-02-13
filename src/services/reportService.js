const { getConnection } = require('../db/connection');
const xlsx = require('xlsx');

class ReportService {
  constructor() {
    this.db = getConnection();
  }

  // Generate monthly report
  generateMonthlyReport(userId, year, month) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
    
    // Get all debts for the month
    const debts = this.db.prepare(`
      SELECT * FROM debts 
      WHERE user_id = ? 
      AND (created_at BETWEEN ? AND ? OR paid_at BETWEEN ? AND ?)
      ORDER BY created_at DESC
    `).all(userId, startDate, endDate, startDate, endDate);
    
    // Get installments paid
    const installments = this.db.prepare(`
      SELECT i.*, a.borrower_name
      FROM installment_payments i
      JOIN loan_agreements a ON i.agreement_id = a.id
      WHERE a.lender_id = ?
      AND i.paid_at BETWEEN ? AND ?
      ORDER BY i.paid_at DESC
    `).all(userId, startDate, endDate);
    
    const totalCollected = installments.reduce((sum, i) => sum + (i.paid_amount || 0), 0);
    const totalLent = debts.filter(d => d.status === 'pending').reduce((sum, d) => sum + d.amount, 0);
    
    return {
      period: `${month}/${year}`,
      totalCollected,
      totalLent,
      activeDebts: debts.filter(d => d.status === 'pending').length,
      completedDebts: debts.filter(d => d.status === 'paid').length,
      installmentsReceived: installments.length,
      details: { debts, installments }
    };
  }

  // Export to Excel
  exportToExcel(userId, type = 'debts') {
    let data;
    let filename;
    
    if (type === 'debts') {
      data = this.db.prepare(`
        SELECT debtor_name, amount, description, due_date, status, created_at
        FROM debts WHERE user_id = ?
      `).all(userId);
      filename = `bukuhutang-debts-${Date.now()}.xlsx`;
    } else if (type === 'agreements') {
      data = this.db.prepare(`
        SELECT borrower_name, total_amount, installment_amount, 
               installment_count, status, created_at, signed_at
        FROM loan_agreements WHERE lender_id = ?
      `).all(userId);
      filename = `bukuhutang-agreements-${Date.now()}.xlsx`;
    }
    
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Data');
    
    const outputPath = `./data/reports/${filename}`;
    require('fs').mkdirSync('./data/reports', { recursive: true });
    xlsx.writeFile(wb, outputPath);
    
    return { filename, path: outputPath };
  }

  // Get summary stats
  getDashboardStats(userId) {
    const totalLent = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM debts 
      WHERE user_id = ? AND status = 'pending'
    `).get(userId);
    
    const totalCollected = this.db.prepare(`
      SELECT COALESCE(SUM(paid_amount), 0) as total 
      FROM installment_payments ip
      JOIN loan_agreements la ON ip.agreement_id = la.id
      WHERE la.lender_id = ? AND ip.status = 'paid'
    `).get(userId);
    
    const activeAgreements = this.db.prepare(`
      SELECT COUNT(*) as count FROM loan_agreements 
      WHERE lender_id = ? AND status = 'active'
    `).get(userId);
    
    const overdueDebts = this.db.prepare(`
      SELECT COUNT(*) as count FROM debts 
      WHERE user_id = ? AND status = 'pending' AND due_date < date('now')
    `).get(userId);
    
    return {
      totalLent: totalLent.total,
      totalCollected: totalCollected.total,
      activeAgreements: activeAgreements.count,
      overdueDebts: overdueDebts.count,
      netPosition: totalCollected.total - totalLent.total
    };
  }

  // Get monthly stats for dashboard
  getMonthlyStats(userId, months = 6) {
    const labels = [];
    const piutang = [];
    const hutang = [];
    const collected = [];
    const lent = [];
    
    for (let i = months - 1; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStr = date.toLocaleString('id-ID', { month: 'short' });
        labels.push(monthStr);
        
        // Get data for each month (simplified)
        const monthData = this.getMonthData(userId, date.getFullYear(), date.getMonth() + 1);
        piutang.push(monthData.piutang);
        hutang.push(monthData.hutang);
        collected.push(monthData.collected);
        lent.push(monthData.lent);
    }
    
    return { labels, piutang, hutang, collected, lent };
  }
  
  getMonthData(userId, year, month) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
    
    const piutang = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM debts 
      WHERE user_id = ? AND created_at BETWEEN ? AND ?
    `).get(userId, startDate, endDate).total;
    
    const collected = this.db.prepare(`
      SELECT COALESCE(SUM(paid_amount), 0) as total 
      FROM installment_payments ip
      JOIN loan_agreements la ON ip.agreement_id = la.id
      WHERE la.lender_id = ? AND ip.paid_at BETWEEN ? AND ?
    `).get(userId, startDate, endDate).total;
    
    return { piutang, hutang: 0, collected, lent: piutang };
  }
}

module.exports = new ReportService();
