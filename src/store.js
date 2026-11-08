const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const EVENTS_PATH = path.join(DATA_DIR, 'events.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getDefaultConfig() {
  const rawWatched = process.env.WATCHED_CHATS || '*';
  const watchedChats = rawWatched
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    notifyPhoneNumber: process.env.NOTIFY_PHONE_NUMBER || '',
    userCarrier: process.env.USER_CARRIER || 'google_fi',
    notificationChannels: process.env.NOTIFICATION_CHANNELS || 'sms', // 'sms' | 'whatsapp' | 'both'
    textbeltApiKey: process.env.TEXTBELT_API_KEY || 'textbelt',
    watchedChats: watchedChats.length ? watchedChats : ['*'],
    detectionMode: process.env.DETECTION_MODE || 'hybrid', // 'hybrid' | 'ai' | 'rules'
    aiProvider: process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY ? 'openai' : 'gemini',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    autoNotify: true,
    minConfidence: 0.55
  };
}

function loadConfig() {
  ensureDataDir();
  const defaults = getDefaultConfig();
  if (!fs.existsSync(CONFIG_PATH)) {
    return defaults;
  }
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

function saveConfig(partialConfig) {
  ensureDataDir();
  const current = loadConfig();
  const updated = { ...current, ...partialConfig };
  if (typeof updated.watchedChats === 'string') {
    updated.watchedChats = updated.watchedChats
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (updated.watchedChats.length === 0) {
      updated.watchedChats = ['*'];
    }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return '';
  if (secret === 'textbelt') return 'textbelt';
  if (secret.length <= 8) return '••••••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

function getPublicConfig() {
  const cfg = loadConfig();
  return {
    ...cfg,
    textbeltApiKey: maskSecret(cfg.textbeltApiKey),
    geminiApiKey: maskSecret(cfg.geminiApiKey),
    openaiApiKey: maskSecret(cfg.openaiApiKey),
    hasTextbeltKey: Boolean(cfg.textbeltApiKey),
    hasGeminiKey: Boolean(cfg.geminiApiKey),
    hasOpenaiKey: Boolean(cfg.openaiApiKey)
  };
}

function loadEvents() {
  ensureDataDir();
  if (!fs.existsSync(EVENTS_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveEvents(events) {
  ensureDataDir();
  fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf8');
}

function computeEventFingerprint(event) {
  const normalizedTitle = (event.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const datePart = event.startDate
    ? new Date(event.startDate).toISOString().slice(0, 13)
    : (event.dateText || '').toLowerCase().trim();
  const chatPart = (event.chatName || '').toLowerCase().trim();
  const raw = `${chatPart}|${normalizedTitle}|${datePart}`;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

function addOrUpdateEvent(eventData) {
  const events = loadEvents();
  const fingerprint = computeEventFingerprint(eventData);
  const existingIndex = events.findIndex((e) => e.fingerprint === fingerprint);

  if (existingIndex !== -1) {
    const existing = events[existingIndex];
    const updated = {
      ...existing,
      ...eventData,
      id: existing.id,
      fingerprint,
      notified: existing.notified || Boolean(eventData.notified),
      notificationHistory: existing.notificationHistory || [],
      updatedAt: new Date().toISOString()
    };
    events[existingIndex] = updated;
    saveEvents(events);
    return { event: updated, isNew: false };
  }

  const newEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fingerprint,
    title: eventData.title || 'Untitled Event',
    dateText: eventData.dateText || 'Date TBD',
    startDate: eventData.startDate || null,
    endDate: eventData.endDate || null,
    location: eventData.location || '',
    category: eventData.category || 'general',
    summary: eventData.summary || '',
    chatName: eventData.chatName || 'WhatsApp Chat',
    chatJid: eventData.chatJid || '',
    sender: eventData.sender || 'Unknown',
    sourceMessage: eventData.sourceMessage || '',
    messageTimestamp: eventData.messageTimestamp || new Date().toISOString(),
    confidence: typeof eventData.confidence === 'number' ? eventData.confidence : 0.75,
    detectionMethod: eventData.detectionMethod || 'rules',
    notified: Boolean(eventData.notified),
    notificationHistory: eventData.notificationHistory || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  events.unshift(newEvent);
  saveEvents(events.slice(0, 500));
  return { event: newEvent, isNew: true };
}

function recordNotification(eventId, deliveryResult) {
  const events = loadEvents();
  const idx = events.findIndex((e) => e.id === eventId);
  if (idx === -1) return null;

  const entry = {
    timestamp: new Date().toISOString(),
    ...deliveryResult
  };
  events[idx].notified = Boolean(deliveryResult.success);
  events[idx].notificationHistory = [
    entry,
    ...(events[idx].notificationHistory || [])
  ].slice(0, 20);
  events[idx].updatedAt = new Date().toISOString();
  saveEvents(events);
  return events[idx];
}

function deleteEvent(eventId) {
  const events = loadEvents();
  const filtered = events.filter((e) => e.id !== eventId);
  saveEvents(filtered);
  return filtered.length !== events.length;
}

function clearEvents() {
  saveEvents([]);
}

module.exports = {
  loadConfig,
  saveConfig,
  getPublicConfig,
  loadEvents,
  saveEvents,
  addOrUpdateEvent,
  recordNotification,
  deleteEvent,
  clearEvents,
  computeEventFingerprint
};
