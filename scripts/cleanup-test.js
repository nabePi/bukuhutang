require('dotenv').config();
const path = require('path');
const { getConnection } = require(path.join(__dirname, '..', 'src', 'db', 'connection'));

const db = getConnection();

console.log('🧹 Cleaning up test data...');

// Delete test installments
db.prepare('DELETE FROM installment_payments WHERE agreement_id = 1').run();

// Delete test agreement
db.prepare('DELETE FROM loan_agreements WHERE id = 1').run();

// Delete test users
db.prepare('DELETE FROM users WHERE id IN (99, 100)').run();

console.log('✅ Test data cleaned!');
console.log('\n📱 WhatsApp QR Code feature ready!');
console.log('   Access: http://localhost:3006/admin');
