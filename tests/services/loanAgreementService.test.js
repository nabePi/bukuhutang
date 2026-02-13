const loanAgreementService = require('../../src/services/loanAgreementService');

describe('loanAgreementService', () => {
  test('calculateInstallment returns correct calculation', () => {
    const result = loanAgreementService.calculateInstallment(5000000, 0, 5000000);
    
    expect(result.installmentAmount).toBeGreaterThan(0);
    expect(result.months).toBeGreaterThan(0);
    expect(result.totalRepayment).toBeGreaterThanOrEqual(5000000);
    expect(['comfortable', 'manageable', 'tight']).toContain(result.affordability);
  });

  test('calculateInstallment respects 30% debt ratio', () => {
    const income = 10000000;
    const otherDebts = 2000000;
    const loan = 5000000;
    
    const result = loanAgreementService.calculateInstallment(income, otherDebts, loan);
    
    // Monthly burden should not exceed 30% of income
    expect(result.monthlyBurden).toBeLessThanOrEqual(income * 0.30);
  });
});
