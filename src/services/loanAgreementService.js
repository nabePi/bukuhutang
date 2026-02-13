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
      SET payment_day = ?, first_payment_date = ?, interest_rate = ?, status = 'active'
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
}

module.exports = new LoanAgreementService();
