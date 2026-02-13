function parseCommand(message) {
  const trimmed = message.trim().toUpperCase();
  
  // PINJAM command
  // Format: PINJAM [name] [amount] [days]hari "[note]"
  const pinjamMatch = message.match(/^PINJAM\s+(\S+)\s+(\d+)\s+(\d+)hari(?:\s+"([^"]*)")?/i);
  if (pinjamMatch) {
    return {
      type: 'PINJAM',
      name: pinjamMatch[1],
      amount: parseInt(pinjamMatch[2]),
      days: parseInt(pinjamMatch[3]),
      note: pinjamMatch[4] || ''
    };
  }
  
  // HUTANG command
  // Format: HUTANG [name] [amount] [days]hari
  const hutangMatch = message.match(/^HUTANG\s+(\S+)\s+(\d+)\s+(\d+)hari/i);
  if (hutangMatch) {
    return {
      type: 'HUTANG',
      name: hutangMatch[1],
      amount: parseInt(hutangMatch[2]),
      days: parseInt(hutangMatch[3]),
      note: ''
    };
  }
  
  // STATUS command
  if (trimmed === 'STATUS') {
    return { type: 'STATUS' };
  }
  
  // INGATKAN command
  const ingatkanMatch = message.match(/^INGATKAN\s+(\S+)/i);
  if (ingatkanMatch) {
    return {
      type: 'INGATKAN',
      name: ingatkanMatch[1]
    };
  }

  // BUAT PERJANJIAN command
  const buatPerjanjianMatch = message.match(/^BUAT\s+PERJANJIAN\s+(\S+)\s+(\d+)/i);
  if (buatPerjanjianMatch) {
    return {
      type: 'BUAT_PERJANJIAN',
      borrowerName: buatPerjanjianMatch[1],
      amount: parseInt(buatPerjanjianMatch[2])
    };
  }

  // SETUJU command
  if (trimmed === 'SETUJU') {
    return { type: 'SETUJU' };
  }

  // UBAH command
  const ubahMatch = message.match(/^UBAH\s+(\d+)/i);
  if (ubahMatch) {
    return {
      type: 'UBAH',
      amount: parseInt(ubahMatch[1])
    };
  }

  // KIRIM command
  const kirimMatch = message.match(/^KIRIM\s+(\d+)/i);
  if (kirimMatch) {
    return {
      type: 'KIRIM',
      agreementId: parseInt(kirimMatch[1])
    };
  }

  // CICILAN command
  if (trimmed === 'CICILAN') {
    return { type: 'CICILAN' };
  }

  // BAYAR CICILAN command
  const bayarMatch = message.match(/^BAYAR\s+CICILAN\s+(\d+)/i);
  if (bayarMatch) {
    return {
      type: 'BAYAR_CICILAN',
      installmentNumber: parseInt(bayarMatch[1])
    };
  }

  // PERJANJIAN command
  if (trimmed === 'PERJANJIAN') {
    return { type: 'PERJANJIAN' };
  }

  // BAYAR command (for payment tracking)
  const bayarCmdMatch = message.match(/^BAYAR\s+(\d+)/i);
  if (bayarCmdMatch) {
    return {
      type: 'BAYAR',
      installmentNumber: parseInt(bayarCmdMatch[1])
    };
  }

  // STATUS CICILAN command
  const statusCicilanMatch = message.match(/^STATUS\s+CICILAN\s+(\S+)/i);
  if (statusCicilanMatch) {
    return {
      type: 'STATUS_CICILAN',
      borrowerName: statusCicilanMatch[1]
    };
  }

  // RIWAYAT command
  const riwayatMatch = message.match(/^RIWAYAT\s+(\S+)/i);
  if (riwayatMatch) {
    return {
      type: 'RIWAYAT',
      borrowerName: riwayatMatch[1]
    };
  }

  return { type: 'UNKNOWN', raw: message };
}

module.exports = { parseCommand };
