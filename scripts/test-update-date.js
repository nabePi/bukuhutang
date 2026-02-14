require('dotenv').config();
const path = require('path');
const { getConnection } = require(path.join(__dirname, '..', 'src', 'db', 'connection'));

const db = getConnection();

console.log('🔄 Update test: Make installments due sooner...');

// Update first installment to due in 2 days (within reminder window)
const twoDaysFromNow = new Date();
twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

const updateStmt = db.prepare(`
  UPDATE installment_payments 
  SET due_date = ?, reminder_sent = 0
  WHERE installment_number = 1 AND agreement_id = 1
`);

updateStmt.run(twoDaysFromNow.toISOString().split('T')[0]);

console.log('   ✅ Updated installment #1 due date to:', twoDaysFromNow.toISOString().split('T')[0]);
console.log('   ⏰ Now within reminder window (3 days before due)');
