/**
 * OpenClaw Integration Service
 * Handles communication with OpenClaw Gateway for cron jobs and reminders
 * 
 * Architecture: Stateless API - OpenClaw calls BukuHutang, not vice versa
 */

const debtService = require('./debtService');
const loanAgreementService = require('./loanAgreementService');
const policyService = require('./policyService');

class OpenClawService {
  constructor() {
    // Note: This service is STATELESS
    // OpenClaw calls BukuHutang via HTTP API, not the other way around
    // No need for OPENCLAW_GATEWAY_URL or OPENCLAW_GATEWAY_TOKEN
  }

  /**
   * Get pending reminder jobs for OpenClaw to process
   */
  async getReminderJobs(limit = 50) {
    const policy = policyService.getReminderConfig();
    const daysBefore = policy.daysBeforeDue;
    
    // Get debts due within policy window
    const debts = await debtService.getDebtsDueForReminder(daysBefore, limit);
    
    return debts.map(debt => ({
      type: 'SEND_DEBT_REMINDER',
      jobId: `debt_${debt.id}`,
      debtId: debt.id,
      tenantId: debt.tenant_id || debt.user_id,
      debtorPhone: debt.debtor_phone,
      debtorName: debt.debtor_name,
      amount: debt.amount,
      description: debt.description,
      dueDate: debt.due_date,
      ownerPhone: debt.owner_phone,
      daysUntilDue: debt.days_until_due
    }));
  }

  /**
   * Get pending installment reminder jobs
   */
  async getInstallmentJobs(limit = 50) {
    const policy = policyService.getInstallmentConfig();
    const daysBefore = policy.daysBeforeDue;
    
    // Get installments due within policy window
    const installments = await loanAgreementService.getInstallmentsDueForReminder(daysBefore, limit);
    
    return installments.map(inst => ({
      type: 'SEND_INSTALLMENT_REMINDER',
      jobId: `inst_${inst.id}`,
      installmentId: inst.id,
      agreementId: inst.agreement_id,
      tenantId: inst.tenant_id,
      debtorPhone: inst.borrower_phone,
      debtorName: inst.borrower_name,
      amount: inst.amount,
      dueDate: inst.due_date,
      installmentNumber: inst.installment_number,
      totalInstallments: inst.total_installments
    }));
  }

  /**
   * Mark a reminder as sent
   */
  async markReminderSent(jobId, type) {
    if (type === 'SEND_DEBT_REMINDER') {
      const debtId = parseInt(jobId.replace('debt_', ''));
      await debtService.markReminderSent(debtId);
    } else if (type === 'SEND_INSTALLMENT_REMINDER') {
      const installmentId = parseInt(jobId.replace('inst_', ''));
      await loanAgreementService.markInstallmentReminderSent(installmentId);
    }
  }

  /**
   * Get system status for OpenClaw health checks
   */
  async getSystemStatus() {
    const [pendingDebts, overdueDebts, activeAgreements, pendingInstallments] = await Promise.all([
      debtService.getPendingCount(),
      debtService.getOverdueCount(),
      loanAgreementService.getActiveCount(),
      loanAgreementService.getPendingInstallmentCount()
    ]);

    const policy = policyService.getAll();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats: {
        pendingDebts,
        overdueDebts,
        activeAgreements,
        pendingInstallments
      },
      policy
    };
  }

  /**
   * Generate WhatsApp message for debt reminder
   */
  generateDebtReminderMessage(job) {
    const { debtorName, amount, description, dueDate, daysUntilDue } = job;
    
    const formattedAmount = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);

    const formattedDate = new Date(dueDate).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let urgency = '';
    if (daysUntilDue < 0) {
      urgency = `⚠️ *TERLAMBAT ${Math.abs(daysUntilDue)} HARI*`;
    } else if (daysUntilDue === 0) {
      urgency = '⏰ *JATUH TEMPO HARI INI*';
    } else if (daysUntilDue <= 3) {
      urgency = `⏰ *${daysUntilDue} hari lagi* jatuh tempo`;
    }

    return `*PENGINGAT HUTANG*

Halo ${debtorName},

Ini pengingat pembayaran hutang:
📋 *${description || 'Hutang'}*
💰 *${formattedAmount}*
📅 Jatuh tempo: ${formattedDate}
${urgency}

Mohon segera melakukan pembayaran. Terima kasih! 🙏`;
  }

  /**
   * Generate WhatsApp message for installment reminder
   */
  generateInstallmentReminderMessage(job) {
    const { debtorName, amount, dueDate, installmentNumber, totalInstallments, daysUntilDue } = job;
    
    const formattedAmount = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);

    const formattedDate = new Date(dueDate).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let urgency = '';
    if (daysUntilDue < 0) {
      urgency = `⚠️ *TERLAMBAT ${Math.abs(daysUntilDue)} HARI*`;
    } else if (daysUntilDue === 0) {
      urgency = '⏰ *JATUH TEMPO HARI INI*';
    } else if (daysUntilDue <= 3) {
      urgency = `⏰ *${daysUntilDue} hari lagi* jatuh tempo`;
    }

    return `*PENGINGAT CICILAN*

Halo ${debtorName},

Ini pengingat pembayaran cicilan:
📊 Cicilan ke-${installmentNumber} dari ${totalInstallments}
💰 *${formattedAmount}*
📅 Jatuh tempo: ${formattedDate}
${urgency}

Mohon segera melakukan pembayaran. Terima kasih! 🙏`;
  }
}

module.exports = new OpenClawService();
