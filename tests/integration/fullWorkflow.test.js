describe('BukuHutang Full Workflow Integration', () => {
  test('Complete loan agreement workflow', async () => {
    // 1. Create user (Dani)
    const dani = await userService.createUser('08111111111');
    expect(dani).toBeDefined();
    
    // 2. Create borrower (Ahmad)
    const ahmadPhone = '08222222222';
    
    // 3. Start interview
    const interview = {
      lenderId: dani.id,
      borrowerName: 'Ahmad',
      totalAmount: 5000000,
      step: 0,
      data: { borrowerPhone: ahmadPhone }
    };
    
    // 4. Complete interview steps
    interview.data.incomeSource = 'GAJI';
    interview.data.paymentDay = 25;
    interview.data.monthlyIncome = 8000000;
    interview.data.otherDebts = 0;
    
    // 5. Create agreement
    const draft = loanAgreementService.createDraft({
      lenderId: interview.lenderId,
      borrowerName: interview.borrowerName,
      borrowerPhone: interview.data.borrowerPhone,
      totalAmount: interview.totalAmount,
      incomeSource: interview.data.incomeSource,
      monthlyIncome: interview.data.monthlyIncome,
      otherDebts: interview.data.otherDebts
    });
    
    expect(draft.agreementId).toBeDefined();
    expect(draft.installmentAmount).toBeGreaterThan(0);
    
    // 6. Finalize agreement
    const agreement = loanAgreementService.finalizeAgreement(
      draft.agreementId,
      { paymentDay: 25, firstPaymentDate: '2025-03-25', interestRate: 0 }
    );
    
    expect(agreement.status).toBe('draft');
    
    // 7. Get installments
    const installments = loanAgreementService.getInstallments(draft.agreementId);
    expect(installments.length).toBeGreaterThan(0);
    
    // 8. Record payment
    const payment = loanAgreementService.recordPayment(installments[0].id, installments[0].amount);
    expect(payment.status).toBe('paid');
    
    // 9. Check history
    const history = loanAgreementService.getPaymentHistory(draft.agreementId);
    expect(history[0].paid_amount).toBe(installments[0].amount);
  });
});
