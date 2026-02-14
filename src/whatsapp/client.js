const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const path = require('path');
const QRCode = require('qrcode');

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.messageHandler = null;
    this.qrCode = null;
    this.connectionState = 'disconnected';
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true
    });

    this.sock.ev.on('creds.update', saveCreds);
    
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        // Generate QR code image
        try {
          this.qrCode = await QRCode.toDataURL(qr);
          this.connectionState = 'qr_ready';
          console.log('[WhatsApp] QR Code generated');
        } catch (err) {
          console.error('[WhatsApp] QR generation error:', err);
        }
      }
      
      if (connection === 'close') {
        this.connectionState = 'disconnected';
        this.qrCode = null;
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Connection closed, reconnecting:', shouldReconnect);
        if (shouldReconnect) {
          this.connect();
        }
      } else if (connection === 'open') {
        this.connectionState = 'connected';
        this.qrCode = null;
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
  
  getStatus() {
    // Check if actually connected by looking at sock.user
    const isConnected = !!this.sock?.user;
    
    return {
      state: this.connectionState,
      connected: isConnected,
      qrCode: isConnected ? null : this.qrCode,
      user: this.sock?.user || null
    };
  }
}

module.exports = new WhatsAppClient();
