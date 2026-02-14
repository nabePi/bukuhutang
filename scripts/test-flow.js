require('dotenv').config();
const path = require('path');
const { getConnection } = require(path.join(__dirname, '..', 'src', 'db', 'connection'));

const db = getConnection();

console.log('🧪 TEST FLOW: Budi pinjam ke Ari');
console.log('═'.repeat(50));

// 1. Setup test data
console.log('\n1️⃣ Setup test data...');

// Create admin user
const adminStmt = db.prepare('INSERT OR IGNORE INTO users (id, phone_number, business_name) VALUES (?, ?, ?)');
adminStmt.run(99, '081254653452', 'Admin BukuHutang');

// Create lender (Ari)
const lenderStmt = db.prepare('INSERT OR IGNORE INTO users (id, phone_number, business_name) VALUES (?, ?, ?)');
lenderStmt.run(100, '081298765432', 'Ari Lender');

console.log('   ✅ Admin: 081254653452');
console.log('   ✅ Lender (Ari): 081298765432');

// 2. Create draft agreement
console.log('\n2️⃣ Create loan agreement...');

const agreementStmt = db.prepare(`
  INSERT INTO loan_agreements 
  (lender_id, borrower_name, borrower_phone, total_amount, installment_amount, installment_count, 
   income_source, monthly_income, other_debts, payment_day, first_payment_date, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const firstPaymentDate = new Date();
firstPaymentDate.setDate(firstPaymentDate.getDate() + 7);

const result = agreementStmt.run(
  100, // lender_id (Ari)
  'Budi Peminjam',
  '081312345678',
  2000000,
  500000,
  4,
  'GAJI',
  5000000,
  0,
  25,
  firstPaymentDate.toISOString().split('T')[0],
  'draft'
);

const agreementId = result.lastInsertRowid;
console.log('   ✅ Agreement created: #' + agreementId);
console.log('   📋 Borrower: Budi Peminjam (081312345678)');
console.log('   💰 Amount: Rp 2.000.000');
console.log('   📅 First payment: ' + firstPaymentDate.toISOString().split('T')[0]);

// 3. Create installments
console.log('\n3️⃣ Generate installments...');

let currentDate = new Date(firstPaymentDate);
for (let i = 1; i <= 4; i++) {
  const instStmt = db.prepare(`
    INSERT INTO installment_payments (agreement_id, installment_number, due_date, amount, status, reminder_sent)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  instStmt.run(agreementId, i, currentDate.toISOString().split('T')[0], 500000, 'pending', 0);
  console.log('   📅 Cicilan #' + i + ': ' + currentDate.toISOString().split('T')[0] + ' - Rp 500.000');
  
  currentDate.setMonth(currentDate.getMonth() + 1);
}

console.log('\n✅ Test data ready!');
console.log('\nNext: Check if agreement can be activated...');
