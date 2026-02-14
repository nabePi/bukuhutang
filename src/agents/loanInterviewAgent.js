const loanAgreementService = require('../services/loanAgreementService');
const userService = require('../services/userService');
const pdfGenerator = require('../services/pdfGenerator');
const multiSessionManager = require('../whatsapp/multiSessionManager');

class LoanInterviewAgent {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.activeInterviews = new Map(); // phoneNumber -> interviewState
  }

  // Start new interview
  async startInterview(lenderPhone, borrowerName, totalAmount, jid) {
    const lender = await userService.getUserByPhone(lenderPhone, this.tenantId);
    
    const interviewState = {
      lenderId: lender.id,
      lenderPhone,
      borrowerName,
      totalAmount: parseInt(totalAmount),
      step: 0,
      data: {}
    };
    
    this.activeInterviews.set(lenderPhone, interviewState);
    
    const message = `📋 MEMBUAT PERJANJIAN HUTANG

Peminjam: ${borrowerName}
Jumlah: Rp ${parseInt(totalAmount).toLocaleString('id-ID')}

Silakan masukkan nomor WhatsApp ${borrowerName} (contoh: 08123456789)`;

    await multiSessionManager.sendMessage(this.tenantId, jid, message);
  }

  // Handle interview response
  async handleResponse(phoneNumber, text, jid) {
    const interview = this.activeInterviews.get(phoneNumber);
    if (!interview) return false;

    const response = text.trim().toUpperCase();

    switch (interview.step) {
      case 0: // Borrower phone
        const phoneRegex = /^\d{10,13}$/;
        if (phoneRegex.test(text.trim())) {
          interview.data.borrowerPhone = text.trim();
          interview.step = 1;
          
          const msg = `1️⃣ Sumber pendapatan ${interview.borrowerName}?\n   • GAJI\n   • BISNIS\n   • LAINNYA`;
          await multiSessionManager.sendMessage(this.tenantId, jid, msg);
        } else {
          await multiSessionManager.sendMessage(this.tenantId, jid, 'Format nomor salah. Ketik nomor WA (10-13 digit), contoh: 08123456789');
        }
        break;

      case 1: // Income source
        if (['GAJI', 'BISNIS', 'LAINNYA'].includes(response)) {
          interview.data.incomeSource = response;
          interview.step = 2;
          
          const msg = `2️⃣ Tanggal berapa ${interview.borrowerName} menerima ${response === 'GAJI' ? 'gaji' : 'pendapatan'} setiap bulan?\n\nKetik tanggal (1-31), contoh: 25`;
          await multiSessionManager.sendMessage(this.tenantId, jid, msg);
        } else {
          await multiSessionManager.sendMessage(this.tenantId, jid, 'Silakan ketik GAJI, BISNIS, atau LAINNYA');
        }
        break;

      case 2: // Payment day
        const day = parseInt(response);
        if (day >= 1 && day <= 31) {
          interview.data.paymentDay = day;
          interview.step = 3;
          
          const msg = `3️⃣ Berapa perkiraan ${interview.data.incomeSource === 'GAJI' ? 'gaji' : 'pendapatan'} ${interview.borrowerName} per bulan?\n\nKetik angka tanpa titik/koma, contoh: 5000000\n\n💡 Tips: Boleh ketik "SKIP" jika tidak mau memberitahu`;
          await multiSessionManager.sendMessage(this.tenantId, jid, msg);
        } else {
          await multiSessionManager.sendMessage(this.tenantId, jid, 'Silakan ketik tanggal 1-31, contoh: 25');
        }
        break;

      case 3: // Monthly income
        if (response === 'SKIP') {
          interview.data.monthlyIncome = null;
          interview.step = 4;
        } else {
          const income = parseInt(response);
          if (!isNaN(income) && income > 0) {
            interview.data.monthlyIncome = income;
            interview.step = 4;
          } else {
            await multiSessionManager.sendMessage(this.tenantId, jid, 'Silakan ketik angka saja, contoh: 5000000 atau ketik SKIP');
            break;
          }
        }
        
        const msg = `4️⃣ Ada hutang lain yang sedang dicicil?\nJika ya, berapa total cicilan per bulan?\n\nKetik 0 jika tidak ada, atau ketik nominalnya (contoh: 1500000)`;
        await multiSessionManager.sendMessage(this.tenantId, jid, msg);
        break;

      case 4: // Other debts
        const otherDebts = parseInt(response) || 0;
        interview.data.otherDebts = otherDebts;
        interview.step = 5;
        
        // Calculate recommendation
        const income = interview.data.monthlyIncome || interview.totalAmount;
        const calculation = loanAgreementService.calculateInstallment(
          income,
          otherDebts,
          interview.totalAmount
        );
        
        interview.calculation = calculation;
        
        let affordabilityEmoji = '✅';
        let affordabilityText = 'NYAMAN';
        if (calculation.affordability === 'manageable') {
          affordabilityEmoji = '⚠️';
          affordabilityText = 'CUKUP';
        } else if (calculation.affordability === 'tight') {
          affordabilityEmoji = '🔴';
          affordabilityText = 'BERAT';
        }
        
        const summaryMsg = `${affordabilityEmoji} ANALISIS KEMAMPUAN BAYAR

Berdasarkan data:\n• ${interview.data.incomeSource === 'GAJI' ? 'Gaji' : 'Pendapatan'}: Rp ${income.toLocaleString('id-ID')}/bulan\n• Cicilan lain: Rp ${otherDebts.toLocaleString('id-ID')}/bulan  \n• Hutang baru: Rp ${interview.totalAmount.toLocaleString('id-ID')}

💰 REKOMENDASI CICILAN:\n• Nominal cicilan: Rp ${calculation.installmentAmount.toLocaleString('id-ID')}/bulan\n• Jumlah bulan: ${calculation.months} kali\n• Total bayar: Rp ${calculation.totalRepayment.toLocaleString('id-ID')}\n• Tanggal bayar: Setiap tanggal ${interview.data.paymentDay}\n• Tingkat beban: ${affordabilityText}

Apakah setuju dengan cicilan di atas?\nKetik: SETUJU atau UBAH [nominal]`;
        
        await multiSessionManager.sendMessage(this.tenantId, jid, summaryMsg);
        break;

      case 5: // Confirmation
        if (response === 'SETUJU') {
          const draft = loanAgreementService.createDraft({
            lenderId: this.tenantId, // Use tenantId as lenderId
            borrowerName: interview.borrowerName,
            borrowerPhone: interview.data.borrowerPhone,
            totalAmount: interview.totalAmount,
            incomeSource: interview.data.incomeSource,
            monthlyIncome: interview.data.monthlyIncome,
            otherDebts: interview.data.otherDebts
          });
          
          // Calculate dates
          const today = new Date();
          let firstPaymentDate = new Date(today.getFullYear(), today.getMonth(), interview.data.paymentDay);
          if (firstPaymentDate < today) {
            firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
          }
          
          const agreement = loanAgreementService.finalizeAgreement(
            draft.agreementId,
            {
              paymentDay: interview.data.paymentDay,
              firstPaymentDate: firstPaymentDate.toISOString().split('T')[0],
              interestRate: 0
            }
          );
          
          interview.agreementId = draft.agreementId;
          interview.step = 6;
          
          // Generate PDF
          const lender = await userService.getUserById(interview.lenderId);
          const installments = loanAgreementService.getInstallments(draft.agreementId);
          const pdfResult = await pdfGenerator.generateAgreement(agreement, lender, installments);
          
          // Send message to borrower
          const borrowerMsg = `Halo ${interview.borrowerName},

Anda menerima penawaran pinjaman dari ${lender.business_name || lender.phone_number} sebesar Rp ${interview.totalAmount.toLocaleString('id-ID')}.

Detail cicilan:\n• Nominal: Rp ${interview.calculation.installmentAmount.toLocaleString('id-ID')}/bulan\n• Jumlah: ${interview.calculation.months}x cicilan\n• Tanggal: Setiap tanggal ${interview.data.paymentDay}

Silakan baca surat perjanjian terlampir dan balas:\n• SETUJU — untuk menerima\n• TOLAK — untuk menolak`;

          await multiSessionManager.sendMessage(this.tenantId, interview.data.borrowerPhone + '@s.whatsapp.net', borrowerMsg);
          
          // Notify lender
          await multiSessionManager.sendMessage(this.tenantId, jid, 
            `✅ Perjanjian dibuat dan langsung dikirim ke ${interview.borrowerName} (${interview.data.borrowerPhone})\n\nID: #${draft.agreementId}\nMenunggu persetujuan...`
          );
          
        } else if (response.startsWith('UBAH ')) {
          const newAmount = parseInt(response.replace('UBAH ', ''));
          if (!isNaN(newAmount) && newAmount > 0) {
            // Recalculate with custom amount
            const income = interview.data.monthlyIncome || interview.totalAmount;
            const months = Math.ceil(interview.totalAmount / newAmount);
            
            const newMsg = `🔄 CICILAN DIUBAH

• Cicilan: Rp ${newAmount.toLocaleString('id-ID')}/bulan\n• Jumlah bulan: ${months} kali\n• Total: Rp ${interview.totalAmount.toLocaleString('id-ID')}

Ketik SETUJU untuk melanjutkan atau UBAH [nominal] untuk mengubah lagi.`;
            
            interview.calculation.installmentAmount = newAmount;
            interview.calculation.months = months;
            
            await multiSessionManager.sendMessage(this.tenantId, jid, newMsg);
          } else {
            await multiSessionManager.sendMessage(this.tenantId, jid, 'Format salah. Ketik UBAH [nominal], contoh: UBAH 1000000');
          }
        } else {
          await multiSessionManager.sendMessage(this.tenantId, jid, 'Ketik SETUJU untuk menyetujui atau UBAH [nominal] untuk mengubah');
        }
        break;

      default:
        return false;
    }

    return true;
  }

  isInInterview(phoneNumber) {
    return this.activeInterviews.has(phoneNumber);
  }

  getInterview(phoneNumber) {
    return this.activeInterviews.get(phoneNumber);
  }

  endInterview(phoneNumber) {
    this.activeInterviews.delete(phoneNumber);
  }
}

module.exports = LoanInterviewAgent;
