const { parseCommand } = require('../parser/commandParser');
const debtService = require('../services/debtService');
const userService = require('../services/userService');
const LoanInterviewAgent = require('../agents/loanInterviewAgent');
const pdfGenerator = require('../services/pdfGenerator');
const loanAgreementService = require('../services/loanAgreementService');
const { getTemplate } = require('../config/templates');
const aiService = require('../services/aiService');

// Single Admin Mode - One WhatsApp number for all operations
const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || '081254653452';
const DEFAULT_TENANT_ID = 'admin_default';

class MessageHandler {
  constructor(whatsappClient) {
    this.client = whatsappClient;
    this.interviewAgent = new LoanInterviewAgent(whatsappClient);
  }

  async handle(msg) {
    const phoneNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '');
    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    
    console.log(`[Admin Mode] Received from ${phoneNumber}: ${messageText}`);

    // Check if this is a confirmation response
    const context = aiService.getContext(phoneNumber);
    if (context?.awaitingConfirmation) {
      const confirmation = this.parseConfirmation(messageText);
      if (confirmation === 'YES') {
        await this.executeIntent(phoneNumber, context.lastIntent, context.lastEntities, msg.key.remoteJid);
        aiService.clearContext(phoneNumber);
        return;
      } else if (confirmation === 'NO') {
        await this.client.sendMessage(msg.key.remoteJid, 'Oke, saya batalkan. Ada yang lain?');
        aiService.clearContext(phoneNumber);
        return;
      }
    }

    // Check if this is a borrower response (SETUJU/TOLAK)
    const borrowerHandled = await this.handleBorrowerResponse(phoneNumber, messageText, msg.key.remoteJid);
    if (borrowerHandled) return;

    // Check if user is in active interview (loan agreement)
    if (this.interviewAgent.isInInterview(phoneNumber)) {
      const handled = await this.interviewAgent.handleResponse(phoneNumber, messageText, msg.key.remoteJid);
      if (handled) return;
    }

    // Use AI to parse intent
    const parsed = await aiService.parseIntent(messageText, phoneNumber);
    
    // Send AI response
    await this.client.sendMessage(msg.key.remoteJid, parsed.response);
    
    // If no confirmation needed and we have all fields, execute
    if (!parsed.needs_confirmation && Object.keys(parsed.entities).length > 0) {
      await this.executeIntent(phoneNumber, parsed.intent, parsed.entities, msg.key.remoteJid);
      aiService.clearContext(phoneNumber);
    }
  }

  parseConfirmation(text) {
    const lower = text.toLowerCase().trim();
    const yesWords = ['ya', 'yes', 'betul', 'benar', 'ok', 'oke', 'iya', 'y', 'bener'];
    const noWords = ['tidak', 'no', 'salah', 'batal', 'n', 'ga', 'gak', 'enggak'];
    
    if (yesWords.some(w => lower.includes(w))) return 'YES';
    if (noWords.some(w => lower.includes(w))) return 'NO';
    return null;
  }

  async executeIntent(phoneNumber, intent, entities, jid) {
    // Get or create user (as admin/lender)
    let user = await userService.getUserByPhone(phoneNumber);
    if (!user) {
      user = await userService.createUser(phoneNumber);
    }

    try {
      switch(intent) {
        case 'PINJAM':
          await this.handlePinjamAI(user, entities, jid);
          break;
        case 'STATUS':
          await this.handleStatus(user, jid);
          break;
        case 'BUAT_PERJANJIAN':
          await this.interviewAgent.startInterview(phoneNumber, entities.nama, entities.jumlah, jid);
          break;
        case 'CICILAN':
          await this.handleCicilan(user, jid);
          break;
        case 'BAYAR':
          await this.handleBayarAI(user, entities, jid);
          break;
        case 'KONFIRMASI_PEMBAYARAN':
        case 'BAYAR_CICILAN':
          await this.handleKonfirmasiPembayaran(phoneNumber, entities, jid);
          break;
        case 'GENERAL_CHAT':
          // Already responded, do nothing
          break;
        default:
          await this.sendHelp(jid);
      }
    } catch (error) {
      console.error('Execute intent error:', error);
      await this.client.sendMessage(jid, 'Maaf, terjadi kesalahan. Coba lagi nanti ya.');
    }
  }

  async handlePinjamAI(user, entities, jid) {
    const debt = await debtService.createDebt({
      tenantId: DEFAULT_TENANT_ID,
      userId: user.id,
      debtorName: entities.nama,
      debtorPhone: entities.nomor, // Capture phone number
      amount: entities.jumlah,
      description: entities.catatan || '',
      days: entities.durasi_hari || 14
    });

    const reply = `✅ Piutang tercatat!

Nama: ${entities.nama}
Nomor: ${entities.nomor || '-'}
Jumlah: Rp ${entities.jumlah.toLocaleString('id-ID')}
Jatuh tempo: ${debt.due_date}${entities.catatan ? '\nCatatan: ' + entities.catatan : ''}

Saya akan ingatkan 1 hari sebelum jatuh tempo.`;

    await this.client.sendMessage(jid, reply);
  }

  async handleBayarAI(user, entities, jid) {
    await this.client.sendMessage(jid, `✅ Memproses pembayaran untuk ${entities.nama || 'cicilan'}...`);
  }

  async handleStatus(user, jid) {
    const debts = await debtService.getPendingDebts(DEFAULT_TENANT_ID, user.id);
    const overdue = await debtService.getOverdueDebts(DEFAULT_TENANT_ID, user.id);
    const summary = await debtService.getSummary(DEFAULT_TENANT_ID, user.id);

    let reply = '📊 RINGKASAN BUKUHUTANG\n\n';
    
    reply += `💰 Total Piutang: Rp ${summary.totalPending.toLocaleString('id-ID')}\n`;
    reply += `⚠️ Jatuh Tempo: ${summary.overdueCount} orang\n\n`;

    if (overdue.length > 0) {
      reply += '🚨 SUDAH LEWAT JATUH TEMPO:\n';
      overdue.forEach(d => {
        reply += `• ${d.debtor_name}: Rp ${d.amount.toLocaleString('id-ID')}\n`;
      });
      reply += '\n';
    }

    if (debts.length > 0) {
      reply += '📅 PIUTANG AKTIF:\n';
      debts.slice(0, 5).forEach(d => {
        reply += `• ${d.debtor_name}: Rp ${d.amount.toLocaleString('id-ID')} (sampai ${d.due_date})\n`;
      });
    }

    await this.client.sendMessage(jid, reply);
  }

  async handleCicilan(user, jid) {
    const agreements = loanAgreementService.getUserAgreements(user.id);
    const activeAgreements = agreements.filter(a => a.status === 'active');

    if (activeAgreements.length === 0) {
      await this.client.sendMessage(jid, 'Belum ada cicilan aktif.');
      return;
    }

    let reply = '📋 DAFTAR CICILAN AKTIF\n\n';

    for (const agreement of activeAgreements) {
      const installments = loanAgreementService.getPendingInstallments(agreement.id);
      const nextPayment = installments[0];

      reply += `📄 ${agreement.borrower_name}\n`;
      reply += `   Total: Rp ${agreement.total_amount.toLocaleString('id-ID')}\n`;
      reply += `   Cicilan: Rp ${agreement.installment_amount.toLocaleString('id-ID')}/bulan\n`;
      if (nextPayment) {
        reply += `   Bayar berikutnya: ${nextPayment.due_date}\n`;
      }
      reply += '\n';
    }

    reply += 'Ketik BAYAR [nomor] untuk membayar';
    await this.client.sendMessage(jid, reply);
  }

  async sendHelp(jid) {
    const help = `📘 *CARA PAKAI BUKUHUTANG* 📘

💰 *CATAT HUTANG/PIUTANG*
• 📝 PINJAM [nama] [nomor] [jumlah] [hari]hari "[catatan]"
• 📊 STATUS — Lihat ringkasan

📋 *PERJANJIAN DENGAN CICILAN*
• 🆕 BUAT PERJANJIAN [nama] [jumlah]
• 📄 PERJANJIAN — Lihat daftar
• 💳 CICILAN — Lihat status cicilan
• 💵 BAYAR [nomor] — Bayar cicilan

💡 *Contoh:* PINJAM Budi 081298765432 500000 14hari "Beli semen"`;

    await this.client.sendMessage(jid, help);
  }

  // Handle borrower responses (SETUJU/TOLAK)
  async handleBorrowerResponse(phoneNumber, messageText, jid) {
    const text = messageText.trim().toUpperCase();
    
    // Check if this is a response to a pending agreement
    const pendingAgreement = await loanAgreementService.findPendingByBorrowerPhoneGlobal(phoneNumber);
    
    if (!pendingAgreement) return false;
    
    if (text === 'SETUJU') {
      // Update agreement status
      await loanAgreementService.activateAgreement(pendingAgreement.id);
      
      // Notify borrower
      await this.client.sendMessage(jid, 
        `✅ Perjanjian disetujui!\n\nCicilan pertama jatuh tempo: ${pendingAgreement.first_payment_date}\nAnda akan menerima reminder otomatis sebelum tanggal pembayaran.`
      );
      
      // Notify lender (admin)
      const lender = await userService.getUserById(pendingAgreement.lender_id);
      await this.client.sendMessage(lender.phone_number + '@s.whatsapp.net',
        `🎉 ${pendingAgreement.borrower_name} telah MENYETUJUI perjanjian #${pendingAgreement.id}!\n\nCicilan aktif dimulai ${pendingAgreement.first_payment_date}.`
      );
      
      return true;
      
    } else if (text === 'TOLAK') {
      // Cancel agreement
      await loanAgreementService.cancelAgreement(pendingAgreement.id);
      
      // Notify borrower
      await this.client.sendMessage(jid, 'Perjanjian ditolak. Tidak ada hutang yang tercatat.');
      
      // Notify lender
      const lender = await userService.getUserById(pendingAgreement.lender_id);
      await this.client.sendMessage(lender.phone_number + '@s.whatsapp.net',
        `❌ ${pendingAgreement.borrower_name} telah MENOLAK perjanjian #${pendingAgreement.id}.`
      );
      
      return true;
    }
    
    return false;
  }

  // Handle payment confirmation from lender
  async handleKonfirmasiPembayaran(lenderPhone, entities, jid) {
    try {
      const { borrowerName, installmentNumber, amount } = entities;
      
      if (!borrowerName || !installmentNumber) {
        await this.client.sendMessage(jid, '❌ Informasi tidak lengkap. Contoh: "Budi sudah bayar cicilan ke-1"');
        return;
      }
      
      // Find agreement by borrower name
      const agreement = loanAgreementService.findAgreementByBorrower(DEFAULT_TENANT_ID, borrowerName);
      
      if (!agreement) {
        await this.client.sendMessage(jid, `❌ Tidak menemukan perjanjian dengan ${borrowerName}`);
        return;
      }
      
      // Get specific installment
      const installment = loanAgreementService.getInstallmentByNumber(agreement.id, parseInt(installmentNumber));
      
      if (!installment) {
        await this.client.sendMessage(jid, `❌ Cicilan #${installmentNumber} tidak ditemukan`);
        return;
      }
      
      if (installment.status === 'paid') {
        await this.client.sendMessage(jid, `⚠️ Cicilan #${installmentNumber} sudah lunas sebelumnya`);
        return;
      }
      
      // Record payment
      const paymentAmount = amount || installment.amount;
      loanAgreementService.recordPayment(installment.id, paymentAmount);
      
      // Get updated installment
      const updated = loanAgreementService.getInstallmentById(installment.id);
      
      // Get all installments to calculate remaining
      const allInstallments = loanAgreementService.getInstallments(agreement.id);
      const paidCount = allInstallments.filter(i => i.status === 'paid').length;
      const totalCount = allInstallments.length;
      const remainingCount = totalCount - paidCount;
      const remainingAmount = allInstallments
        .filter(i => i.status !== 'paid')
        .reduce((sum, i) => sum + (i.amount - (i.paid_amount || 0)), 0);
      
      // Check if all paid
      const isFullyPaid = paidCount === totalCount;
      
      // Notify lender (confirmation)
      let lenderMsg = `✅ PEMBAYARAN TERVERIFIKASI\n\n` +
        `Borrower: ${agreement.borrower_name}\n` +
        `Cicilan: #${installmentNumber}\n` +
        `Jumlah: Rp ${parseInt(paymentAmount).toLocaleString('id-ID')}\n` +
        `Status: LUNAS\n\n` +
        `Progress: ${paidCount}/${totalCount} cicilan lunas`;
      
      if (isFullyPaid) {
        lenderMsg += `\n\n🎉 PERJANJIAN LUNAS!\nSemua cicilan telah dibayar.`;
      }
      
      await this.client.sendMessage(jid, lenderMsg);
      
      // Notify borrower
      let borrowerMsg = 
        `*PEMBAYARAN TERVERIFIKASI*\n\n` +
        `Halo ${agreement.borrower_name},\n\n` +
        `Pembayaran cicilan ke-${installmentNumber} sebesar Rp ${parseInt(paymentAmount).toLocaleString('id-ID')} telah diterima dari ${agreement.actual_lender_name || 'lender'}.\n\n` +
        `✅ Status: LUNAS\n` +
        `📊 Progress: ${paidCount}/${totalCount} cicilan lunas\n`;
      
      if (isFullyPaid) {
        borrowerMsg += `\n🎉 *SELAMAT!*\nAnda telah melunasi semua cicilan.\nTerima kasih! 🙏`;
      } else {
        borrowerMsg += `💰 Sisa: ${remainingCount}x cicilan (Rp ${remainingAmount.toLocaleString('id-ID')})\n\nTerima kasih! 🙏`;
      }
      
      await this.client.sendMessage(agreement.borrower_phone + '@s.whatsapp.net', borrowerMsg);
      
    } catch (error) {
      console.error('Konfirmasi pembayaran error:', error);
      await this.client.sendMessage(jid, '❌ Terjadi kesalahan saat memproses pembayaran');
    }
  }
}

module.exports = MessageHandler;
