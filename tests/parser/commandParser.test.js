const { parseCommand } = require('../../src/parser/commandParser');

describe('parseCommand', () => {
  test('parse PINJAM command', () => {
    const result = parseCommand('PINJAM Budi 500000 14hari "Beli semen"');
    expect(result.type).toBe('PINJAM');
    expect(result.name).toBe('Budi');
    expect(result.amount).toBe(500000);
    expect(result.days).toBe(14);
    expect(result.note).toBe('Beli semen');
  });

  test('parse HUTANG command', () => {
    const result = parseCommand('HUTANG TokoBudi 2000000 30hari');
    expect(result.type).toBe('HUTANG');
    expect(result.name).toBe('TokoBudi');
    expect(result.amount).toBe(2000000);
    expect(result.days).toBe(30);
  });

  test('parse STATUS command', () => {
    const result = parseCommand('STATUS');
    expect(result.type).toBe('STATUS');
  });

  test('parse invalid command', () => {
    const result = parseCommand('INVALID');
    expect(result.type).toBe('UNKNOWN');
  });
});
