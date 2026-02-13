const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

class PDFGenerator {
  async generateAgreement(agreement, lender, installments) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();
    
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let y = height - 50;
    const margin = 50;
    
    // Helper function to draw text
    const drawText = (text, x, yPos, options = {}) => {
      const { size = 11, bold = false, color = rgb(0, 0, 0) } = options;
      page.drawText(text, {
        x,
        y: yPos,
        size,
        font: bold ? boldFont : font,
        color
      });
    };
    
    // Title
    drawText('SURAT PERJANJIAN HUTANG PIUTANG', margin, y, { size: 16, bold: true });
    y -= 30;
    
    drawText(`Nomor: BHTG-${agreement.id}/${new Date().toISOString().split('T')[0]}`, margin, y);
    y -= 40;
    
    // Opening
    drawText('Yang bertanda tangan di bawah ini:', margin, y);
    y -= 25;
    
    // Lender (Pihak I)
    drawText('I. PEMBERI PINJAMAN (KREDITOR)', margin, y, { bold: true });
    y -= 20;
    drawText(`    Nama: ${lender.business_name || 'User ' + lender.phone_number}`, margin + 20, y);
    y -= 15;
    drawText(`    No. WA: ${lender.phone_number}`, margin + 20, y);
    y -= 30;
    
    // Borrower (Pihak II)
    drawText('II. PENERIMA PINJAMAN (DEBITOR)', margin, y, { bold: true });
    y -= 20;
    drawText(`    Nama: ${agreement.borrower_name}`, margin + 20, y);
    y -= 15;
    drawText(`    No. WA: ${agreement.borrower_phone}`, margin + 20, y);
    if (agreement.borrower_id_number) {
      y -= 15;
      drawText(`    No. KTP: ${agreement.borrower_id_number}`, margin + 20, y);
    }
    if (agreement.borrower_address) {
      y -= 15;
      drawText(`    Alamat: ${agreement.borrower_address}`, margin + 20, y);
    }
    y -= 30;
    
    // Agreement content
    drawText('Menyatakan bahwa:', margin, y, { bold: true });
    y -= 25;
    
    drawText(`1. Pihak II berhutang kepada Pihak I sebesar:`, margin, y);
    y -= 20;
    drawText(`   Rp ${agreement.total_amount.toLocaleString('id-ID')}`, margin + 20, y, { size: 13, bold: true });
    y -= 30;
    
    drawText('2. Hutang akan dilunasi dengan cara cicilan:', margin, y);
    y -= 20;
    drawText(`   • Jumlah cicilan: Rp ${agreement.installment_amount.toLocaleString('id-ID')} per bulan`, margin + 20, y);
    y -= 15;
    drawText(`   • Jumlah bulan: ${agreement.installment_count} kali`, margin + 20, y);
    y -= 15;
    drawText(`   • Tanggal pembayaran: Setiap tanggal ${agreement.payment_day}`, margin + 20, y);
    y -= 15;
    drawText(`   • Cicilan pertama: ${agreement.first_payment_date}`, margin + 20, y);
    if (agreement.interest_rate > 0) {
      y -= 15;
      drawText(`   • Bunga: ${agreement.interest_rate}% per bulan`, margin + 20, y);
    }
    y -= 30;
    
    // Installment schedule table
    drawText('JADWAL CICILAN:', margin, y, { bold: true });
    y -= 20;
    
    installments.forEach((inst, idx) => {
      drawText(
        `   ${inst.installment_number}. ${inst.due_date} - Rp ${inst.amount.toLocaleString('id-ID')}`,
        margin + 20, y
      );
      y -= 15;
    });
    y -= 20;
    
    // Terms
    drawText('3. Pembayaran dilakukan via transfer bank atau aplikasi pembayaran.', margin, y);
    y -= 20;
    drawText('4. Apabila terlambat bayar lebih dari 7 hari, dikenakan denda sesuai kesepakatan.', margin, y);
    y -= 20;
    drawText('5. Surat ini dibuat dalam keadaan sadar tanpa paksaan dari pihak manapun.', margin, y);
    y -= 40;
    
    // Date and location
    const today = new Date().toLocaleDateString('id-ID', { 
      day: 'numeric', month: 'long', year: 'numeric' 
    });
    drawText(`Dibuat di: _______________`, margin, y);
    y -= 20;
    drawText(`Tanggal: ${today}`, margin, y);
    y -= 50;
    
    // Signatures
    const sigY = y;
    drawText('Pemberi Pinjaman,', margin, sigY, { bold: true });
    drawText('Penerima Pinjaman,', width / 2 + 20, sigY, { bold: true });
    y -= 60;
    
    drawText('(_______________________)', margin, y);
    drawText('(_______________________)', width / 2 + 20, y);
    y -= 20;
    
    drawText(lender.business_name || lender.phone_number, margin + 20, y);
    drawText(agreement.borrower_name, width / 2 + 40, y);
    
    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const outputDir = path.join(__dirname, '../../data/agreements');
    await fs.mkdir(outputDir, { recursive: true });
    
    const filename = `agreement-${agreement.id}-${Date.now()}.pdf`;
    const filepath = path.join(outputDir, filename);
    await fs.writeFile(filepath, pdfBytes);
    
    return {
      filename,
      filepath,
      url: `/data/agreements/${filename}`
    };
  }
}

module.exports = new PDFGenerator();
