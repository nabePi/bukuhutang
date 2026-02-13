const debtService = require('../../src/services/debtService');
const { getConnection } = require('../../src/db/connection');

describe('debtService', () => {
  let db;
  
  beforeEach(() => {
    db = getConnection();
    // Clean up test data
    db.prepare("DELETE FROM debts WHERE user_id = 1").run();
    db.prepare("DELETE FROM users WHERE id = 1").run();
    // Create test user
    db.prepare("INSERT INTO users (id, phone_number, business_name) VALUES (1, '08111111111', 'Test Business')").run();
  });
  
  afterEach(() => {
    // Clean up test data
    db.prepare("DELETE FROM debts WHERE user_id = 1").run();
    db.prepare("DELETE FROM users WHERE id = 1").run();
  });

  test('createDebt should add new debt', async () => {
    const debt = await debtService.createDebt({
      userId: 1,
      debtorName: 'Budi',
      debtorPhone: '08123456789',
      amount: 500000,
      description: 'Beli semen',
      days: 14
    });
    
    expect(debt.debtor_name).toBe('Budi');
    expect(debt.amount).toBe(500000);
    expect(debt.status).toBe('pending');
  });

  test('getOverdueDebts should return only overdue', async () => {
    const debts = await debtService.getOverdueDebts(1);
    expect(Array.isArray(debts)).toBe(true);
  });
});
