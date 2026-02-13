const { getConnection } = require('../db/connection');

class LoanAgreementService {
  constructor() {
    this.db = getConnection();
  }

  // Calculate safe installment based on income
  calculateInstallment(income, otherDebts, totalLoan) {
    const maxDebtRatio = 0.30; // Max 30% of income for debts
    const maxNewInstallment = Math.floor((income * maxDebtRatio) - otherDebts);
    
    // Minimum installment: Rp 100.000
    const minInstallment = 100000;
    
    // Use max of calculated or minimum
    const safeInstallment = Math.max(maxNewInstallment, minInstallment);
    
    // Calculate months needed
    let months = Math.ceil(totalLoan / safeInstallment);
    
    // Cap at 24 months max
    months = Math.min(months, 24);
    
    // Recalculate exact installment
    const installment = Math.ceil(totalLoan / months);
    
    // Calculate affordability rating
    let affordability;
    const ratio = (otherDebts + installment) / income;
    if (ratio <= 0.20) affordability = 'comfortable';
    else if (ratio <= 0.30) affordability = 'manageable';
    else affordability = 'tight';
    
    return {
      installmentAmount: installment,
      months: months,
      totalRepayment: installment * months,
      monthlyBurden: otherDebts + installment,
      debtToIncomeRatio: ratio,
      affordability: affordability,
      maxRecommended: maxNewInstallment
    };
  }

  // Create draft agreement
  createDraft({ lenderId, borrowerName, borrowerPhone, totalAmount, incomeSource, monthlyIncome, otherDebts }) {
    const calculation = this.calculateInstallment(monthlyIncome || totalAmount, otherDebts || 0, totalAmount);
    
    const stmt = this.db.prepare(`
      INSERT INTO loan_agreements 
      (lender_id, borrower_name, borrower_phone, total_amount, income_source, monthly_income, other_debts, installment_amount, installment_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      lenderId, borrowerName, borrowerPhone, totalAmount,
      incomeSource, monthlyIncome, otherDebts || 0,
      calculation.installmentAmount, calculation.months
    );
    
    return {
      agreementId: result.lastInsertRowid,
      ...calculation
    };
  }

  // Get agreement by ID
  getAgreement(id) {
    const stmt = this.db.prepare('SELECT * FROM loan_agreements WHERE id = ?');
    return stmt.get(id);
  }

  // Update agreement with payment details
  finalizeAgreement(agreementId, { paymentDay, firstPaymentDate, interestRate = 0 }) {
    const stmt = this.db.prepare(`
      UPDATE loan_agreements 
      SET payment_day = ?, first_payment_date = ?, interest_rate = ?, status = 'draft'
      WHERE id = ?
    `);
    
    stmt.run(paymentDay, firstPaymentDate, interestRate, agreementId);
    
    // Create installment records
    this.generateInstallments(agreementId);
    
    return this.getAgreement(agreementId);
  }

  // Generate installment records
  generateInstallments(agreementId) {
    const agreement = this.getAgreement(agreementId);
    const installments = [];
    
    let currentDate = new Date(agreement.first_payment_date);
    
    for (let i = 1; i <= agreement.installment_count; i++) {
      const stmt = this.db.prepare(`
        INSERT INTO installment_payments (agreement_id, installment_number, due_date, amount)
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run(agreementId, i, currentDate.toISOString().split('T')[0], agreement.installment_amount);
      
      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return installments;
  }

  // Get installments for agreement
  getInstallments(agreementId) {
    const stmt = this.db.prepare(`
      SELECT * FROM installment_payments 
      WHERE agreement_id = ? 
      ORDER BY installment_number ASC
    `);
    return stmt.all(agreementId);
  }

  // Get pending installments
  getPendingInstallments(agreementId) {
    const stmt = this.db.prepare(`
      SELECT * FROM installment_payments 
      WHERE agreement_id = ? AND status = 'pending'
      ORDER BY due_date ASC
    `);
    return stmt.all(agreementId);
  }

  // Pay installment
  payInstallment(installmentId, amount) {
    const stmt = this.db.prepare(`
      UPDATE installment_payments 
      SET paid_amount = ?, status = 'paid', paid_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(amount, installmentId);
    return this.getInstallmentById(installmentId);
  }

  getInstallmentById(id) {
    const stmt = this.db.prepare('SELECT * FROM installment_payments WHERE id = ?');
    return stmt.get(id);
  }

  // Get all agreements for user
  getUserAgreements(userId) {
    const stmt = this.db.prepare(`
      SELECT * FROM loan_agreements 
      WHERE lender_id = ? 
      ORDER BY created_at DESC
    `);
    return stmt.all(userId);
  }

  getActiveCount(userId = null) {
    if (userId) {
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM loan_agreements WHERE lender_id = ? AND status = 'active'`);
      return stmt.get(userId).count;
    }
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM loan_agreements WHERE status = 'active'`);
    return stmt.get().count;
  }

  getInstallmentStats(userId) {
    const paidStmt = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM installment_payments ip
      JOIN loan_agreements la ON ip.agreement_id = la.id
      WHERE la.lender_id = ? AND ip.status = 'paid'
    `);
    const pendingStmt = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM installment_payments ip
      JOIN loan_agreements la ON ip.agreement_id = la.id
      WHERE la.lender_id = ? AND ip.status = 'pending' AND ip.due_date >= date('now')
    `);
    const overdueStmt = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM installment_payments ip
      JOIN loan_agreements la ON ip.agreement_id = la.id
      WHERE la.lender_id = ? AND ip.status = 'pending' AND ip.due_date < date('now')
    `);
    
    return {
      paid: paidStmt.get(userId).count,
      pending: pendingStmt.get(userId).count,
      overdue: overdueStmt.get(userId).count
    };
  }

  getPendingInstallmentCount() {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM installment_payments WHERE status = 'pending'`);
    return stmt.get().count;
  }

  getUpcomingInstallments(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT i.*, a.borrower_phone, a.borrower_name
      FROM installment_payments i
      JOIN loan_agreements a ON i.agreement_id = a.id
      WHERE i.due_date <= date('now', '+7 days')
      AND i.status = 'pending'
      AND i.reminder_sent = 0
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  markInstallmentReminderSent(id) {
    const stmt = this.db.prepare(`UPDATE installment_payments SET reminder_sent = 1 WHERE id = ?`);
    stmt.run(id);
  }

  findPendingByBorrowerPhone(phoneNumber) {
    const stmt = this.db.prepare(`
      SELECT * FROM loan_agreements 
      WHERE borrower_phone = ? AND status = 'draft'
      ORDER BY created_at DESC LIMIT 1
    `);
    return stmt.get(phoneNumber);
  }

  activateAgreement(id) {
    const stmt = this.db.prepare(`
      UPDATE loan_agreements 
      SET status = 'active', signed_at = datetime('now') 
      WHERE id = ?
    `);
    stmt.run(id);
    return this.getAgreement(id);
  }

  cancelAgreement(id) {
    const stmt = this.db.prepare(`
      UPDATE loan_agreements 
      SET status = 'cancelled' 
      WHERE id = ?
    `);
    stmt.run(id);
  }

  // Record payment for installment
  recordPayment(installmentId, amount) {
    const installment = this.getInstallmentById(installmentId);
    if (!installment) throw new Error('Installment not found');
    
    const newPaidAmount = (installment.paid_amount || 0) + amount;
    const status = newPaidAmount >= installment.amount ? 'paid' : 'partial';
    
    const stmt = this.db.prepare(`
      UPDATE installment_payments 
      SET paid_amount = ?, status = ?, paid_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(newPaidAmount, status, installmentId);
    
    // Check if all installments paid
    this.checkAgreementCompletion(installment.agreement_id);
    
    return this.getInstallmentById(installmentId);
  }

  // Check if agreement is fully paid
  checkAgreementCompletion(agreementId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid
      FROM installment_payments 
      WHERE agreement_id = ?
    `);
    const result = stmt.get(agreementId);
    
    if (result.total > 0 && result.total === result.paid) {
      const updateStmt = this.db.prepare(`
        UPDATE loan_agreements SET status = 'completed' WHERE id = ?
      `);
      updateStmt.run(agreementId);
    }
  }

  // Get payment history for borrower
  getPaymentHistory(agreementId) {
    const stmt = this.db.prepare(`
      SELECT * FROM installment_payments 
      WHERE agreement_id = ?
      ORDER BY installment_number ASC
    `);
    return stmt.all(agreementId);
  }

  // Get installment by agreement and number
  getInstallmentByNumber(agreementId, installmentNumber) {
    const stmt = this.db.prepare(`
      SELECT * FROM installment_payments 
      WHERE agreement_id = ? AND installment_number = ?
    `);
    return stmt.get(agreementId, installmentNumber);
  }

  // Find agreement by borrower name and lender
  findAgreementByBorrower(lenderId, borrowerName) {
    const stmt = this.db.prepare(`
      SELECT * FROM loan_agreements 
      WHERE lender_id = ? AND borrower_name = ? AND status IN ('active', 'draft')
      ORDER BY created_at DESC LIMIT 1
    `);
    return stmt.get(lenderId, borrowerName);
  }
}

module.exports = new LoanAgreementService();
