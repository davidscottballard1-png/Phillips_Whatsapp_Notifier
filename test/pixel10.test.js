const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { WhatsAppManager } = require('../src/whatsapp');
const {
  loadConfig,
  saveConfig,
  loadEvents,
  saveEvents
} = require('../src/store');
const { app, whatsappManager, getApkMetadata } = require('../src/server');

const ROOT_DIR = path.join(__dirname, '..');

// Helper to snapshot and restore store state around tests
function withIsolatedStore(fn) {
  return async () => {
    const initialConfig = loadConfig();
    const initialEvents = loadEvents();
    try {
      await fn();
    } finally {
      saveConfig(initialConfig);
      saveEvents(initialEvents);
      await whatsappManager.disconnect(false);
    }
  };
}

test('WhatsAppManager.requestPairingCode generates valid 8-character formatted pairing code for 10-digit Pixel 10 Google Fi numbers', async () => {
  const manager = new WhatsAppManager();
  // Stub sock.requestPairingCode to avoid network dependency in unit test
  manager.status = 'connecting';
  manager.sock = {
    requestPairingCode: async (digits) => {
      assert.equal(digits, '15552345678');
      return 'PX108492';
    }
  };

  const res = await manager.requestPairingCode('(555) 234-5678');
  assert.equal(res.pairingPhone, '+15552345678');
  assert.equal(res.rawCode, 'PX108492');
  assert.equal(res.pairingCode, 'PX10-8492');
  assert.equal(res.status, 'pairing_code_ready');

  const status = manager.getStatus();
  assert.equal(status.pairingCode, 'PX10-8492');
  assert.equal(status.pairingPhone, '+15552345678');
  assert.equal(status.status, 'pairing_code_ready');
});

test('WhatsAppManager.requestPairingCode rejects invalid short phone numbers and falls back cleanly when socket handshake is pending', async () => {
  const manager = new WhatsAppManager();
  await assert.rejects(
    () => manager.requestPairingCode('12345'),
    /valid 10-digit Google Fi/i
  );

  // Simulate socket where requestPairingCode rejects due to pending handshake, but authState.creds.pairingCode was set
  manager.status = 'connecting';
  manager.sock = {
    authState: { creds: { pairingCode: 'ABCD1234' } },
    requestPairingCode: async () => {
      throw new Error('Handshake in progress');
    }
  };

  const res = await manager.requestPairingCode('555-987-6543');
  assert.equal(res.pairingPhone, '+15559876543');
  assert.equal(res.pairingCode, 'ABCD-1234');
  assert.equal(res.rawCode, 'ABCD1234');
});

test('WhatsAppManager.ingestExternalNotification registers Pixel 10 WhatsApp group and maintains rolling 8-message context window', async () => {
  const receivedCalls = [];
  const manager = new WhatsAppManager({
    onIncomingMessage: async (msg, contextMessages) => {
      receivedCalls.push({ msg, contextMessages });
    }
  });

  for (let i = 1; i <= 10; i++) {
    await manager.ingestExternalNotification({
      chatName: 'Phillips Family Pixel 10 Group',
      sender: `Member ${i}`,
      text: `Message number ${i} in the family group chat`,
      timestamp: `2026-11-08T10:0${i % 10}:00.000Z`
    });
  }

  assert.equal(receivedCalls.length, 10);
  // First message has 0 prior context messages
  assert.equal(receivedCalls[0].contextMessages.length, 0);
  // 10th message has capped 8-message rolling context window (messages 2..9)
  assert.equal(receivedCalls[9].contextMessages.length, 8);
  assert.equal(receivedCalls[9].contextMessages[0].sender, 'Member 2');
  assert.equal(receivedCalls[9].contextMessages[7].sender, 'Member 9');

  const knownChats = manager.getStatus().knownChats;
  assert.equal(knownChats.length, 1);
  assert.equal(knownChats[0].name, 'Phillips Family Pixel 10 Group');
  assert.equal(knownChats[0].isGroup, true);
});

test('WhatsAppManager.matchesWatchedChat and extractMessageText handle all WhatsApp message types and filters', () => {
  const manager = new WhatsAppManager();

  // Wildcard watches everything
  assert.equal(manager.matchesWatchedChat('123@g.us', 'Any Group', ['*']), true);
  assert.equal(manager.matchesWatchedChat('123@g.us', 'Any Group', []), true);

  // Specific group name or JID matching
  assert.equal(
    manager.matchesWatchedChat('999@g.us', 'Phillips Family Group', ['Soccer', 'phillips family']),
    true
  );
  assert.equal(
    manager.matchesWatchedChat('999@g.us', 'Work Standup', ['Soccer', 'phillips family']),
    false
  );

  // Extract message text across all Baileys message shapes
  assert.equal(
    manager.extractMessageText({ message: { conversation: '  Plain text event  ' } }),
    'Plain text event'
  );
  assert.equal(
    manager.extractMessageText({
      message: { extendedTextMessage: { text: 'Extended reply text' } }
    }),
    'Extended reply text'
  );
  assert.equal(
    manager.extractMessageText({
      message: { imageMessage: { caption: 'Flyer for Sunday BBQ at 1pm' } }
    }),
    'Flyer for Sunday BBQ at 1pm'
  );
  assert.equal(
    manager.extractMessageText({
      message: {
        ephemeralMessage: {
          message: { extendedTextMessage: { text: 'Disappearing group event message' } }
        }
      }
    }),
    'Disappearing group event message'
  );
  assert.equal(manager.extractMessageText(null), '');
});

test(
  'POST /api/whatsapp/pair-code generates same-phone pairing code via REST API and validates missing phone input',
  withIsolatedStore(async () => {
    saveConfig({ notifyPhoneNumber: '' });
    // Prevent real Baileys WebSocket connection during API test
    const origConnect = whatsappManager.connect;
    whatsappManager.connect = async function () {
      this.status = 'connecting';
      return this.getStatus();
    };

    const server = app.listen(0);
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;

      // Missing phone number when none is configured returns 400
      const badRes = await fetch(`${baseUrl}/api/whatsapp/pair-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: '' })
      });
      assert.equal(badRes.status, 400);

      // Valid 10-digit Pixel 10 Google Fi phone number returns 8-char formatted code
      const okRes = await fetch(`${baseUrl}/api/whatsapp/pair-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: '555-345-6789' })
      });
      assert.equal(okRes.status, 200);
      const data = await okRes.json();
      assert.equal(data.pairingPhone, '+15553456789');
      assert.match(data.pairingCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      assert.equal(data.status, 'pairing_code_ready');
    } finally {
      whatsappManager.connect = origConnect;
      server.close();
    }
  })
);

test(
  'POST /api/pixel10/notification validates payload and extracts talked-about events from on-device listener',
  withIsolatedStore(async () => {
    saveConfig({ autoNotify: false, watchedChats: ['*'] });
    saveEvents([]);

    const server = app.listen(0);
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;

      // Empty text returns 400
      const emptyRes = await fetch(`${baseUrl}/api/pixel10/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatName: 'Test Chat', sender: 'Dave', text: '   ' })
      });
      assert.equal(emptyRes.status, 400);

      // Valid event notification is extracted and stored
      const validRes = await fetch(`${baseUrl}/api/pixel10/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatName: 'Phillips Family Pixel 10',
          sender: 'Aunt Clara',
          text: "Reminder: Thanksgiving Family Dinner at Grandma's House on Thursday at 5:30 PM!",
          deviceModel: 'Google Pixel 10'
        })
      });
      assert.equal(validRes.status, 200);
      const body = await validRes.json();
      assert.equal(body.success, true);
      assert.equal(body.detectedCount, 1);
      assert.equal(body.detectedEvents[0].chatName, 'Phillips Family Pixel 10');
      assert.equal(body.detectedEvents[0].sender, 'Aunt Clara');
      assert.match(body.detectedEvents[0].title, /Thanksgiving Family Dinner/i);
    } finally {
      server.close();
    }
  })
);

test(
  'GET /api/events/:id/ics exports RFC 5545 iCalendar event with Google Pixel 10 PRODID and returns 404 for unknown ID',
  withIsolatedStore(async () => {
    saveEvents([
      {
        id: 'evt_pixel10_cal_test',
        fingerprint: 'fp_cal_test',
        title: 'Pixel 10 Launch Watch Party',
        dateText: 'Fri, Nov 13, 2026, 7:00 PM',
        startDate: '2026-11-13T19:00:00.000Z',
        endDate: '2026-11-13T21:00:00.000Z',
        location: 'Mountain View Campus',
        category: 'social',
        summary: 'Join us for the Pixel 10 Watch Party at Mountain View Campus',
        chatName: 'Pixel Enthusiasts',
        sender: 'David'
      }
    ]);

    const server = app.listen(0);
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;

      const missingRes = await fetch(`${baseUrl}/api/events/nonexistent_id/ics`);
      assert.equal(missingRes.status, 404);

      const icsRes = await fetch(`${baseUrl}/api/events/evt_pixel10_cal_test/ics`);
      assert.equal(icsRes.status, 200);
      assert.match(icsRes.headers.get('content-type') || '', /text\/calendar/);
      const ics = await icsRes.text();
      assert.match(ics, /PRODID:-\/\/Phillips WhatsApp Notifier\/\/Google Pixel 10\/\/EN/);
      assert.match(ics, /UID:evt_pixel10_cal_test@phillips-whatsapp-notifier\.pixel10/);
      assert.match(ics, /SUMMARY:Pixel 10 Launch Watch Party/);
      assert.match(ics, /LOCATION:Mountain View Campus/);
      assert.match(ics, /DTSTART:20261113T190000Z/);
      assert.match(ics, /DTEND:20261113T210000Z/);
    } finally {
      server.close();
    }
  })
);

test(
  'POST /api/config and GET /api/status persist Pixel 10 settings and preserve masked API keys',
  withIsolatedStore(async () => {
    saveConfig({
      geminiApiKey: 'AIzaSySecretKey123456',
      textbeltApiKey: 'tb_live_secret_987654'
    });

    const server = app.listen(0);
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;

      const postRes = await fetch(`${baseUrl}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifyPhoneNumber: '555-888-9999',
          deviceProfile: 'pixel_10',
          pixelOledDark: true,
          pixelNotificationListener: false,
          // Send back masked keys to verify they do not overwrite real stored keys
          geminiApiKey: 'AIza••••3456',
          textbeltApiKey: 'tb_l••••7654'
        })
      });
      assert.equal(postRes.status, 200);
      const pubCfg = await postRes.json();
      assert.equal(pubCfg.notifyPhoneNumber, '555-888-9999');
      assert.equal(pubCfg.deviceProfile, 'pixel_10');
      assert.equal(pubCfg.pixelOledDark, true);
      assert.equal(pubCfg.pixelNotificationListener, false);

      // Underlying stored secret keys must still be intact
      const rawCfg = loadConfig();
      assert.equal(rawCfg.geminiApiKey, 'AIzaSySecretKey123456');
      assert.equal(rawCfg.textbeltApiKey, 'tb_live_secret_987654');

      // GET /api/status includes apk metadata and config
      const statusRes = await fetch(`${baseUrl}/api/status`);
      assert.equal(statusRes.status, 200);
      const statusData = await statusRes.json();
      assert.ok(statusData.apk);
      assert.equal(statusData.apk.packageName, 'com.phillips.whatsappnotifier.pixel10');
      assert.equal(statusData.config.deviceProfile, 'pixel_10');
    } finally {
      server.close();
    }
  })
);

test('Express CORS middleware allows Pixel 10 WebView file:// origin and X-Device-Model header on OPTIONS preflight', async () => {
  const server = app.listen(0);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(`${baseUrl}/api/status`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'file://',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-Device-Model'
      }
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(res.headers.get('access-control-allow-headers') || '', /X-Device-Model/);
  } finally {
    server.close();
  }
});

test('Compiled Phillips-WhatsApp-Notifier-Pixel10.apk contains valid AndroidManifest.xml, classes.dex, bundled assets, and APK Signature Block', () => {
  const meta = getApkMetadata();
  const apkPath = path.join(ROOT_DIR, 'Phillips-WhatsApp-Notifier-Pixel10.apk');
  const publicApkPath = path.join(ROOT_DIR, 'public', 'phillips-whatsapp-notifier-pixel10.apk');

  assert.equal(fs.existsSync(apkPath), true);
  assert.equal(fs.existsSync(publicApkPath), true);
  assert.equal(fs.statSync(apkPath).size, meta.sizeBytes);
  assert.equal(fs.statSync(publicApkPath).size, meta.sizeBytes);

  // Inspect ZIP table of contents inside the compiled APK using unzip -l
  const zipListing = execFileSync('unzip', ['-l', apkPath], { encoding: 'utf8' });
  assert.match(zipListing, /AndroidManifest\.xml/);
  assert.match(zipListing, /classes\.dex/);
  assert.match(zipListing, /resources\.arsc/);
  assert.match(zipListing, /assets\/public\/index\.html/);
  assert.match(zipListing, /assets\/public\/app\.js/);
  assert.match(zipListing, /assets\/public\/styles\.css/);
  assert.match(zipListing, /assets\/public\/manifest\.json/);
  assert.match(zipListing, /res\/drawable\/ic_launcher\.xml/);

  // Verify APK Signature Scheme v2/v3 magic string ("APK Sig Block 42") inside the binary
  const rawBytes = fs.readFileSync(apkPath);
  assert.equal(rawBytes.includes(Buffer.from('APK Sig Block 42')), true);
});

test('Native Android Pixel 10 Java sources implement 120Hz Smooth Display, Share Sheet ACTION_SEND receiver, SmsManager, Calendar intent, and WhatsAppNotificationService', () => {
  const manifestXml = fs.readFileSync(path.join(ROOT_DIR, 'android', 'AndroidManifest.xml'), 'utf8');
  assert.match(manifestXml, /package="com\.phillips\.whatsappnotifier\.pixel10"/);
  assert.match(manifestXml, /android:permission="android\.permission\.BIND_NOTIFICATION_LISTENER_SERVICE"/);
  assert.match(manifestXml, /android\.intent\.action\.SEND/);

  const mainActivityJava = fs.readFileSync(
    path.join(
      ROOT_DIR,
      'android/src/com/phillips/whatsappnotifier/pixel10/MainActivity.java'
    ),
    'utf8'
  );
  assert.match(mainActivityJava, /preferredRefreshRate\s*=\s*120\.0f/);
  assert.match(mainActivityJava, /LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES/);
  assert.match(mainActivityJava, /addJavascriptInterface\(new Pixel10Bridge/);
  assert.match(mainActivityJava, /onPixel10SharedChatText/);
  assert.match(mainActivityJava, /onPixel10WhatsAppNotification/);

  const bridgeJava = fs.readFileSync(
    path.join(
      ROOT_DIR,
      'android/src/com/phillips/whatsappnotifier/pixel10/Pixel10Bridge.java'
    ),
    'utf8'
  );
  assert.match(bridgeJava, /sendMultipartTextMessage/);
  assert.match(bridgeJava, /CalendarContract\.Events\.CONTENT_URI/);
  assert.match(bridgeJava, /ACTION_NOTIFICATION_LISTENER_SETTINGS/);

  const listenerJava = fs.readFileSync(
    path.join(
      ROOT_DIR,
      'android/src/com/phillips/whatsappnotifier/pixel10/WhatsAppNotificationService.java'
    ),
    'utf8'
  );
  assert.match(listenerJava, /"com\.whatsapp"/);
  assert.match(listenerJava, /"com\.whatsapp\.w4b"/);
  assert.match(listenerJava, /MainActivity\.deliverWhatsAppNotification/);
});

test('Frontend Pixel 10 UI assets include Actua OLED theme, 412x915 frame, bottom nav, and standalone engine', () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, 'public/index.html'), 'utf8');
  assert.match(html, /data-device="pixel-10"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /id="btn-download-apk"/);
  assert.match(html, /id="btn-wa-pair-code"/);
  assert.match(html, /id="btn-simulate-pixel-notif"/);
  assert.match(html, /id="pixel-bottom-nav"/);

  const css = fs.readFileSync(path.join(ROOT_DIR, 'public/styles.css'), 'utf8');
  assert.match(css, /body\.oled-dark/);
  assert.match(css, /body\.pixel10-frame-mode/);
  assert.match(css, /safe-area-inset-bottom/);

  const appJs = fs.readFileSync(path.join(ROOT_DIR, 'public/app.js'), 'utf8');
  assert.match(appJs, /onPixel10WhatsAppNotification/);
  assert.match(appJs, /onPixel10SharedChatText/);
  assert.match(appJs, /detectEventClientSide/);
  assert.match(appJs, /buildGoogleCalendarUrl/);
});
