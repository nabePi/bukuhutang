// Customizable reminder templates
const templates = {
  reminder: {
    default: (name, amount, dueDate) => 
      `Halo ${name},\n\nIni pengingat pembayaran:\nJumlah: Rp ${amount.toLocaleString('id-ID')}\nJatuh tempo: ${dueDate}\n\nMohon konfirmasi jika sudah membayar. Terima kasih!`,
    
    friendly: (name, amount, dueDate) =>
      `Hai ${name}! 👋\n\nJangan lupa ya, ada pembayaran Rp ${amount.toLocaleString('id-ID')} yang jatuh tempo ${dueDate}.\n\nKalau sudah bayar, kabari saya ya. Makasih! 🙏`,
    
    formal: (name, amount, dueDate) =>
      `Kepada Yth. ${name},\n\nDengan hormat, kami sampaikan tagihan sebesar Rp ${amount.toLocaleString('id-ID')} dengan jatuh tempo ${dueDate}.\n\nPembayaran dapat dilakukan via transfer bank.\n\nHormat kami,`
  },
  
  installment: {
    default: (name, number, amount, dueDate) =>
      `Halo ${name},\n\nCicilan ke-${number} sebesar Rp ${amount.toLocaleString('id-ID')} jatuh tempo ${dueDate}.\n\nTerima kasih.`,
    
    reminder: (name, number, amount, dueDate) =>
      `Hai ${name}! 🔔\n\nCicilan ke-${number} (Rp ${amount.toLocaleString('id-ID')}) tinggal ${dueDate} lagi nih.\n\nJangan lupa ya! 👍`
  }
};

function getTemplate(type, style = 'default') {
  return templates[type]?.[style] || templates[type]?.default;
}

module.exports = { templates, getTemplate };
