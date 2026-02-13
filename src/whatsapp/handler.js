const { parseCommand } = require('../parser/commandParser');
const debtService = require('../services/debtService');
const userService = require('../services/userService');
const LoanInterviewAgent = require('../agents/loanInterviewAgent');
const pdfGenerator = require('../services/pdfGenerator');
const loanAgreementService = require('../services/loanAgreementService');

class MessageHandler {
  constructor(whatsappClient) {
    this.client = whatsappClient;
    this.interviewAgent = new LoanInterviewAgent(whatsappClient);
  }

  async handle(msg) {
    const phoneNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '');
    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

    console.log(`Received from ${phoneNumber}: ${messageText}`);

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
• INGATKAN [nama] - Kirim reminder manual`;

    await this.client.sendMessage(jid, help);
  }
}

module.exports = MessageHandler;
