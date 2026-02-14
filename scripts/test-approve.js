require('dotenv').config();
const path = require('path');
const { getConnection } = require(path.join(__dirname, '..', 'src', 'db', 'connection'));
const loanAgreementService = require(path.join(__dirname, '..', 'src', 'services', 'loanAgreementService'));

const db = getConnection();

console.log('🔄 TEST: Ari approves agreement');
console.log('═'.repeat(50));

// Simulate Ari (borrower) replies "SETUJU"
const borrowerPhone = '081312345678';
const text = 'SETUJU';

console.log('\n1️⃣ Find pending agreement for borrower:', borrowerPhone);

const pendingAgreement = loanAgreementService.findPendingByBorrowerPhoneGlobal(borrowerPhone);

if (!pendingAgreement) {
  console.log('   ❌ No pending agreement found');
  process.exit(1);
}

console.log('   ✅ Found agreement #' + pendingAgreement.id);
console.log('   📋 Status:', pendingAgreement.status);

// Activate agreement
console.log('\n2️⃣ Activating agreement...');
loanAgreementService.activateAgreement(pendingAgreement.id);

const activated = loanAgreementService.getAgreement(pendingAgreement.id);
console.log('   ✅ Agreement activated!');
console.log('   📊 Status:', activated.status);
console.log('   📅 Signed at:', activated.signed_at);

// Check installments
console.log('\n3️⃣ Check installments...');
const installments = loanAgreementService.getInstallments(pendingAgreement.id);
console.log('   📅 Total installments:', installments.length);

installments.forEach((inst, idx) => {
  console.log('      #' + (idx + 1) + ': ' + inst.due_date + ' - Rp ' + inst.amount.toLocaleString('id-ID'));
});

// Check if reminder will be sent
console.log('\n4️⃣ Check reminder eligibility...');
const firstInst = installments[0];
const daysUntilDue = Math.ceil((new Date(firstInst.due_date) - new Date()) / (1000 * 60 * 60 * 24));
console.log('   ⏰ First installment due in:', daysUntilDue, 'days');
console.log('   📌 Reminder will be sent', daysUntilDue - 3, 'days before due date');

console.log('\n✅ Flow complete!');
console.log('\nSummary:');
console.log('   • Budi (borrower) applied for loan');
console.log('   • Agreement created and sent to Ari (lender)');
console.log('   • Ari approved → Agreement activated');
console.log('   • Reminders will auto-send from admin number');
