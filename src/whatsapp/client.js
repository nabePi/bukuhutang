const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const path = require('path');

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.messageHandler = null;
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true
    });

    this.sock.ev.on('creds.update', saveCreds);
    
    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Connection closed, reconnecting:', shouldReconnect);
        if (shouldReconnect) {
          this.connect();
        }
      } else if (connection === 'open') {
        console.log('WhatsApp connection opened');
      }
    });

    this.sock.ev.on('messages.upsert', async (m) => {
      if (this.messageHandler) {
        for (const msg of m.messages) {
          if (!msg.key.fromMe && m.type === 'notify') {
            await this.messageHandler(msg);
          }
        }
      }
    });

    return this.sock;
  }

  onMessage(handler) {
    this.messageHandler = handler;
  }

  async sendMessage(jid, text) {
    if (!this.sock) throw new Error('Not connected');
    await this.sock.sendMessage(jid, { text });
  }
}

module.exports = new WhatsAppClient();
