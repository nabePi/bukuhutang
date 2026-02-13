const { parseCommand } = require('../parser/commandParser');
const debtService = require('../services/debtService');
const userService = require('../services/userService');
const LoanInterviewAgent = require('../agents/loanInterviewAgent');
const pdfGenerator = require('../services/pdfGenerator');
const loanAgreementService = require('../services/loanAgreementService');
const { getTemplate } = require('../config/templates');
const tenantService = require('../services/tenantService');
const aiService = require('../services/aiService');

class MessageHandler {
  constructor(whatsappClient) {
    this.client = whatsappClient;
    this.interviewAgent = new LoanInterviewAgent(whatsappClient);
  }

  async handle(msg) {
    const phoneNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '');
    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    
    console.log(`Received from ${phoneNumber}: ${messageText}`);

    // Check if this is a confirmation response
    const context = aiService.getContext(phoneNumber);
    if (context?.awaitingConfirmation) {
      const confirmation = this.parseConfirmation(messageText);
      if (confirmation === 'YES') {
        // Execute the stored intent
        await this.executeIntent(phoneNumber, context.lastIntent, context.lastEntities, msg.key.remoteJid);
        aiService.clearContext(phoneNumber);
        return;
      } else if (confirmation === 'NO') {
        await this.client.sendMessage(msg.key.remoteJid, 'Oke, saya batalkan. Ada yang lain?');
        aiService.clearContext(phoneNumber);
        return;
      }
    }

    // Check if this is a borrower response (existing logic)
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

  // Helper to parse confirmation
  parseConfirmation(text) {
    const lower = text.toLowerCase().trim();
    const yesWords = ['ya', 'yes', 'betul', 'benar', 'ok', 'oke', 'iya', 'y', 'bener'];
    const noWords = ['tidak', 'no', 'salah', 'batal', 'n', 'ga', 'gak', 'enggak'];
    
    if (yesWords.some(w => lower.includes(w))) return 'YES';
    if (noWords.some(w => lower.includes(w))) return 'NO';
    return null;
  }

  // Execute the intent
  async executeIntent(phoneNumber, intent, entities, jid) {
    // Get or create user
    let user = await userService.getUserByPhone(phoneNumber);
    if (!user) {
      user = await userService.createUser(phoneNumber);
    }

    try {
      switch(intent) {
        case 'PINJAM':
          await this.handlePinjamAI(user, entities, jid);
          break;
        case 'HUTANG':
          await this.handleHutangAI(user, entities, jid);
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

  // AI versions of handlers
  async handlePinjamAI(user, entities, jid) {
    const debt = await debtService.createDebt({
      userId: user.id,
      debtorName: entities.nama,
      amount: entities.jumlah,
      description: entities.catatan || '',
      days: entities.durasi_hari || 14
    });

    const reply = `✅ Piutang tercatat!\n\nNama: ${entities.nama}\nJumlah: Rp ${entities.jumlah.toLocaleString('id-ID')}\nJatuh tempo: ${debt.due_date}${entities.catatan ? '\nCatatan: ' + entities.catatan : ''}\n\nSaya akan ingatkan 1 hari sebelum jatuh tempo.`;

    await this.client.sendMessage(jid, reply);
  }

  async handleHutangAI(user, entities, jid) {
    // Similar to PINJAM but for HUTANG
    const reply = `✅ Hutang tercatat!\n\nNama: ${entities.nama}\nJumlah: Rp ${entities.jumlah.toLocaleString('id-ID')}\nJatuh tempo: ${entities.durasi_hari || 14} hari lagi\n\nJangan lupa bayar tepat waktu ya!`;
    await this.client.sendMessage(jid, reply);
  }

  async handleBayarAI(user, entities, jid) {
    // Handle payment
    await this.client.sendMessage(jid, `✅ Memproses pembayaran untuk ${entities.nama || 'cicilan'}...`);
  }

  // Legacy handlers (kept for backward compatibility)
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
      await this.client.sendMessage(jid, `❌ Tidak menemukan piutang dengan nama "${command.name}"`);
      return;
    }

    if (!target.debtor_phone) {
      await this.client.sendMessage(jid, `⚠️ ${target.debtor_name} tidak memiliki nomor WA.`);
      return;
    }

    // Get user's preferred template style (can be stored in user settings)
    const templateStyle = user.reminder_style || 'default';
    const template = getTemplate('reminder', templateStyle);
    
    const reminderMsg = template(target.debtor_name, target.amount, target.due_date);

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

  async handleSetting(user, command, jid) {
    if (command.key === 'template') {
      const validTemplates = ['default', 'friendly', 'formal'];
      if (validTemplates.includes(command.value)) {
        await userService.updateUserSettings(user.id, 'reminder_style', command.value);
        await this.client.sendMessage(jid, `✅ Template reminder diubah ke: ${command.value}`);
      } else {
        await this.client.sendMessage(jid, `❌ Template tidak valid. Pilihan: ${validTemplates.join(', ')}`);
      }
    } else {
      await this.client.sendMessage(jid, `❌ Pengaturan "${command.key}" tidak dikenali.`);
    }
  }

  async sendHelp(jid) {
    const help = `📘 *CARA PAKAI BUKUHUTANG* 📘

💰 *CATAT HUTANG/PIUTANG*
• 📝 PINJAM [nama] [jumlah] [hari]hari "[catatan]"
• 📥 HUTANG [nama] [jumlah] [hari]hari
• 📊 STATUS — Lihat ringkasan

📋 *PERJANJIAN DENGAN CICILAN*
• 🆕 BUAT PERJANJIAN [nama] [jumlah]
• 📄 PERJANJIAN — Lihat daftar
• 💳 CICILAN — Lihat status cicilan
• 💵 BAYAR [nomor] — Bayar cicilan

📈 *LAPORAN & EXPORT*
• 📑 LAPORAN [tahun] [bulan]
• 📤 EXPORT excel
• 📈 STATISTIK

⚙️ *PENGATURAN*
• 🔧 SETTING template [default/friendly/formal]
• ℹ️ HELP — Tampilkan bantuan ini

💡 *Contoh:* PINJAM Budi 500000 14hari "Beli semen"`;

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
  // Admin command handlers
  async handleDaftarTenant(command, jid) {
    try {
      const tenant = tenantService.createTenant(
        command.id,
        command.name,
        command.phoneNumber,
        'free'
      );
      
      const reply = `✅ TENANT BERHASIL DIDAFTARKAN

ID: ${tenant.id}
Nama: ${tenant.name}
Nomor: ${tenant.phoneNumber}
Plan: ${tenant.plan}

Database tenant telah dibuat dan siap digunakan.`;
      
      await this.client.sendMessage(jid, reply);
    } catch (error) {
      console.error('Error creating tenant:', error);
      await this.client.sendMessage(jid, `❌ Gagal mendaftarkan tenant: ${error.message}`);
    }
  }

  async handleListTenant(jid) {
    try {
      const tenants = tenantService.listTenants();
      
      if (tenants.length === 0) {
        await this.client.sendMessage(jid, 'Belum ada tenant terdaftar.');
        return;
      }
      
      let reply = '📋 DAFTAR TENANT\n\n';
      
      tenants.forEach(t => {
        const statusEmoji = t.active ? '✅' : '❌';
        reply += `${statusEmoji} ${t.id}\n`;
        reply += `   Nama: ${t.name}\n`;
        reply += `   Nomor: ${t.phone_number}\n`;
        reply += `   Plan: ${t.plan}\n`;
        reply += `   Dibuat: ${new Date(t.created_at).toLocaleDateString('id-ID')}\n\n`;
      });
      
      await this.client.sendMessage(jid, reply);
    } catch (error) {
      console.error('Error listing tenants:', error);
      await this.client.sendMessage(jid, '❌ Gagal mengambil daftar tenant.');
    }
  }

  async handleNonaktifTenant(command, jid) {
    try {
      const tenant = tenantService.getTenant(command.id);
      
      if (!tenant) {
        await this.client.sendMessage(jid, `❌ Tenant dengan ID "${command.id}" tidak ditemukan.`);
        return;
      }
      
      tenantService.deactivateTenant(command.id);
      
      const reply = `✅ TENANT DINONAKTIFKAN\n\nID: ${tenant.id}\nNama: ${tenant.name}\nStatus: Non-aktif`;
      
      await this.client.sendMessage(jid, reply);
    } catch (error) {
      console.error('Error deactivating tenant:', error);
      await this.client.sendMessage(jid, '❌ Gagal menonaktifkan tenant.');
    }
  }
}

module.exports = MessageHandler;
