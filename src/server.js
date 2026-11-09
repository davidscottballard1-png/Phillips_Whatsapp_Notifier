require('dotenv').config();
const express = require('express');
const path = require('path');
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
    recentActivity: activityLog.slice(0, 30)
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
        : current.minConfidence
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
  logActivity('config', 'Updated Google Fi SMS notification & scanner settings.');
  res.json(getPublicConfig());
});

app.get('/api/events', (req, res) => {
  res.json({ events: loadEvents() });
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
    title: 'Test Alert — Phillips WhatsApp Notifier',
    dateText: new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date()),
    location: 'Your Personal Phone',
    chatName: 'Phillips Notifier System Check',
    sender: 'Phillips Notifier',
    summary:
      'Your WhatsApp event notification pipeline is active. Whenever an event is discussed in a monitored chat, you will be notified here.'
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
const HOST = process.env.HOST || '0.0.0.0';

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Phillips WhatsApp Notifier running at http://${HOST}:${PORT}`);
    if (whatsappManager.hasSavedSession() || process.env.AUTO_CONNECT_WHATSAPP === 'true') {
      logActivity(
        'whatsapp',
        'Found saved WhatsApp session on persistent storage — automatically reconnecting for 24/7 monitoring...'
      );
      whatsappManager.connect().catch((err) => {
        console.error('Auto-reconnect WhatsApp failed:', err.message);
      });
    }
  });
}

module.exports = { app, whatsappManager };
