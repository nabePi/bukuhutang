const loanAgreementService = require('../services/loanAgreementService');
const userService = require('../services/userService');
const pdfGenerator = require('../services/pdfGenerator');

// Single Admin Mode
const DEFAULT_TENANT_ID = 'admin_default';

class LoanInterviewAgent {
  constructor(whatsappClient) {
    this.client = whatsappClient;
    this.activeInterviews = new Map(); // phoneNumber -> interviewState
  }

  // Start new interview
  async startInterview(borrowerPhone, borrowerName, totalAmount, jid) {
    const interviewState = {
      borrowerPhone,
      borrowerName,
      totalAmount: parseInt(totalAmount),
      step: 0,
      data: {}
    };
    
    this.activeInterviews.set(borrowerPhone, interviewState);
    
    const message = `📋 MEMBUAT PERJANJIAN HUTANG

Peminjam: ${borrowerName}
Jumlah: Rp ${parseInt(totalAmount).toLocaleString('id-ID')}

Silakan masukkan nomor WhatsApp ${borrowerName} (contoh: 08123456789)`;

    await this.client.sendMessage(jid, message);
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
          await this.client.sendMessage(jid, msg);
        } else {
          await this.client.sendMessage(jid, 'Format nomor salah. Ketik nomor WA (10-13 digit), contoh: 08123456789');
        }
        break;

      case 1: // Income source
        if (['GAJI', 'BISNIS', 'LAINNYA'].includes(response)) {
          interview.data.incomeSource = response;
          interview.step = 2;
          
          const msg = `2️⃣ Tanggal berapa ${interview.borrowerName} menerima ${response === 'GAJI' ? 'gaji' : 'pendapatan'} setiap bulan?\n\nKetik tanggal (1-31), contoh: 25`;
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
          
          const msg = `3️⃣ Berapa perkiraan ${interview.data.incomeSource === 'GAJI' ? 'gaji' : 'pendapatan'} ${interview.borrowerName} per bulan?\n\nKetik angka tanpa titik/koma, contoh: 5000000\n\n💡 Tips: Boleh ketik "SKIP" jika tidak mau memberitahu`;
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
        
        const msg = `4️⃣ Ada hutang lain yang sedang dicicil?\nJika ya, berapa total cicilan per bulan?\n\nKetik 0 jika tidak ada, atau ketik nominalnya (contoh: 1500000)`;
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

Berdasarkan data:\n• ${interview.data.incomeSource === 'GAJI' ? 'Gaji' : 'Pendapatan'}: Rp ${income.toLocaleString('id-ID')}/bulan\n• Cicilan lain: Rp ${otherDebts.toLocaleString('id-ID')}/bulan  \n• Hutang baru: Rp ${interview.totalAmount.toLocaleString('id-ID')}

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
          interview.step = 6;
          
          // TANYA: Siapa lender-nya?
          const lenderMsg = `5️⃣ PERLU INFORMASI LENDER

Pinjaman ini untuk siapa yang akan meminjamkan?\n\nKetik: [NAMA LENDER] [NOMOR WA]\n\nContoh: Ari 081298765432`;
          await this.client.sendMessage(jid, lenderMsg);
          
        } else if (response.startsWith('UBAH ')) {
          const newAmount = parseInt(response.replace('UBAH ', ''));
          if (!isNaN(newAmount) && newAmount > 0) {
            const income = interview.data.monthlyIncome || interview.totalAmount;
            const months = Math.ceil(interview.totalAmount / newAmount);
            
            const newMsg = `🔄 CICILAN DIUBAH

• Cicilan: Rp ${newAmount.toLocaleString('id-ID')}/bulan\n• Jumlah bulan: ${months} kali\n• Total: Rp ${interview.totalAmount.toLocaleString('id-ID')}

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

      case 6: // Lender info
        const lenderMatch = text.trim().match(/^(\S+)\s+(\d{10,15})$/);
        if (lenderMatch) {
          interview.data.actualLenderName = lenderMatch[1];
          interview.data.actualLenderPhone = lenderMatch[2];
          interview.step = 7;
          
          // Calculate dates
          const today = new Date();
          let firstPaymentDate = new Date(today.getFullYear(), today.getMonth(), interview.data.paymentDay);
          if (firstPaymentDate < today) {
            firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
          }
          
          // Create draft
          const draft = loanAgreementService.createDraft({
            lenderId: DEFAULT_TENANT_ID, // Admin sebagai formal lender
            borrowerName: interview.borrowerName,
            borrowerPhone: interview.data.borrowerPhone,
            totalAmount: interview.totalAmount,
            incomeSource: interview.data.incomeSource,
            monthlyIncome: interview.data.monthlyIncome,
            otherDebts: interview.data.otherDebts,
            actualLenderName: interview.data.actualLenderName,
            actualLenderPhone: interview.data.actualLenderPhone
          });
          
          // Finalize
          const agreement = loanAgreementService.finalizeAgreement(
            draft.agreementId,
            {
              paymentDay: interview.data.paymentDay,
              firstPaymentDate: firstPaymentDate.toISOString().split('T')[0],
              interestRate: 0
            }
          );
          
          interview.agreementId = draft.agreementId;
          
          // Notify borrower
          const borrowerMsg = `Halo ${interview.borrowerName},

Anda menerima penawaran pinjaman dari ${interview.data.actualLenderName} sebesar Rp ${interview.totalAmount.toLocaleString('id-ID')}.

Detail cicilan:\n• Nominal: Rp ${interview.calculation.installmentAmount.toLocaleString('id-ID')}/bulan\n• Jumlah: ${interview.calculation.months}x cicilan\n• Tanggal: Setiap tanggal ${interview.data.paymentDay}

Silakan balas SETUJU untuk menerima atau TOLAK untuk menolak.`;

          await this.client.sendMessage(interview.data.borrowerPhone + '@s.whatsapp.net', borrowerMsg);
          
          // Notify actual lender
          const lenderMsg = `Halo ${interview.data.actualLenderName},

${interview.borrowerName} ingin meminjam uang dari Anda sebesar Rp ${interview.totalAmount.toLocaleString('id-ID')}.

Detail cicilan:\n• Nominal: Rp ${interview.calculation.installmentAmount.toLocaleString('id-ID')}/bulan\n• Jumlah: ${interview.calculation.months}x cicilan\n• Tanggal: Setiap tanggal ${interview.data.paymentDay}

Total yang akan diterima: Rp ${interview.totalAmount.toLocaleString('id-ID')}

Silakan balas SETUJU untuk menyetujui atau TOLAK untuk menolak.`;

          await this.client.sendMessage(interview.data.actualLenderPhone + '@s.whatsapp.net', lenderMsg);
          
          // Notify admin
          await this.client.sendMessage(jid, 
            `✅ Perjanjian dibuat!

Borrower: ${interview.borrowerName}
Lender: ${interview.data.actualLenderName} (${interview.data.actualLenderPhone})
Jumlah: Rp ${interview.totalAmount.toLocaleString('id-ID')}

ID: #${draft.agreementId}
Menunggu persetujuan kedua belah pihak...`
          );
          
        } else {
          await this.client.sendMessage(jid, 'Format salah. Ketik: [NAMA] [NOMOR WA]\nContoh: Ari 081298765432');
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
