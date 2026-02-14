const { parseCommand } = require('../parser/commandParser');
const debtService = require('../services/debtService');
const userService = require('../services/userService');
const tenantRegistrationService = require('../services/tenantRegistrationService');
const LoanInterviewAgent = require('../agents/loanInterviewAgent');
const loanAgreementService = require('../services/loanAgreementService');
const { getTemplate } = require('../config/templates');
const aiService = require('../services/aiService');
const multiSessionManager = require('./multiSessionManager');

class MultiTenantMessageHandler {
  constructor() {
    this.interviewAgents = new Map(); // tenantId -> interviewAgent
  }

  async handle(tenantId, msg) {
    const phoneNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '');
    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    
    console.log(`[Tenant ${tenantId}] Received from ${phoneNumber}: ${messageText}`);

    // Get tenant info
    const tenant = tenantRegistrationService.getTenantStatus(tenantId);
    if (!tenant || tenant.status !== 'active') {
      await multiSessionManager.sendMessage(tenantId, msg.key.remoteJid, 
        'Akun belum aktif. Silakan hubungi admin atau scan QR code untuk aktivasi.');
      return;
    }

    // Check if this is the tenant themselves (lender) or someone else
    const normalizedTenantPhone = tenant.phone_number.replace(/[^0-9]/g, '');
    const normalizedSenderPhone = phoneNumber.replace(/[^0-9]/g, '');
    
    if (normalizedSenderPhone === normalizedTenantPhone) {
      // This is the lender - process as owner
      await this.handleLenderMessage(tenantId, phoneNumber, messageText, msg);
    } else {
      // This is someone messaging the tenant's number
      // Could be borrower responding to agreement
      await this.handleBorrowerMessage(tenantId, phoneNumber, messageText, msg);
    }
  }

  async handleLenderMessage(tenantId, phoneNumber, text, msg) {
    // Get or create user for this tenant
    let user = await userService.getUserByPhone(phoneNumber, tenantId);
    if (!user) {
      user = await userService.createUser(phoneNumber, tenantId);
    }

    // Check if user is in active interview (loan agreement)
    if (!this.interviewAgents.has(tenantId)) {
      this.interviewAgents.set(tenantId, new LoanInterviewAgent(tenantId));
    }
    const interviewAgent = this.interviewAgents.get(tenantId);
    
    if (interviewAgent.isInInterview(phoneNumber)) {
      const handled = await interviewAgent.handleResponse(phoneNumber, text, msg.key.remoteJid);
      if (handled) return;
    }

    // Check if this is a confirmation response from AI
    const context = aiService.getContext(phoneNumber);
    if (context?.awaitingConfirmation) {
      const confirmation = this.parseConfirmation(text);
      if (confirmation === 'YES') {
        await this.executeIntent(tenantId, phoneNumber, context.lastIntent, context.lastEntities, msg.key.remoteJid);
        aiService.clearContext(phoneNumber);
        return;
      } else if (confirmation === 'NO') {
        await multiSessionManager.sendMessage(tenantId, msg.key.remoteJid, 'Oke, saya batalkan. Ada yang lain?');
        aiService.clearContext(phoneNumber);
        return;
      }
    }

    // Use AI to parse intent
    const parsed = await aiService.parseIntent(text, phoneNumber);
    
    // Check AI credits
    if (parsed.intent !== 'GENERAL_CHAT') {
      const hasCredits = tenantRegistrationService.deductAICredit(tenantId);
      if (!hasCredits) {
        await multiSessionManager.sendMessage(tenantId, msg.key.remoteJid, 
          '⚠️ Kredit AI habis. Silakan upgrade plan atau hubungi admin.');
        return;
      }
    }
    
    // Send AI response
    await multiSessionManager.sendMessage(tenantId, msg.key.remoteJid, parsed.response);
    
    // If no confirmation needed and we have all fields, execute
    if (!parsed.needs_confirmation && Object.keys(parsed.entities).length > 0) {
      await this.executeIntent(tenantId, phoneNumber, parsed.intent, parsed.entities, msg.key.remoteJid);
      aiService.clearContext(phoneNumber);
    }
  }

  async handleBorrowerMessage(tenantId, phoneNumber, text, msg) {
    // Handle borrower responses (SETUJU/TOLAK)
    const messageUpper = text.trim().toUpperCase();
    
    // Find pending agreement for this borrower from this tenant
    const agreement = loanAgreementService.findPendingByBorrowerPhone(tenantId, phoneNumber);

    if (!agreement) {
      await multiSessionManager.sendMessage(tenantId, msg.key.remoteJid, 
        'Maaf, tidak ada perjanjian pending untuk Anda.');
      return;
    }

    if (messageUpper === 'SETUJU') {
      // Update agreement status
      await loanAgreementService.activateAgreement(agreement.id);
      
      // Notify borrower
      await multiSessionManager.sendMessage(tenantId, msg.key.remoteJid, 
        `✅ Perjanjian disetujui!\n\nCicilan pertama jatuh tempo: ${agreement.first_payment_date}\nAnda akan menerima reminder otomatis sebelum tanggal pembayaran.`);
      
      // Notify lender
      const tenant = tenantRegistrationService.getTenantStatus(tenantId);
      await multiSessionManager.sendMessage(tenantId, tenant.phone_number + '@s.whatsapp.net',
        `🎉 ${agreement.borrower_name} telah MENYETUJUI perjanjian #${agreement.id}!\n\nCicilan aktif dimulai ${agreement.first_payment_date}.`);
        
    } else if (messageUpper === 'TOLAK') {
      // Cancel agreement
      await loanAgreementService.cancelAgreement(agreement.id);
      
      // Notify borrower
      await multiSessionManager.sendMessage(tenantId, msg.key.remoteJid, 'Perjanjian ditolak. Tidak ada hutang yang tercatat.');
      
      // Notify lender
      const tenant = tenantRegistrationService.getTenantStatus(tenantId);
      await multiSessionManager.sendMessage(tenantId, tenant.phone_number + '@s.whatsapp.net',
        `❌ ${agreement.borrower_name} telah MENOLAK perjanjian #${agreement.id}.`);
    } else {
      await multiSessionManager.sendMessage(tenantId, msg.key.remoteJid, 
        'Silakan balas dengan SETUJU atau TOLAK untuk merespon perjanjian.');
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
  async executeIntent(tenantId, phoneNumber, intent, entities, jid) {
    // Get or create user
    let user = await userService.getUserByPhone(phoneNumber, tenantId);
    if (!user) {
      user = await userService.createUser(phoneNumber, tenantId);
    }

    try {
      switch(intent) {
        case 'PINJAM':
          await this.handlePinjamAI(tenantId, user, entities, jid);
          break;
        case 'HUTANG':
          await this.handleHutangAI(tenantId, user, entities, jid);
          break;
        case 'STATUS':
          await this.handleStatus(tenantId, user, jid);
          break;
        case 'BUAT_PERJANJIAN':
          if (!this.interviewAgents.has(tenantId)) {
            this.interviewAgents.set(tenantId, new LoanInterviewAgent(tenantId));
          }
          await this.interviewAgents.get(tenantId).startInterview(phoneNumber, entities.nama, entities.jumlah, jid);
          break;
        case 'CICILAN':
          await this.handleCicilan(tenantId, user, jid);
          break;
        case 'BAYAR':
          await this.handleBayarAI(tenantId, user, entities, jid);
          break;
        case 'GENERAL_CHAT':
          // Already responded, do nothing
          break;
        default:
          await this.sendHelp(tenantId, jid);
      }
    } catch (error) {
      console.error('Execute intent error:', error);
      await multiSessionManager.sendMessage(tenantId, jid, 'Maaf, terjadi kesalahan. Coba lagi nanti ya.');
    }
  }

  // AI versions of handlers
  async handlePinjamAI(tenantId, user, entities, jid) {
    // Check debt limit
    const tenant = tenantRegistrationService.getTenantStatus(tenantId);
    const limitCheck = debtService.checkDebtLimit(tenantId, tenant.max_debts);
    if (limitCheck.exceeded) {
      await multiSessionManager.sendMessage(tenantId, jid, 
        `⚠️ Anda sudah mencapai batas maksimum ${tenant.max_debts} hutang/piutang. Silakan upgrade plan.`);
      return;
    }

    const debt = await debtService.createDebt({
      tenantId,
      userId: user.id,
      debtorName: entities.nama,
      amount: entities.jumlah,
      description: entities.catatan || '',
      days: entities.durasi_hari || 14
    });

    const reply = `✅ Piutang tercatat!\n\nNama: ${entities.nama}\nJumlah: Rp ${entities.jumlah.toLocaleString('id-ID')}\nJatuh tempo: ${debt.due_date}${entities.catatan ? '\nCatatan: ' + entities.catatan : ''}\n\nSaya akan ingatkan 1 hari sebelum jatuh tempo.`;

    await multiSessionManager.sendMessage(tenantId, jid, reply);
  }

  async handleHutangAI(tenantId, user, entities, jid) {
    const reply = `✅ Hutang tercatat!\n\nNama: ${entities.nama}\nJumlah: Rp ${entities.jumlah.toLocaleString('id-ID')}\nJatuh tempo: ${entities.durasi_hari || 14} hari lagi\n\nJangan lupa bayar tepat waktu ya!`;
    await multiSessionManager.sendMessage(tenantId, jid, reply);
  }

  async handleBayarAI(tenantId, user, entities, jid) {
    await multiSessionManager.sendMessage(tenantId, jid, `✅ Memproses pembayaran untuk ${entities.nama || 'cicilan'}...`);
  }

  async handleStatus(tenantId, user, jid) {
    const debts = await debtService.getPendingDebts(tenantId, user.id);
    const overdue = await debtService.getOverdueDebts(tenantId, user.id);
    const summary = await debtService.getSummary(tenantId, user.id);

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

    await multiSessionManager.sendMessage(tenantId, jid, reply);
  }

  async handleCicilan(tenantId, user, jid) {
    const agreements = loanAgreementService.getUserAgreements(tenantId);
    const activeAgreements = agreements.filter(a => a.status === 'active');

    if (activeAgreements.length === 0) {
      await multiSessionManager.sendMessage(tenantId, jid, 'Belum ada cicilan aktif.');
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
    await multiSessionManager.sendMessage(tenantId, jid, reply);
  }

  async sendHelp(tenantId, jid) {
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

    await multiSessionManager.sendMessage(tenantId, jid, help);
  }
}

module.exports = new MultiTenantMessageHandler();
