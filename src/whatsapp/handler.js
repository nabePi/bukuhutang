const { parseCommand } = require('../parser/commandParser');
const debtService = require('../services/debtService');
const userService = require('../services/userService');
const LoanInterviewAgent = require('../agents/loanInterviewAgent');
const pdfGenerator = require('../services/pdfGenerator');
const loanAgreementService = require('../services/loanAgreementService');
const { getTemplate } = require('../config/templates');

class MessageHandler {
  constructor(whatsappClient) {
    this.client = whatsappClient;
    this.interviewAgent = new LoanInterviewAgent(whatsappClient);
  }

  async handle(msg) {
    const phoneNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '');
    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

    console.log(`Received from ${phoneNumber}: ${messageText}`);

    // Check if this is a borrower response (not lender)
    const borrowerHandled = await this.handleBorrowerResponse(phoneNumber, messageText, msg.key.remoteJid);
    if (borrowerHandled) return;

    // Check if user is in active interview
    if (this.interviewAgent.isInInterview(phoneNumber)) {
      const handled = await this.interviewAgent.handleResponse(phoneNumber, messageText, msg.key.remoteJid);
      if (handled) return;
    }

    // Get or create user
    let user = await userService.getUserByPhone(phoneNumber);
    if (!user) {
      user = await userService.createUser(phoneNumber);
    }

    const command = parseCommand(messageText);
    
    try {
      switch (command.type) {
        case 'PINJAM':
          await this.handlePinjam(user, command, msg.key.remoteJid);
          break;
        case 'HUTANG':
          await this.handleHutang(user, command, msg.key.remoteJid);
          break;
        case 'STATUS':
          await this.handleStatus(user, msg.key.remoteJid);
          break;
        case 'INGATKAN':
          await this.handleIngatkan(user, command, msg.key.remoteJid);
          break;
        case 'BUAT_PERJANJIAN':
          await this.interviewAgent.startInterview(phoneNumber, command.borrowerName, command.amount, msg.key.remoteJid);
          break;
        case 'SETUJU':
        case 'UBAH':
        case 'KIRIM':
          await this.interviewAgent.handleResponse(phoneNumber, messageText, msg.key.remoteJid);
          break;
        case 'CICILAN':
          await this.handleCicilan(user, msg.key.remoteJid);
          break;
        case 'BAYAR_CICILAN':
          await this.handleBayarCicilan(user, command, msg.key.remoteJid);
          break;
        case 'BAYAR':
          await this.handleBayar(user, command, msg.key.remoteJid);
          break;
        case 'STATUS_CICILAN':
          await this.handleStatusCicilan(user, command, msg.key.remoteJid);
          break;
        case 'RIWAYAT':
          await this.handleRiwayat(user, command, msg.key.remoteJid);
          break;
        case 'PERJANJIAN':
          await this.handlePerjanjian(user, msg.key.remoteJid);
          break;
        default:
          await this.sendHelp(msg.key.remoteJid);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      await this.client.sendMessage(msg.key.remoteJid, 'Maaf, terjadi kesalahan. Coba lagi nanti.');
    }
  }

  async handlePinjam(user, command, jid) {
    const debt = await debtService.createDebt({
      userId: user.id,
      debtorName: command.name,
      amount: command.amount,
      description: command.note,
      days: command.days
    });

    const reply = `✅ Piutang tercatat!\n\nNama: ${command.name}\nJumlah: Rp ${command.amount.toLocaleString('id-ID')}\nJatuh tempo: ${debt.due_date}\nCatatan: ${command.note || '-'}\n\nSaya akan ingatkan 1 hari sebelum jatuh tempo.`;

    await this.client.sendMessage(jid, reply);
  }

  async handleHutang(user, command, jid) {
    const reply = `✅ Hutang tercatat!\n\nNama: ${command.name}\nJumlah: Rp ${command.amount.toLocaleString('id-ID')}\nJatuh tempo: ${command.days} hari lagi\n\nJangan lupa bayar tepat waktu ya!`;
    await this.client.sendMessage(jid, reply);
  }

  async handleStatus(user, jid) {
    const debts = await debtService.getPendingDebts(user.id);
    const overdue = await debtService.getOverdueDebts(user.id);
    const summary = await debtService.getSummary(user.id);

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

  async handleIngatkan(user, command, jid) {
    const debts = await debtService.getPendingDebts(user.id);
    const target = debts.find(d => d.debtor_name.toLowerCase() === command.name.toLowerCase());

    if (!target) {
      await this.client.sendMessage(jid, `Tidak menemukan piutang dengan nama "${command.name}"`);
      return;
    }

    if (!target.debtor_phone) {
      await this.client.sendMessage(jid, `${target.debtor_name} tidak memiliki nomor WA.`);
      return;
    }

    const reminderMsg = `Halo ${target.debtor_name},\n\nIni pengingat pembayaran:\nJumlah: Rp ${target.amount.toLocaleString('id-ID')}\nUntuk: ${target.description || 'Piutang'}\nJatuh tempo: ${target.due_date}\n\nMohon konfirmasi jika sudah membayar. Terima kasih!`;

    await this.client.sendMessage(target.debtor_phone + '@s.whatsapp.net', reminderMsg);
    await this.client.sendMessage(jid, `✅ Reminder terkirim ke ${target.debtor_name}`);
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

    reply += 'Ketik BAYAR CICILAN [nomor] untuk membayar';
    await this.client.sendMessage(jid, reply);
  }

  async handleBayarCicilan(user, command, jid) {
    await this.client.sendMessage(jid, `✅ Memproses pembayaran cicilan #${command.installmentNumber}...`);
  }

  async handleBayar(user, command, jid) {
    // Find active agreement
    const agreements = loanAgreementService.getUserAgreements(user.id);
    const activeAgreement = agreements.find(a => a.status === 'active');
    
    if (!activeAgreement) {
      await this.client.sendMessage(jid, 'Tidak ada cicilan aktif. Ketik CICILAN untuk melihat daftar.');
      return;
    }
    
    // Find installment by number
    const installment = loanAgreementService.getInstallmentByNumber(
      activeAgreement.id, 
      command.installmentNumber
    );
    
    if (!installment) {
      await this.client.sendMessage(jid, `Cicilan #${command.installmentNumber} tidak ditemukan.`);
      return;
    }
    
    if (installment.status === 'paid') {
      await this.client.sendMessage(jid, `Cicilan #${command.installmentNumber} sudah lunas.`);
      return;
    }
    
    // Record full payment
    const remaining = installment.amount - (installment.paid_amount || 0);
    const updated = loanAgreementService.recordPayment(installment.id, remaining);
    
    // Notify lender
    const reply = `✅ PEMBAYARAN TERCATAT

Cicilan #${command.installmentNumber}
Jumlah: Rp ${remaining.toLocaleString('id-ID')}
Status: ${updated.status === 'paid' ? 'LUNAS ✅' : 'SEBAGIAN'}
Tanggal: ${new Date().toLocaleDateString('id-ID')}

Sisa cicilan: ${updated.status === 'paid' ? '0' : 'Ada'}`;

    await this.client.sendMessage(jid, reply);
    
    // Notify borrower
    await this.client.sendMessage(activeAgreement.borrower_phone + '@s.whatsapp.net',
      `Terima kasih! Pembayaran cicilan #${command.installmentNumber} sebesar Rp ${remaining.toLocaleString('id-ID')} telah diterima.`
    );
  }

  async handleStatusCicilan(user, command, jid) {
    const agreement = loanAgreementService.findAgreementByBorrower(user.id, command.borrowerName);
    
    if (!agreement) {
      await this.client.sendMessage(jid, `Tidak menemukan perjanjian dengan ${command.borrowerName}`);
      return;
    }
    
    const installments = loanAgreementService.getPaymentHistory(agreement.id);
    
    let reply = `📊 STATUS CICILAN: ${agreement.borrower_name}\n\n`;
    reply += `Total: Rp ${agreement.total_amount.toLocaleString('id-ID')}\n`;
    reply += `Cicilan: Rp ${agreement.installment_amount.toLocaleString('id-ID')}/bulan\n\n`;
    
    let paidCount = 0;
    installments.forEach(inst => {
      const statusEmoji = inst.status === 'paid' ? '✅' : inst.status === 'partial' ? '⏳' : '⏸️';
      reply += `${statusEmoji} #${inst.installment_number}: Rp ${inst.amount.toLocaleString('id-ID')}`;
      if (inst.paid_amount > 0) {
        reply += ` (terbayar: Rp ${inst.paid_amount.toLocaleString('id-ID')})`;
      }
      reply += '\n';
      if (inst.status === 'paid') paidCount++;
    });
    
    reply += `\nProgress: ${paidCount}/${installments.length} cicilan lunas`;
    
    await this.client.sendMessage(jid, reply);
  }

  async handleRiwayat(user, command, jid) {
    const agreement = loanAgreementService.findAgreementByBorrower(user.id, command.borrowerName);
    
    if (!agreement) {
      await this.client.sendMessage(jid, `Tidak menemukan perjanjian dengan ${command.borrowerName}`);
      return;
    }
    
    const history = loanAgreementService.getPaymentHistory(agreement.id);
    const paidInstallments = history.filter(h => h.paid_amount > 0);
    
    if (paidInstallments.length === 0) {
      await this.client.sendMessage(jid, `Belum ada pembayaran dari ${command.borrowerName}`);
      return;
    }
    
    let reply = `📜 RIWAYAT PEMBAYARAN: ${agreement.borrower_name}\n\n`;
    
    paidInstallments.forEach(p => {
      reply += `✅ Cicilan #${p.installment_number}\n`;
      reply += `   Jumlah: Rp ${p.paid_amount.toLocaleString('id-ID')}\n`;
      reply += `   Tanggal: ${p.paid_at || '-'}\n\n`;
    });
    
    const totalPaid = paidInstallments.reduce((sum, p) => sum + p.paid_amount, 0);
    reply += `TOTAL TERBAYAR: Rp ${totalPaid.toLocaleString('id-ID')}`;
    
    await this.client.sendMessage(jid, reply);
  }

  async handlePerjanjian(user, jid) {
    const agreements = loanAgreementService.getUserAgreements(user.id);

    if (agreements.length === 0) {
      await this.client.sendMessage(jid, 'Belum ada perjanjian. Ketik BUAT PERJANJIAN [nama] [jumlah]');
      return;
    }

    let reply = '📋 DAFTAR PERJANJIAN\n\n';

    agreements.forEach(a => {
      const statusEmoji = a.status === 'active' ? '✅' : a.status === 'draft' ? '📝' : '✅';
      reply += `${statusEmoji} #${a.id} - ${a.borrower_name}\n`;
      reply += `   Rp ${a.total_amount.toLocaleString('id-ID')} | ${a.installment_count}x cicilan\n`;
      reply += `   Status: ${a.status}\n\n`;
    });

    await this.client.sendMessage(jid, reply);
  }

  async sendHelp(jid) {
    const help = `📘 CARA PAKAI BUKUHUTANG

PERINTAH UTAMA:
• PINJAM [nama] [jumlah] [hari]hari "[catatan]" - Catat piutang cepat
• HUTANG [nama] [jumlah] [hari]hari - Catat hutang
• STATUS - Lihat ringkasan

PERJANJIAN HUTANG (Dengan Cicilan):
• BUAT PERJANJIAN [nama] [jumlah] - Buat perjanjian dengan interview
• PERJANJIAN - Lihat daftar perjanjian
• CICILAN - Lihat cicilan aktif
• BAYAR CICILAN [nomor] - Bayar cicilan

LAINNYA:
• INGATKAN [nama] — Kirim reminder manual

PEMBAYARAN:
• BAYAR [nomor] — Catat pembayaran cicilan
• STATUS CICILAN [nama] — Cek status pembayaran
• RIWAYAT [nama] — Lihat history pembayaran`;

    await this.client.sendMessage(jid, help);
  }

  // Handle borrower responses (not in interview)
  async handleBorrowerResponse(phoneNumber, messageText, jid) {
    const text = messageText.trim().toUpperCase();
    
    // Check if this is a response to a pending agreement
    const pendingAgreement = await loanAgreementService.findPendingByBorrowerPhone(phoneNumber);
    
    if (!pendingAgreement) return false;
    
    if (text === 'SETUJU') {
      // Update agreement status
      await loanAgreementService.activateAgreement(pendingAgreement.id);
      
      // Notify borrower
      await this.client.sendMessage(jid, 
        `✅ Perjanjian disetujui!\n\nCicilan pertama jatuh tempo: ${pendingAgreement.first_payment_date}\nAnda akan menerima reminder otomatis sebelum tanggal pembayaran.`
      );
      
      // Notify lender (Dani)
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
}

module.exports = MessageHandler;
