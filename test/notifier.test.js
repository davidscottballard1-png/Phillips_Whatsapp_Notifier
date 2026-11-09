const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseWhatsAppExport } = require('../src/chatParser');
const { detectEventWithRules, analyzeMessageForEvent } = require('../src/eventDetector');
const {
  formatEventNotificationMessage,
  formatSmsMessage,
  notifyUserOfEvent,
  getGoogleFiGatewayAddress
} = require('../src/notifier');
const {
  loadConfig,
  saveConfig,
  loadEvents,
  saveEvents,
  addOrUpdateEvent,
  recordNotification,
  deleteEvent,
  clearEvents,
  computeEventFingerprint
} = require('../src/store');

function withCleanStore(fn) {
  return async () => {
    const prevConfig = loadConfig();
    const prevEvents = loadEvents();
    try {
      await fn();
    } finally {
      saveConfig(prevConfig);
      saveEvents(prevEvents);
    }
  };
}

test('parseWhatsAppExport parses both iOS and Android WhatsApp chat formats', () => {
  const sample = `[11/08/26, 9:16:45 AM] Uncle Dave: Hey everyone, we're hosting the Phillips Family BBQ at Oak Creek Park this Sunday at 1:00 PM!
11/08/26, 14:20 - Sarah Phillips: Count us in! We will bring dessert.`;

  const parsed = parseWhatsAppExport(sample, 'Phillips Family Group');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].sender, 'Uncle Dave');
  assert.equal(parsed[0].chatName, 'Phillips Family Group');
  assert.match(parsed[0].text, /Phillips Family BBQ/);
  assert.equal(parsed[1].sender, 'Sarah Phillips');
});

test('parseWhatsAppExport filters system notices, concatenates multiline messages, and parses simple speaker lines', () => {
  const sample = `[11/08/26, 8:00:00 AM] System: Messages and calls are end-to-end encrypted.
[11/08/26, 9:10:00 AM] Coach Marcus: Practice this Thursday at 5:30 PM at Memorial Field.
Please bring both home and away jerseys!
11/08/26, 09:15 - Media Bot: <Media omitted>
Alex Phillips: Don't forget team pizza dinner on Friday at 7:00 PM!`;

  const parsed = parseWhatsAppExport(sample, 'Soccer Team Group');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].sender, 'Coach Marcus');
  assert.match(parsed[0].text, /Practice this Thursday/);
  assert.match(parsed[0].text, /Please bring both home and away jerseys!/);
  assert.equal(parsed[1].sender, 'Alex Phillips');
  assert.match(parsed[1].text, /team pizza dinner on Friday/);
});

test('detectEventWithRules extracts event details and ignores casual non-event messages', () => {
  const refDate = new Date('2026-11-08T10:00:00Z');

  const casual = detectEventWithRules('Good morning everyone! Hope you have a great week.', {
    referenceDate: refDate
  });
  assert.equal(casual, null);

  const bbqMsg =
    "Hey quick heads up — we're hosting the Phillips Family Sunday BBQ at Oak Creek Park this Sunday at 1:00 PM.";
  const detected = detectEventWithRules(bbqMsg, { referenceDate: refDate });
  assert.ok(detected);
  assert.equal(detected.isEvent, true);
  assert.equal(detected.location, 'Oak Creek Park');
  assert.ok(detected.startDate);
  assert.ok(detected.confidence >= 0.65);
});

test('analyzeMessageForEvent returns full event metadata for chat messages', async () => {
  const msg = {
    chatName: 'Phillips Family Chat',
    sender: 'Alex Phillips',
    text: "Don't forget Cousin Emma's Birthday Dinner at Bella Notte Trattoria this Friday at 7:30 PM!",
    timestamp: '2026-11-08T14:00:00Z'
  };

  const result = await analyzeMessageForEvent(msg, [], { detectionMode: 'rules' });
  assert.ok(result);
  assert.equal(result.chatName, 'Phillips Family Chat');
  assert.equal(result.sender, 'Alex Phillips');
  assert.equal(result.location, 'Bella Notte Trattoria');
  assert.equal(result.category, 'social');
});

test('notifyUserOfEvent sends SMS via Textbelt to a 10-digit Google Fi number automatically', async () => {
  const textbeltCalls = [];
  const mockFetch = async (url, opts) => {
    textbeltCalls.push({ url, body: JSON.parse(opts.body) });
    return {
      ok: true,
      status: 200,
      async json() {
        return { success: true, textId: 'tb_12345', quotaRemaining: 249 };
      }
    };
  };

  const event = {
    title: 'Phillips Family Sunday BBQ',
    dateText: 'Sun, Nov 15, 2026, 1:00 PM',
    location: 'Oak Creek Park',
    chatName: 'Phillips Family Group',
    sender: 'Uncle Dave',
    summary: 'Hosting the Phillips Family Sunday BBQ at Oak Creek Park this Sunday at 1:00 PM.'
  };

  // User enters a plain 10-digit Google Fi number (no +1 needed)
  const config = {
    notifyPhoneNumber: '555-234-5678',
    notificationChannels: 'sms',
    textbeltApiKey: 'test_textbelt_key'
  };

  const res = await notifyUserOfEvent(event, config, null, { fetchImpl: mockFetch });
  assert.equal(res.success, true);
  assert.equal(res.recipient, '+15552345678');
  assert.equal(res.carrier, 'Google Fi');
  assert.equal(res.googleFiGateway, '5552345678@msg.fi.google.com');
  assert.equal(textbeltCalls.length, 1);
  assert.equal(textbeltCalls[0].url, 'https://textbelt.com/text');
  assert.equal(textbeltCalls[0].body.phone, '+15552345678');
  assert.equal(textbeltCalls[0].body.key, 'test_textbelt_key');
  assert.match(textbeltCalls[0].body.message, /\[WhatsApp Event\] Phillips Family Sunday BBQ/);

  assert.equal(getGoogleFiGatewayAddress('(555) 234-5678'), '5552345678@msg.fi.google.com');
  const smsText = formatSmsMessage(event);
  assert.match(smsText, /\[WhatsApp Event\] Phillips Family Sunday BBQ/);
  const waText = formatEventNotificationMessage(event);
  assert.match(waText, /Phillips WhatsApp Event Alert/);
});

test('notifyUserOfEvent supports dual-channel (SMS + WhatsApp DM) delivery and validates missing phone numbers', async () => {
  const event = {
    title: 'Pixel 10 Soccer Final',
    dateText: 'Wed, Nov 11, 2026, 6:30 PM',
    location: 'Memorial Stadium',
    chatName: 'Varsity Soccer',
    sender: 'Coach Marcus'
  };

  // Missing phone number returns descriptive error
  const noPhoneRes = await notifyUserOfEvent(event, { notifyPhoneNumber: '' }, null);
  assert.equal(noPhoneRes.success, false);
  assert.match(noPhoneRes.error, /Personal phone number is not set yet/i);

  // Dual channel ('both') sends both Textbelt SMS and WhatsApp DM
  const dmCalls = [];
  const mockWhatsAppManager = {
    sendDirectMessage: async (digits, body) => {
      dmCalls.push({ digits, body });
      return { jid: `${digits}@s.whatsapp.net`, messageId: 'wa_msg_99' };
    }
  };
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { success: true, textId: 'tb_dual_1' };
    }
  });

  const bothRes = await notifyUserOfEvent(
    event,
    {
      notifyPhoneNumber: '555-777-8888',
      notificationChannels: 'both',
      textbeltApiKey: 'textbelt'
    },
    mockWhatsAppManager,
    { fetchImpl: mockFetch }
  );

  assert.equal(bothRes.success, true);
  assert.deepEqual(bothRes.channelsAttempted, ['sms', 'whatsapp']);
  assert.equal(bothRes.results.length, 2);
  assert.equal(dmCalls.length, 1);
  assert.equal(dmCalls[0].digits, '15557778888');
});

test(
  'Pixel 10 store persists deviceProfile settings and deduplicates identical events by fingerprint',
  withCleanStore(async () => {
    clearEvents();
    const cfg = saveConfig({
      deviceProfile: 'pixel_10',
      pixelOledDark: true,
      pixelNotificationListener: true
    });
    assert.equal(cfg.deviceProfile, 'pixel_10');
    assert.equal(cfg.pixelOledDark, true);
    assert.equal(cfg.pixelNotificationListener, true);

    const candidate = {
      title: 'Phillips Family Sunday BBQ',
      dateText: 'Sun, Nov 15, 2026, 1:00 PM',
      startDate: '2026-11-15T13:00:00.000Z',
      location: 'Oak Creek Park',
      chatName: 'Phillips Family Group',
      sender: 'Uncle Dave'
    };

    const first = addOrUpdateEvent(candidate);
    assert.equal(first.isNew, true);
    assert.equal(first.event.fingerprint, computeEventFingerprint(candidate));

    // Re-adding the same event in the same chat updates in-place instead of creating a duplicate
    const second = addOrUpdateEvent({
      ...candidate,
      summary: 'Updated: bring lawn chairs and lemonade!'
    });
    assert.equal(second.isNew, false);
    assert.equal(second.event.id, first.event.id);
    assert.equal(loadEvents().length, 1);

    const rec = recordNotification(first.event.id, {
      success: true,
      recipient: '+15552345678',
      channel: 'sms'
    });
    assert.equal(rec.notified, true);
    assert.equal(rec.notificationHistory.length, 1);

    assert.equal(deleteEvent(first.event.id), true);
    assert.equal(loadEvents().length, 0);
  })
);

test(
  'Pixel 10 APK metadata and downloadable APK endpoints serve valid signed Android package',
  withCleanStore(async () => {
    const { app, getApkMetadata } = require('../src/server');
    const meta = getApkMetadata();
    assert.equal(meta.available, true);
    assert.equal(meta.filename, 'Phillips-WhatsApp-Notifier-Pixel10.apk');
    assert.equal(meta.packageName, 'com.phillips.whatsappnotifier.pixel10');
    assert.equal(meta.targetDevice, 'Google Pixel 10');
    assert.ok(meta.sizeBytes > 10000);
    assert.equal(meta.sha256.length, 64);

    const server = app.listen(0);
    try {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      // Verify /api/apk/info
      const infoRes = await fetch(`${baseUrl}/api/apk/info`);
      assert.equal(infoRes.status, 200);
      const infoData = await infoRes.json();
      assert.equal(infoData.available, true);
      assert.equal(infoData.packageName, 'com.phillips.whatsappnotifier.pixel10');
      assert.ok(infoData.qrDataUrl.startsWith('data:image/png;base64,'));

      // Verify /api/apk/download binary APK response
      const apkRes = await fetch(`${baseUrl}/api/apk/download`);
      assert.equal(apkRes.status, 200);
      assert.match(
        apkRes.headers.get('content-type') || '',
        /application\/vnd\.android\.package-archive/
      );
      assert.match(
        apkRes.headers.get('content-disposition') || '',
        /Phillips-WhatsApp-Notifier-Pixel10\.apk/
      );
      const apkBuf = Buffer.from(await apkRes.arrayBuffer());
      assert.equal(apkBuf.length, meta.sizeBytes);
      // Verify PK\x03\x04 ZIP/APK header magic bytes
      assert.equal(apkBuf[0], 0x50);
      assert.equal(apkBuf[1], 0x4b);
      assert.equal(apkBuf[2], 0x03);
      assert.equal(apkBuf[3], 0x04);

      // Verify Pixel 10 live notification listener ingestion endpoint
      const notifRes = await fetch(`${baseUrl}/api/pixel10/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatName: 'Phillips Pixel 10 Group',
          sender: 'Uncle Dave',
          text: "Hey everyone! We're hosting the Phillips Summer Kickoff Cookout at Oak Creek Park this Saturday at 2:00 PM!",
          deviceModel: 'Google Pixel 10'
        })
      });
      assert.equal(notifRes.status, 200);
      const notifData = await notifRes.json();
      assert.equal(notifData.success, true);
      assert.ok(notifData.allEvents.length >= 1);

      // Verify .ics calendar export for the detected event
      const eventId = notifData.allEvents[0].id;
      const icsRes = await fetch(`${baseUrl}/api/events/${encodeURIComponent(eventId)}/ics`);
      assert.equal(icsRes.status, 200);
      const icsText = await icsRes.text();
      assert.match(icsText, /BEGIN:VCALENDAR/);
      assert.match(icsText, /Google Pixel 10/);
    } finally {
      server.close();
    }
  })
);

test('Locked test suite manifest (test/test-lock.json) matches cryptographic SHA-256 hashes of all test files', () => {
  const lockPath = path.join(__dirname, 'test-lock.json');
  assert.equal(
    fs.existsSync(lockPath),
    true,
    'test/test-lock.json must exist to enforce locked test suite integrity'
  );
  const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(lockData.locked, true);
  assert.ok(Object.keys(lockData.files || {}).length >= 2);

  for (const [fileName, expected] of Object.entries(lockData.files)) {
    const fullPath = path.join(__dirname, fileName);
    assert.equal(fs.existsSync(fullPath), true, `Locked test file missing: ${fileName}`);
    const content = fs.readFileSync(fullPath);
    const actualSha256 = crypto.createHash('sha256').update(content).digest('hex');
    assert.equal(
      actualSha256,
      expected.sha256,
      `Test file ${fileName} has been modified and does not match its locked SHA-256 checksum`
    );
    assert.equal(content.length, expected.bytes);
  }
});
