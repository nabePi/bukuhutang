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
  
  return { type: 'UNKNOWN', raw: message };
}

module.exports = { parseCommand };
