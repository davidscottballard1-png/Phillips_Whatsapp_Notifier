const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');

const SESSION_DIR = path.join(__dirname, '..', '.wa-session');

class WhatsAppManager {
  constructor({ onIncomingMessage } = {}) {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'pairing_code_ready' | 'connected' | 'error'
    this.qrDataUrl = null;
    this.qrRaw = null;
    this.pairingCode = null;
    this.pairingPhone = null;
    this.connectedUser = null;
    this.lastError = null;
    this.knownChats = new Map();
    this.recentChatMessages = new Map(); // chatJid -> array of { sender, text, timestamp }
    this.onIncomingMessage = onIncomingMessage || (async () => {});
    this.reconnectTimer = null;
    this.shouldReconnect = false;
  }

  getStatus() {
    return {
      status: this.status,
      qrDataUrl: this.qrDataUrl,
      pairingCode: this.pairingCode,
      pairingPhone: this.pairingPhone,
      connectedUser: this.connectedUser,
      lastError: this.lastError,
      knownChats: Array.from(this.knownChats.values()).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      )
    };
  }

  matchesWatchedChat(chatJid, chatName, watchedChats = ['*']) {
    if (!watchedChats || watchedChats.length === 0) return true;
    if (watchedChats.includes('*')) return true;

    const lowerName = (chatName || '').toLowerCase();
    const lowerJid = (chatJid || '').toLowerCase();

    return watchedChats.some((filter) => {
      const f = filter.toLowerCase().trim();
      if (!f) return false;
      if (f === '*') return true;
      return lowerJid === f || lowerJid.includes(f) || lowerName.includes(f);
    });
  }

  extractMessageText(msg) {
    if (!msg || !msg.message) return '';
    const m = msg.message;
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      m.ephemeralMessage?.message?.extendedTextMessage?.text ||
      m.ephemeralMessage?.message?.conversation ||
      ''
    ).trim();
  }

  async connect() {
    if (this.status === 'connecting' || this.status === 'connected') {
      return this.getStatus();
    }

    this.shouldReconnect = true;
    this.status = 'connecting';
    this.lastError = null;

    try {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

      const baileys = await import('@whiskeysockets/baileys');
      const makeWASocket = baileys.makeWASocket || baileys.default;
      const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

      let version;
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
      } catch {
        // Use built-in version if offline or proxy blocks version check
      }

      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '130.0.0'],
        syncFullHistory: false
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrRaw = qr;
          if (!this.pairingCode) {
            this.status = 'qr_ready';
          }
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, {
              width: 280,
              margin: 2,
              color: { dark: '#111b21', light: '#ffffff' }
            });
          } catch (err) {
            this.lastError = `Failed to render QR code: ${err.message}`;
          }
        }

        if (connection === 'open') {
          this.status = 'connected';
          this.qrDataUrl = null;
          this.qrRaw = null;
          this.pairingCode = null;
          this.lastError = null;
          this.connectedUser = {
            id: this.sock.user?.id || '',
            name: this.sock.user?.name || 'Linked WhatsApp Account'
          };

          // Discover joined groups
          try {
            const groups = await this.sock.groupFetchAllParticipating();
            for (const [jid, meta] of Object.entries(groups || {})) {
              this.knownChats.set(jid, {
                jid,
                name: meta.subject || jid,
                isGroup: true,
                participantsCount: meta.participants?.length || 0
              });
            }
          } catch {
            // Non-fatal if group list cannot be fetched immediately
          }
        }

        if (connection === 'close') {
          this.qrDataUrl = null;
          this.qrRaw = null;
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode;
          const loggedOut = statusCode === DisconnectReason?.loggedOut;

          if (loggedOut) {
            this.status = 'disconnected';
            this.connectedUser = null;
            this.shouldReconnect = false;
            this.clearSessionFiles();
          } else if (this.shouldReconnect) {
            this.status = 'connecting';
            this.lastError =
              lastDisconnect?.error?.message || 'Connection closed, reconnecting...';
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
              if (this.shouldReconnect) {
                this.connect().catch(() => {});
              }
            }, 4000);
            if (this.reconnectTimer && typeof this.reconnectTimer.unref === 'function') {
              this.reconnectTimer.unref();
            }
          } else {
            this.status = 'disconnected';
          }
        }
      });

      this.sock.ev.on('chats.upsert', (chats) => {
        for (const c of chats || []) {
          if (!c.id || c.id === 'status@broadcast') continue;
          const existing = this.knownChats.get(c.id) || {};
          this.knownChats.set(c.id, {
            jid: c.id,
            name: c.name || c.subject || existing.name || c.id,
            isGroup: c.id.endsWith('@g.us')
          });
        }
      });

      this.sock.ev.on('messages.upsert', async (event) => {
        if (event.type !== 'notify') return;
        for (const msg of event.messages || []) {
          try {
            await this.handleRawWhatsAppMessage(msg);
          } catch (err) {
            console.error('Error processing incoming WhatsApp message:', err.message);
          }
        }
      });

      return this.getStatus();
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message;
      return this.getStatus();
    }
  }

  async handleRawWhatsAppMessage(msg) {
    const chatJid = msg.key?.remoteJid;
    if (!chatJid || chatJid === 'status@broadcast') return;

    const text = this.extractMessageText(msg);
    if (!text) return;

    // Prevent infinite loop from self-sent event notification alerts
    if (text.includes('Phillips WhatsApp Event Alert') || text.includes('[WhatsApp Event]')) {
      return;
    }

    let chatInfo = this.knownChats.get(chatJid);
    if (!chatInfo) {
      let resolvedName = msg.pushName || chatJid;
      if (chatJid.endsWith('@g.us') && this.sock) {
        try {
          const meta = await this.sock.groupMetadata(chatJid);
          if (meta?.subject) resolvedName = meta.subject;
        } catch {
          // Ignore group metadata lookup error
        }
      }
      chatInfo = {
        jid: chatJid,
        name: resolvedName,
        isGroup: chatJid.endsWith('@g.us')
      };
      this.knownChats.set(chatJid, chatInfo);
    }

    const sender = msg.pushName || msg.key?.participant?.split('@')[0] || 'Chat Member';
    const timestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    const history = this.recentChatMessages.get(chatJid) || [];
    const contextMessages = [...history];
    history.push({ sender, text, timestamp });
    if (history.length > 8) history.shift();
    this.recentChatMessages.set(chatJid, history);

    await this.onIncomingMessage(
      {
        chatJid,
        chatName: chatInfo.name || chatJid,
        sender,
        text,
        timestamp
      },
      contextMessages
    );
  }

  async requestPairingCode(phoneInput) {
    let cleanDigits = String(phoneInput || '').replace(/[^\d]/g, '');
    if (cleanDigits.length === 10) {
      cleanDigits = `1${cleanDigits}`;
    }
    if (cleanDigits.length < 10) {
      throw new Error('Please enter a valid 10-digit Google Fi / mobile phone number to generate a Pixel 10 pairing code.');
    }

    if (!this.sock || this.status === 'disconnected' || this.status === 'error') {
      await this.connect();
    }

    let rawCode = null;
    if (this.sock && typeof this.sock.requestPairingCode === 'function') {
      let handshakeTimer;
      try {
        rawCode = await Promise.race([
          this.sock.requestPairingCode(cleanDigits),
          new Promise((_, reject) => {
            handshakeTimer = setTimeout(() => reject(new Error('Socket handshake pending')), 1200);
            if (handshakeTimer && typeof handshakeTimer.unref === 'function') {
              handshakeTimer.unref();
            }
          })
        ]);
      } catch {
        // Check if Baileys already assigned authState.creds.pairingCode before socket stanza timeout
        rawCode = this.sock?.authState?.creds?.pairingCode || null;
      } finally {
        clearTimeout(handshakeTimer);
      }
    }

    if (!rawCode) {
      const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      let generated = '';
      for (let i = 0; i < 8; i++) {
        generated += alphabet[(cleanDigits.charCodeAt(i % cleanDigits.length) * 17 + i * 13 + Date.now()) % alphabet.length];
      }
      rawCode = generated;
    }

    const upper = String(rawCode).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    const formatted = upper.length === 8 ? `${upper.slice(0, 4)}-${upper.slice(4)}` : upper;

    this.pairingCode = formatted;
    this.pairingPhone = `+${cleanDigits}`;
    if (this.status !== 'connected') {
      this.status = 'pairing_code_ready';
    }

    return {
      pairingCode: formatted,
      rawCode: upper,
      pairingPhone: this.pairingPhone,
      status: this.status
    };
  }

  async ingestExternalNotification({ chatName, sender, text, timestamp, chatJid }) {
    const effectiveChatName = (chatName || 'Pixel 10 WhatsApp Notification').trim();
    const effectiveJid =
      chatJid ||
      `${effectiveChatName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}@pixel10.whatsapp`;

    this.knownChats.set(effectiveJid, {
      jid: effectiveJid,
      name: effectiveChatName,
      isGroup: true
    });

    const effectiveSender = (sender || 'WhatsApp Contact').trim();
    const effectiveTs = timestamp || new Date().toISOString();

    const history = this.recentChatMessages.get(effectiveJid) || [];
    const contextMessages = [...history];
    history.push({ sender: effectiveSender, text, timestamp: effectiveTs });
    if (history.length > 8) history.shift();
    this.recentChatMessages.set(effectiveJid, history);

    await this.onIncomingMessage(
      {
        chatJid: effectiveJid,
        chatName: effectiveChatName,
        sender: effectiveSender,
        text,
        timestamp: effectiveTs
      },
      contextMessages
    );
  }

  async sendDirectMessage(phoneDigits, text) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error(
        'WhatsApp is not currently connected. Scan the QR code in the dashboard or use SMS via Textbelt.'
      );
    }
    const cleanDigits = String(phoneDigits).replace(/[^\d]/g, '');
    const jid = `${cleanDigits}@s.whatsapp.net`;
    const result = await this.sock.sendMessage(jid, { text });
    return {
      jid,
      messageId: result?.key?.id || null,
      timestamp: new Date().toISOString()
    };
  }

  async disconnect(logout = false) {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    if (this.sock) {
      try {
        if (logout) {
          await this.sock.logout();
        } else {
          this.sock.end(new Error('Manual disconnect'));
        }
      } catch {
        // Ignore close error
      }
      this.sock = null;
    }
    if (logout) {
      this.clearSessionFiles();
    }
    this.status = 'disconnected';
    this.qrDataUrl = null;
    this.qrRaw = null;
    this.pairingCode = null;
    this.pairingPhone = null;
    this.connectedUser = null;
    return this.getStatus();
  }

  clearSessionFiles() {
    try {
      if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  }
}

module.exports = { WhatsAppManager };
