require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const {
  loadConfig,
  saveConfig,
  getPublicConfig,
  loadEvents,
  addOrUpdateEvent,
  recordNotification,
  deleteEvent,
  clearEvents
} = require('./store');
const { analyzeMessageForEvent } = require('./eventDetector');
const { parseWhatsAppExport } = require('./chatParser');
const { notifyUserOfEvent } = require('./notifier');
const { WhatsAppManager } = require('./whatsapp');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Allow Pixel 10 APK WebView (file:// or remote origin) to talk to the API seamlessly
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Model');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const APK_FILENAME = 'Phillips-WhatsApp-Notifier-Pixel10.apk';
const APK_CANDIDATE_PATHS = [
  path.join(__dirname, '..', APK_FILENAME),
  path.join(__dirname, '..', 'public', 'phillips-whatsapp-notifier-pixel10.apk'),
  path.join(__dirname, '..', 'dist', APK_FILENAME)
];

function resolveApkPath() {
  for (const candidate of APK_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getApkMetadata() {
  const apkPath = resolveApkPath();
  let sizeBytes = 0;
  let sha256 = '';
  let updatedAt = new Date().toISOString();

  if (apkPath) {
    try {
      const stat = fs.statSync(apkPath);
      sizeBytes = stat.size;
      updatedAt = stat.mtime.toISOString();
      const buf = fs.readFileSync(apkPath);
      sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    } catch {
      // Ignore read errors
    }
  }

  const sizeKb = sizeBytes ? `${(sizeBytes / 1024).toFixed(1)} KB` : 'Pending build';

  return {
    available: Boolean(apkPath && sizeBytes > 0),
    filename: APK_FILENAME,
    packageName: 'com.phillips.whatsappnotifier.pixel10',
    versionName: '2.0.0-pixel10',
    versionCode: 100200,
    targetDevice: 'Google Pixel 10',
    socOptimization: 'Google Tensor G5 (64-bit ARMv9)',
    displayOptimization: '6.3" Actua OLED (1080×2424 • 20:9 • 120Hz Smooth Display)',
    targetAndroid: 'Android 16 (API 35 / Baklava 36)',
    minAndroid: 'Android 8.0+ (API 26+)',
    carrierOptimization: 'Google Fi Wireless (Textbelt SMS + Native SIM SmsManager + @msg.fi.google.com)',
    signatureSchemes: ['v1 (JAR)', 'v2 (APK Signature Scheme v2)', 'v3 (APK Signature Scheme v3)'],
    sizeBytes,
    sizeFormatted: sizeKb,
    sha256,
    updatedAt,
    downloadUrl: '/api/apk/download',
    directPath: '/phillips-whatsapp-notifier-pixel10.apk',
    features: [
      'Native Pixel 10 WhatsApp NotificationListenerService (scans incoming WhatsApp chats on-device)',
      'Same-phone 8-character WhatsApp Pairing Code (no second phone needed to scan QR)',
      'Android Share Sheet integration (Export WhatsApp chat directly to Phillips Notifier)',
      'Dual SMS engine: Textbelt Cloud SMS + Native Pixel 10 Google Fi SIM (SmsManager)',
      'Offline-capable standalone on-device Chrono NLP + Gemini 2.5 Flash AI detector',
      '120Hz Smooth Display & Actua OLED True-Black battery saver theme'
    ]
  };
}

function sendApkFile(req, res) {
  const apkPath = resolveApkPath();
  if (!apkPath) {
    return res.status(404).json({
      error: 'APK file not found. Run `npm run build:apk` to build Phillips-WhatsApp-Notifier-Pixel10.apk.'
    });
  }
  logActivity('apk_download', `Downloaded ${APK_FILENAME} for Google Pixel 10`);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${APK_FILENAME}"`);
  res.setHeader('X-Android-Package', 'com.phillips.whatsappnotifier.pixel10');
  res.setHeader('X-Target-Device', 'Google Pixel 10');
  return res.sendFile(apkPath);
}

app.get('/api/apk/download', sendApkFile);
app.get('/phillips-whatsapp-notifier-pixel10.apk', sendApkFile);
app.get('/Phillips-WhatsApp-Notifier-Pixel10.apk', sendApkFile);

app.get('/api/apk/info', async (req, res) => {
  const meta = getApkMetadata();
  const hostUrl = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}${meta.downloadUrl}`;
  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(hostUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#0d261c', light: '#ffffff' }
    });
  } catch {
    // Ignore QR generation error
  }
  res.json({
    ...meta,
    fullDownloadUrl: hostUrl,
    qrDataUrl
  });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const activityLog = [];
function logActivity(type, message, meta = {}) {
  activityLog.unshift({
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    message,
    meta
  });
  if (activityLog.length > 100) {
    activityLog.pop();
  }
}

async function processDetectedEvent(eventCandidate, config, whatsappManager) {
  const { event, isNew } = addOrUpdateEvent(eventCandidate);
  logActivity(
    'event_detected',
    `${isNew ? 'Detected new event' : 'Updated event'}: "${event.title}" (${event.dateText}) in ${event.chatName}`,
    { eventId: event.id, isNew }
  );

  let notificationResult = null;
  if (isNew && config.autoNotify && config.notifyPhoneNumber) {
    notificationResult = await notifyUserOfEvent(event, config, whatsappManager);
    recordNotification(event.id, notificationResult);
    if (notificationResult.success) {
      logActivity(
        'notification_sent',
        `Notified ${notificationResult.recipient} about "${event.title}"`,
        { eventId: event.id, results: notificationResult.results }
      );
    } else {
      logActivity(
        'notification_failed',
        `Could not notify ${config.notifyPhoneNumber} for "${event.title}": ${notificationResult.error}`,
        { eventId: event.id, error: notificationResult.error }
      );
    }
  }

  return { event: loadEvents().find((e) => e.id === event.id) || event, isNew, notificationResult };
}

const whatsappManager = new WhatsAppManager({
  onIncomingMessage: async (msg, contextMessages) => {
    const config = loadConfig();
    const isWatched = whatsappManager.matchesWatchedChat(
      msg.chatJid,
      msg.chatName,
      config.watchedChats
    );
    if (!isWatched) {
      return;
    }

    logActivity('message_scanned', `Scanned message from ${msg.sender} in "${msg.chatName}"`, {
      chatName: msg.chatName,
      sender: msg.sender
    });

    const detected = await analyzeMessageForEvent(msg, contextMessages, config);
    if (detected) {
      await processDetectedEvent(detected, config, whatsappManager);
    }
  }
});

// --- API Routes ---

app.get('/api/status', (req, res) => {
  res.json({
    whatsapp: whatsappManager.getStatus(),
    config: getPublicConfig(),
    eventsCount: loadEvents().length,
    recentActivity: activityLog.slice(0, 30),
    apk: getApkMetadata()
  });
});

app.get('/api/whatsapp/status', (req, res) => {
  res.json(whatsappManager.getStatus());
});

app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    logActivity('whatsapp', 'Initiating WhatsApp Web connection...');
    const status = await whatsappManager.connect();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/pair-code', async (req, res) => {
  try {
    const config = loadConfig();
    const phoneInput = (req.body?.phoneNumber || config.notifyPhoneNumber || '').trim();
    if (!phoneInput) {
      return res.status(400).json({
        error: 'Enter your 10-digit Pixel 10 / Google Fi phone number to request an 8-character WhatsApp pairing code.'
      });
    }
    const result = await whatsappManager.requestPairingCode(phoneInput);
    logActivity(
      'whatsapp',
      `Generated Pixel 10 same-phone WhatsApp pairing code (${result.pairingCode}) for ${result.pairingPhone}`
    );
    res.json({
      ...result,
      whatsapp: whatsappManager.getStatus()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    const logout = Boolean(req.body?.logout);
    logActivity('whatsapp', logout ? 'Logged out of WhatsApp session.' : 'Disconnected WhatsApp.');
    const status = await whatsappManager.disconnect(logout);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pixel10/notification', async (req, res) => {
  try {
    const {
      chatName = 'Phillips Family Group (Pixel 10)',
      sender = 'Uncle Dave',
      text = '',
      timestamp = new Date().toISOString(),
      deviceModel = 'Google Pixel 10'
    } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Notification message text is required.' });
    }

    logActivity(
      'pixel10_listener',
      `[${deviceModel}] Intercepted WhatsApp notification in "${chatName}" from ${sender}`
    );

    const beforeIds = new Set(loadEvents().map((e) => e.id));
    await whatsappManager.ingestExternalNotification({
      chatName,
      sender,
      text,
      timestamp
    });

    const allEvents = loadEvents();
    const newOrUpdated = allEvents.filter((e) => !beforeIds.has(e.id));

    res.json({
      success: true,
      deviceModel,
      chatName,
      sender,
      detectedCount: newOrUpdated.length,
      detectedEvents: newOrUpdated,
      allEvents
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json(getPublicConfig());
});

app.post('/api/config', (req, res) => {
  const current = loadConfig();
  const body = req.body || {};

  const updates = {
    notifyPhoneNumber:
      typeof body.notifyPhoneNumber === 'string'
        ? body.notifyPhoneNumber.trim()
        : current.notifyPhoneNumber,
    userCarrier: body.userCarrier || current.userCarrier || 'google_fi',
    notificationChannels: body.notificationChannels || current.notificationChannels || 'sms',
    watchedChats: body.watchedChats !== undefined ? body.watchedChats : current.watchedChats,
    detectionMode: body.detectionMode || current.detectionMode,
    aiProvider: body.aiProvider || current.aiProvider,
    geminiModel: body.geminiModel || current.geminiModel,
    openaiModel: body.openaiModel || current.openaiModel,
    autoNotify:
      typeof body.autoNotify === 'boolean' ? body.autoNotify : current.autoNotify,
    minConfidence:
      typeof body.minConfidence === 'number'
        ? Math.max(0.3, Math.min(0.95, body.minConfidence))
        : current.minConfidence,
    deviceProfile: body.deviceProfile || current.deviceProfile || 'pixel_10',
    pixelOledDark:
      typeof body.pixelOledDark === 'boolean' ? body.pixelOledDark : current.pixelOledDark,
    pixelNotificationListener:
      typeof body.pixelNotificationListener === 'boolean'
        ? body.pixelNotificationListener
        : current.pixelNotificationListener
  };

  // Only update secret fields if non-masked values were submitted
  if (typeof body.textbeltApiKey === 'string' && !body.textbeltApiKey.includes('••••')) {
    updates.textbeltApiKey = body.textbeltApiKey.trim() || 'textbelt';
  }
  if (typeof body.geminiApiKey === 'string' && !body.geminiApiKey.includes('••••')) {
    updates.geminiApiKey = body.geminiApiKey.trim();
  }
  if (typeof body.openaiApiKey === 'string' && !body.openaiApiKey.includes('••••')) {
    updates.openaiApiKey = body.openaiApiKey.trim();
  }

  saveConfig(updates);
  logActivity('config', 'Updated Pixel 10 & Google Fi SMS notification settings.');
  res.json(getPublicConfig());
});

app.get('/api/events', (req, res) => {
  res.json({ events: loadEvents() });
});

app.get('/api/events/:id/ics', (req, res) => {
  const events = loadEvents();
  const ev = events.find((e) => e.id === req.params.id);
  if (!ev) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const start = ev.startDate ? new Date(ev.startDate) : new Date(Date.now() + 86400000);
  const end = ev.endDate
    ? new Date(ev.endDate)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const fmtIcsDate = (d) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Phillips WhatsApp Notifier//Google Pixel 10//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.id}@phillips-whatsapp-notifier.pixel10`,
    `DTSTAMP:${fmtIcsDate(new Date())}`,
    `DTSTART:${fmtIcsDate(start)}`,
    `DTEND:${fmtIcsDate(end)}`,
    `SUMMARY:${(ev.title || 'WhatsApp Event').replace(/[\r\n]+/g, ' ')}`,
    `LOCATION:${(ev.location || '').replace(/[\r\n]+/g, ' ')}`,
    `DESCRIPTION:Detected in WhatsApp chat "${ev.chatName}" from ${ev.sender}: ${(
      ev.summary ||
      ev.sourceMessage ||
      ''
    ).replace(/[\r\n]+/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${ev.id}.ics"`);
  res.send(icsLines.join('\r\n'));
});

app.post('/api/events/:id/notify', async (req, res) => {
  const events = loadEvents();
  const targetEvent = events.find((e) => e.id === req.params.id);
  if (!targetEvent) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const config = loadConfig();
  const result = await notifyUserOfEvent(targetEvent, config, whatsappManager);
  const updatedEvent = recordNotification(targetEvent.id, result);

  if (result.success) {
    logActivity(
      'notification_sent',
      `Sent notification to ${result.recipient} for "${targetEvent.title}"`
    );
  } else {
    logActivity(
      'notification_failed',
      `Notification failed for "${targetEvent.title}": ${result.error}`
    );
  }

  res.json({
    success: result.success,
    delivery: result,
    event: updatedEvent
  });
});

app.delete('/api/events/:id', (req, res) => {
  const deleted = deleteEvent(req.params.id);
  res.json({ deleted });
});

app.post('/api/events/clear', (req, res) => {
  clearEvents();
  logActivity('events', 'Cleared all detected events.');
  res.json({ cleared: true });
});

app.post('/api/notify/test', async (req, res) => {
  const config = loadConfig();
  const phoneOverride = req.body?.phoneNumber?.trim();
  const effectiveConfig = phoneOverride
    ? { ...config, notifyPhoneNumber: phoneOverride }
    : config;

  const sampleEvent = {
    title: 'Test Alert — Phillips WhatsApp Notifier (Pixel 10)',
    dateText: new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date()),
    location: 'Google Pixel 10 (Google Fi)',
    chatName: 'Phillips Notifier System Check',
    sender: 'Phillips Notifier',
    summary:
      'Your Pixel 10 WhatsApp event notification pipeline is active. Whenever an event is discussed in a monitored chat, you will be notified here.'
  };

  const result = await notifyUserOfEvent(sampleEvent, effectiveConfig, whatsappManager);
  logActivity(
    result.success ? 'notification_sent' : 'notification_failed',
    result.success
      ? `Test notification delivered to ${result.recipient}`
      : `Test notification failed: ${result.error}`
  );

  res.json(result);
});

app.post('/api/scan-chat', async (req, res) => {
  try {
    const { chatText, chatName = 'Phillips Family Chat', triggerNotifications = true } =
      req.body || {};
    if (!chatText || typeof chatText !== 'string' || !chatText.trim()) {
      return res.status(400).json({ error: 'Please provide WhatsApp chat messages to scan.' });
    }

    const config = loadConfig();
    const effectiveConfig = {
      ...config,
      autoNotify: Boolean(triggerNotifications && config.autoNotify)
    };

    const parsedMessages = parseWhatsAppExport(chatText, chatName.trim() || 'WhatsApp Chat');
    const detectedEvents = [];
    const contextWindow = [];

    for (const msg of parsedMessages) {
      const detected = await analyzeMessageForEvent(msg, contextWindow, effectiveConfig);
      contextWindow.push({ sender: msg.sender, text: msg.text, timestamp: msg.timestamp });
      if (contextWindow.length > 8) contextWindow.shift();

      if (detected) {
        const processed = await processDetectedEvent(
          detected,
          effectiveConfig,
          whatsappManager
        );
        detectedEvents.push(processed.event);
      }
    }

    logActivity(
      'chat_scan',
      `Scanned ${parsedMessages.length} message(s) from "${chatName}" — found ${detectedEvents.length} event(s).`
    );

    res.json({
      scannedMessagesCount: parsedMessages.length,
      detectedCount: detectedEvents.length,
      detectedEvents,
      allEvents: loadEvents()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const SAMPLE_CHAT_LOG = `[11/08/26, 9:14:12 AM] Mom (Linda Phillips): Good morning everyone! Hope you're all having a great week.
[11/08/26, 9:16:45 AM] Uncle Dave: Morning! Hey quick heads up — we're hosting the Phillips Family Sunday BBQ at Oak Creek Park this Sunday at 1:00 PM. Bring lawn chairs!
[11/08/26, 9:18:02 AM] Sarah Phillips: Awesome, we'll be there! I can bring potato salad and lemonade.
[11/08/26, 11:42:19 AM] Coach Marcus: Reminder: Varsity Soccer Quarterfinal Match at Memorial Stadium on Wednesday at 6:30 PM. Please arrive 30 minutes early for warmups.
[11/08/26, 2:05:50 PM] Alex Phillips: Also don't forget Cousin Emma's Birthday Dinner at Bella Notte Trattoria this Friday at 7:30 PM! Please RSVP by Wednesday noon so I can finalize the table count.`;

app.get('/api/sample-chat', (req, res) => {
  res.json({
    chatName: 'Phillips Family & Activities Group',
    chatText: SAMPLE_CHAT_LOG
  });
});

const PORT = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Phillips WhatsApp Notifier (Pixel 10 Edition) running at http://localhost:${PORT}`);
  });
}

module.exports = { app, whatsappManager, getApkMetadata };

