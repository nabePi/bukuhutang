const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');

class MultiSessionManager {
  constructor() {
    this.sessions = new Map(); // tenantId -> { sock, handler, qr }
    this.messageHandlers = new Map();
  }

  async createSession(tenantId, phoneNumber) {
    const sessionDir = path.join(__dirname, `../../auth_sessions/${tenantId}`);
    
    // Ensure directory exists
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: ['BukuHutang', 'Chrome', '10.0']
    });

    this.sessions.set(tenantId, {
      sock,
      phoneNumber,
      connected: false,
      qr: null
    });

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log(`[Tenant ${tenantId}] QR Code generated`);
        this.sessions.get(tenantId).qr = qr;
        // Store QR in DB or notify admin
      }
      
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`[Tenant ${tenantId}] Connection closed, reconnecting:`, shouldReconnect);
        
        if (shouldReconnect) {
          this.createSession(tenantId, phoneNumber);
        }
      } else if (connection === 'open') {
        console.log(`[Tenant ${tenantId}] WhatsApp connected!`);
        this.sessions.get(tenantId).connected = true;
        this.sessions.get(tenantId).qr = null;
        
        // Update tenant record
        const { getConnection } = require('../db/connection');
        const db = getConnection();
        db.prepare('UPDATE tenants SET status = ?, last_active = datetime("now") WHERE id = ?')
          .run('active', tenantId);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle messages
    sock.ev.on('messages.upsert', async (m) => {
      for (const msg of m.messages) {
        if (!msg.key.fromMe && m.type === 'notify') {
          await this.handleMessage(tenantId, msg);
        }
      }
    });

    return sock;
  }

  async handleMessage(tenantId, msg) {
    const handler = this.messageHandlers.get(tenantId);
    if (handler) {
      await handler(tenantId, msg);
    }
  }

  setMessageHandler(tenantId, handler) {
    this.messageHandlers.set(tenantId, handler);
  }

  getSession(tenantId) {
    return this.sessions.get(tenantId);
  }

  async sendMessage(tenantId, jid, text) {
    const session = this.sessions.get(tenantId);
    if (!session || !session.connected) {
      throw new Error(`Tenant ${tenantId} WhatsApp not connected`);
    }
    return await session.sock.sendMessage(jid, { text });
  }

  async closeSession(tenantId) {
    const session = this.sessions.get(tenantId);
    if (session) {
      await session.sock.logout();
      this.sessions.delete(tenantId);
    }
  }

  getAllSessions() {
    return Array.from(this.sessions.entries()).map(([id, data]) => ({
      tenantId: id,
      phoneNumber: data.phoneNumber,
      connected: data.connected,
      hasQR: !!data.qr,
      qr: data.qr
    }));
  }
  
  // Get QR code for a tenant
  getQR(tenantId) {
    const session = this.sessions.get(tenantId);
    return session?.qr || null;
  }
}

module.exports = new MultiSessionManager();
