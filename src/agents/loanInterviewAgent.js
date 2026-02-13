const loanAgreementService = require('../services/loanAgreementService');
const userService = require('../services/userService');

class LoanInterviewAgent {
  constructor(whatsappClient) {
    this.client = whatsappClient;
    this.activeInterviews = new Map(); // phoneNumber -> interviewState
  }

  // Start new interview
  async startInterview(lenderPhone, borrowerName, totalAmount, jid) {
    const lender = await userService.getUserByPhone(lenderPhone);
    
    const interviewState = {
      lenderId: lender.id,
      lenderPhone,
      borrowerName,
      totalAmount: parseInt(totalAmount),
      step: 1,
      data: {}
    };
    
    this.activeInterviews.set(lenderPhone, interviewState);
    
    const message = `📋 MEMBUAT PERJANJIAN HUTANG

Peminjam: ${borrowerName}
Jumlah: Rp ${parseInt(totalAmount).toLocaleString('id-ID')}

Silakan jawab beberapa pertanyaan untuk menentukan cicilan yang sesuai:

1️⃣ Sumber pendapatan ${borrowerName}?
   Ketik salah satu:
   • GAJI (pegawai/karyawan)
   • BISNIS (usaha/wiraswasta)
   • LAINNYA`;

    await this.client.sendMessage(jid, message);
  }

  // Handle interview response
  async handleResponse(phoneNumber, text, jid) {
    const interview = this.activeInterviews.get(phoneNumber);
    if (!interview) return false;

    const response = text.trim().toUpperCase();

    switch (interview.step) {
      case 1: // Income source
        if (['GAJI', 'BISNIS', 'LAINNYA'].includes(response)) {
          interview.data.incomeSource = response;
          interview.step = 2;
          
          const msg = `2️⃣ Tanggal berapa ${interview.borrowerName} menerima ${response === 'GAJI' ? 'gaji' : 'pendapatan'} setiap bulan?

Ketik tanggal (1-31), contoh: 25`;
          await this.client.sendMessage(jid, msg);
        } else {
          await this.client.sendMessage(jid, 'Silakan ketik GAJI, BISNIS, atau LAINNYA');
        }
        break;

      case 2: // Payment day
        const day = parseInt(response);
        if (day >= 1 && day <= 31) {
          interview.data.paymentDay = day;
          interview.step = 3;
          
          const msg = `3️⃣ Berapa perkiraan ${interview.data.incomeSource === 'GAJI' ? 'gaji' : 'pendapatan'} ${interview.borrowerName} per bulan?

Ketik angka tanpa titik/koma, contoh: 5000000

💡 Tips: Boleh ketik "SKIP" jika tidak mau memberitahu`;
          await this.client.sendMessage(jid, msg);
        } else {
          await this.client.sendMessage(jid, 'Silakan ketik tanggal 1-31, contoh: 25');
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
            await this.client.sendMessage(jid, 'Silakan ketik angka saja, contoh: 5000000 atau ketik SKIP');
            break;
          }
        }
        
        const msg = `4️⃣ Ada hutang lain yang sedang dicicil?
Jika ya, berapa total cicilan per bulan?

Ketik 0 jika tidak ada, atau ketik nominalnya (contoh: 1500000)`;
        await this.client.sendMessage(jid, msg);
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

Berdasarkan data:
• ${interview.data.incomeSource === 'GAJI' ? 'Gaji' : 'Pendapatan'}: Rp ${income.toLocaleString('id-ID')}/bulan
• Cicilan lain: Rp ${otherDebts.toLocaleString('id-ID')}/bulan  
• Hutang baru: Rp ${interview.totalAmount.toLocaleString('id-ID')}

💰 REKOMENDASI CICILAN:
• Nominal cicilan: Rp ${calculation.installmentAmount.toLocaleString('id-ID')}/bulan
• Jumlah bulan: ${calculation.months} kali
• Total bayar: Rp ${calculation.totalRepayment.toLocaleString('id-ID')}
• Tanggal bayar: Setiap tanggal ${interview.data.paymentDay}
• Tingkat beban: ${affordabilityText}

Apakah setuju dengan cicilan di atas?
Ketik: SETUJU atau UBAH [nominal]`;
        
        await this.client.sendMessage(jid, summaryMsg);
        break;

      case 5: // Confirmation
        if (response === 'SETUJU') {
          // Create draft agreement
          const draft = loanAgreementService.createDraft({
            lenderId: interview.lenderId,
            borrowerName: interview.borrowerName,
            borrowerPhone: 'TBD', // Will be filled later
            totalAmount: interview.totalAmount,
            incomeSource: interview.data.incomeSource,
            monthlyIncome: interview.data.monthlyIncome,
            otherDebts: interview.data.otherDebts
          });
          
          // Calculate first payment date
          const today = new Date();
          let firstPaymentDate = new Date(today.getFullYear(), today.getMonth(), interview.data.paymentDay);
          if (firstPaymentDate < today) {
            firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
          }
          
          // Finalize agreement
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
          
          const confirmMsg = `✅ PERJANJIAN DIBUAT!

ID Perjanjian: #${draft.agreementId}

Langkah selanjutnya:
1. Kirim surat perjanjian ke ${interview.borrowerName}
2. Minta ${interview.borrowerName} setujui dengan membalas ID perjanjian

Ketik KIRIM ${draft.agreementId} untuk mengirim surat perjanjian.`;
          
          await this.client.sendMessage(jid, confirmMsg);
          
        } else if (response.startsWith('UBAH ')) {
          const newAmount = parseInt(response.replace('UBAH ', ''));
          if (!isNaN(newAmount) && newAmount > 0) {
            // Recalculate with custom amount
            const income = interview.data.monthlyIncome || interview.totalAmount;
            const months = Math.ceil(interview.totalAmount / newAmount);
            
            const newMsg = `🔄 CICILAN DIUBAH

• Cicilan: Rp ${newAmount.toLocaleString('id-ID')}/bulan
• Jumlah bulan: ${months} kali
• Total: Rp ${interview.totalAmount.toLocaleString('id-ID')}

Ketik SETUJU untuk melanjutkan atau UBAH [nominal] untuk mengubah lagi.`;
            
            interview.calculation.installmentAmount = newAmount;
            interview.calculation.months = months;
            
            await this.client.sendMessage(jid, newMsg);
          } else {
            await this.client.sendMessage(jid, 'Format salah. Ketik UBAH [nominal], contoh: UBAH 1000000');
          }
        } else {
          await this.client.sendMessage(jid, 'Ketik SETUJU untuk menyetujui atau UBAH [nominal] untuk mengubah');
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
