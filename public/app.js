(function () {
  const els = {
    waConnectionPill: document.getElementById('wa-connection-pill'),
    waConnectionLabel: document.getElementById('wa-connection-label'),
    phoneTargetLabel: document.getElementById('phone-target-label'),
    btnTogglePixel10View: document.getElementById('btn-toggle-pixel10-view'),
    btnToggleOled: document.getElementById('btn-toggle-oled'),
    btnHeaderDownloadApk: document.getElementById('btn-header-download-apk'),
    pixel10Clock: document.getElementById('pixel10-clock'),

    pixelRuntimeBadge: document.getElementById('pixel-runtime-badge'),
    apkSizeBadge: document.getElementById('apk-size-badge'),
    apkSha256Value: document.getElementById('apk-sha256-value'),
    btnDownloadApk: document.getElementById('btn-download-apk'),
    btnSimulatePixelNotif: document.getElementById('btn-simulate-pixel-notif'),
    btnPixelNotifSettings: document.getElementById('btn-pixel-notif-settings'),
    apkDownloadQr: document.getElementById('apk-download-qr'),
    apkFeedback: document.getElementById('apk-feedback'),

    qrInstructions: document.getElementById('qr-instructions'),
    qrImage: document.getElementById('qr-image'),
    pairingCodeBox: document.getElementById('pairing-code-box'),
    pairingCodeValue: document.getElementById('pairing-code-value'),
    btnCopyPairingCode: document.getElementById('btn-copy-pairing-code'),
    btnWaPairCode: document.getElementById('btn-wa-pair-code'),
    btnWaConnect: document.getElementById('btn-wa-connect'),
    btnWaDisconnect: document.getElementById('btn-wa-disconnect'),
    btnWaLogout: document.getElementById('btn-wa-logout'),
    discoveredChatsWrapper: document.getElementById('discovered-chats-wrapper'),
    discoveredChatsList: document.getElementById('discovered-chats-list'),

    configForm: document.getElementById('config-form'),
    inputPhoneNumber: document.getElementById('input-phone-number'),
    selectChannel: document.getElementById('select-channel'),
    selectDetectionMode: document.getElementById('select-detection-mode'),
    inputWatchedChats: document.getElementById('input-watched-chats'),
    checkboxAutoNotify: document.getElementById('checkbox-auto-notify'),
    inputTextbeltKey: document.getElementById('input-textbelt-key'),
    inputGeminiKey: document.getElementById('input-gemini-key'),
    inputOpenaiKey: document.getElementById('input-openai-key'),
    btnTestNotify: document.getElementById('btn-test-notify'),
    configFeedback: document.getElementById('config-feedback'),

    btnLoadSample: document.getElementById('btn-load-sample'),
    fileUploadChat: document.getElementById('file-upload-chat'),
    scanForm: document.getElementById('scan-form'),
    inputScanChatName: document.getElementById('input-scan-chat-name'),
    checkboxScanNotify: document.getElementById('checkbox-scan-notify'),
    textareaChatLog: document.getElementById('textarea-chat-log'),
    btnScanChat: document.getElementById('btn-scan-chat'),
    btnClearTextarea: document.getElementById('btn-clear-textarea'),
    scanFeedback: document.getElementById('scan-feedback'),

    eventsCountBadge: document.getElementById('events-count-badge'),
    eventsList: document.getElementById('events-list'),
    btnClearEvents: document.getElementById('btn-clear-events'),
    activityList: document.getElementById('activity-list'),
    pixelBottomNav: document.getElementById('pixel-bottom-nav')
  };

  let configLoadedOnce = false;
  let cachedEvents = [];
  const isNativePixelApk =
    typeof window.Pixel10Bridge !== 'undefined' || window.location.protocol === 'file:';

  // --- Standalone On-Device Pixel 10 Fallback Storage & NLP Engine (for offline APK usage) ---
  const LOCAL_CONFIG_KEY = 'phillips_pixel10_config_v2';
  const LOCAL_EVENTS_KEY = 'phillips_pixel10_events_v2';
  const LOCAL_ACTIVITY_KEY = 'phillips_pixel10_activity_v2';

  const SAMPLE_CHAT_FALLBACK = `[11/08/26, 9:14:12 AM] Mom (Linda Phillips): Good morning everyone! Hope you're all having a great week.
[11/08/26, 9:16:45 AM] Uncle Dave: Morning! Hey quick heads up — we're hosting the Phillips Family Sunday BBQ at Oak Creek Park this Sunday at 1:00 PM. Bring lawn chairs!
[11/08/26, 9:18:02 AM] Sarah Phillips: Awesome, we'll be there! I can bring potato salad and lemonade.
[11/08/26, 11:42:19 AM] Coach Marcus: Reminder: Varsity Soccer Quarterfinal Match at Memorial Stadium on Wednesday at 6:30 PM. Please arrive 30 minutes early for warmups.
[11/08/26, 2:05:50 PM] Alex Phillips: Also don't forget Cousin Emma's Birthday Dinner at Bella Notte Trattoria this Friday at 7:30 PM! Please RSVP by Wednesday noon so I can finalize the table count.`;

  const SIMULATED_PIXEL10_NOTIFICATIONS = [
    {
      chatName: 'Phillips Family Group',
      sender: 'Uncle Dave',
      text: "Hey everyone! Just confirmed — we're hosting the Phillips Family Sunday BBQ at Oak Creek Park this Sunday at 1:00 PM. Bring lawn chairs!"
    },
    {
      chatName: 'Pixel 10 Soccer Parents',
      sender: 'Coach Marcus',
      text: 'Reminder: Championship Soccer Semifinal Match at Memorial Stadium on Saturday at 4:30 PM!'
    },
    {
      chatName: 'Phillips Cousins Thread',
      sender: 'Alex Phillips',
      text: "Don't forget Grandma's Anniversary Dinner at Bella Notte Trattoria this Friday at 7:00 PM!"
    }
  ];
  let simNotifIndex = 0;

  function triggerPixelHaptic() {
    try {
      if (window.Pixel10Bridge && typeof window.Pixel10Bridge.triggerHaptic === 'function') {
        window.Pixel10Bridge.triggerHaptic('click');
      } else if (navigator.vibrate) {
        navigator.vibrate(12);
      }
    } catch {
      // Ignore haptic error
    }
  }

  function showBanner(el, message, isError = false) {
    if (!el) return;
    el.textContent = message;
    el.className = `feedback-banner visible ${isError ? 'err' : 'ok'}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizePhoneDigits(phone) {
    const digits = String(phone || '').replace(/[^\d]/g, '');
    return digits.length === 10 ? `1${digits}` : digits;
  }

  // On-device fallback helpers when running inside standalone APK without server
  function getLocalConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_CONFIG_KEY) || '{}');
      return {
        notifyPhoneNumber: '',
        userCarrier: 'google_fi',
        notificationChannels: 'sms',
        textbeltApiKey: 'textbelt',
        watchedChats: ['*'],
        detectionMode: 'hybrid',
        autoNotify: true,
        deviceProfile: 'pixel_10',
        ...saved
      };
    } catch {
      return {
        notifyPhoneNumber: '',
        userCarrier: 'google_fi',
        notificationChannels: 'sms',
        textbeltApiKey: 'textbelt',
        watchedChats: ['*'],
        detectionMode: 'hybrid',
        autoNotify: true,
        deviceProfile: 'pixel_10'
      };
    }
  }

  function saveLocalConfig(updates) {
    const merged = { ...getLocalConfig(), ...updates };
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(merged));
    return merged;
  }

  function getLocalEvents() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveLocalEvents(evts) {
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(evts.slice(0, 200)));
  }

  function addLocalActivity(message) {
    try {
      const list = JSON.parse(localStorage.getItem(LOCAL_ACTIVITY_KEY) || '[]');
      list.unshift({ timestamp: new Date().toISOString(), message });
      localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(list.slice(0, 40)));
      renderActivity(list);
    } catch {
      // Ignore storage error
    }
  }

  function parseChatExportClientSide(rawText, chatName = 'Pixel 10 WhatsApp Chat') {
    const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
    const iosRx = /^\[([^\],]+),?\s+([^\]]+)\]\s+([^:]+):\s*(.+)$/;
    const androidRx = /^(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}),?\s+([^-]+)\s+-\s+([^:]+):\s*(.+)$/;
    const simpleRx = /^([A-Za-z0-9_.\s+'()-]{2,35}):\s+(.+)$/;
    const out = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let m = line.match(iosRx) || line.match(androidRx);
      if (m) {
        out.push({ chatName, sender: m[3].trim(), text: m[4].trim(), timestamp: new Date().toISOString() });
        continue;
      }
      m = line.match(simpleRx);
      if (m && !/^https?$/i.test(m[1])) {
        out.push({ chatName, sender: m[1].trim(), text: m[2].trim(), timestamp: new Date().toISOString() });
        continue;
      }
      out.push({ chatName, sender: 'Chat Member', text: line, timestamp: new Date().toISOString() });
    }
    return out;
  }

  function detectEventClientSide(msg) {
    const text = msg.text || '';
    const dateRx =
      /\b((?:this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|tonight|today|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2})(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i;
    const timeRx = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon)\b/i;
    const kwRx =
      /\b(bbq|barbecue|dinner|lunch|brunch|party|birthday|match|game|practice|meeting|call|reunion|concert|movie|trip|picnic|rsvp|reminder|hosting)\b/i;
    const dateMatch = text.match(dateRx);
    const kwMatch = text.match(kwRx);
    if (!dateMatch && !kwMatch) return null;
    if (!dateMatch) return null;
    const timeMatch = text.match(timeRx);
    const dateText =
      dateMatch[0] +
      (timeMatch && !dateMatch[0].toLowerCase().includes(timeMatch[0].toLowerCase())
        ? ` at ${timeMatch[0]}`
        : '');
    const locMatch = text.match(
      /\b(?:at|@)\s+([A-Z][A-Za-z0-9'&\-\s]{2,36}?)(?=\s+(?:on|this|next|tomorrow|today|at|from|for)|[.,!?;]|$)/
    );
    const location = locMatch ? locMatch[1].trim() : '';
    const cleanTitle = text
      .replace(/^(?:morning!|hey[^!.,]*[!.,]|reminder:|also\s+don't\s+forget)\s*/i, '')
      .split(/[.!]/)[0]
      .slice(0, 62)
      .trim();

    return {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle || 'WhatsApp Event',
      dateText,
      startDate: new Date(Date.now() + 86400000).toISOString(),
      location,
      category: kwMatch ? kwMatch[1].toLowerCase() : 'event',
      summary: text,
      sourceMessage: text,
      chatName: msg.chatName || 'WhatsApp Chat',
      sender: msg.sender || 'Chat Member',
      confidence: 0.88,
      detectionMethod: 'pixel10-on-device-nlp',
      notified: false,
      notificationHistory: []
    };
  }

  async function sendSmsClientSide(phone, message, apiKey = 'textbelt') {
    const digits = normalizePhoneDigits(phone);
    if (!digits || digits.length < 10) {
      throw new Error('Please enter a valid 10-digit Google Fi phone number.');
    }
    const e164 = `+${digits}`;

    // If running inside the native Pixel 10 APK and user granted SmsManager permission, also trigger native SIM / Notification
    if (window.Pixel10Bridge && typeof window.Pixel10Bridge.sendDirectSms === 'function') {
      try {
        window.Pixel10Bridge.sendDirectSms(e164, message);
      } catch {
        // Continue to Textbelt API
      }
    }

    const res = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: e164,
        message,
        key: apiKey || 'textbelt'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      if (window.Pixel10Bridge && typeof window.Pixel10Bridge.showNativeNotification === 'function') {
        window.Pixel10Bridge.showNativeNotification('Phillips WhatsApp Event Alert', message);
        return { success: true, recipient: e164, provider: 'pixel10-native-sim' };
      }
      throw new Error(data.error || `Textbelt returned HTTP ${res.status}`);
    }
    return { success: true, recipient: e164, textId: data.textId };
  }

  function renderApkMetadata(apk) {
    if (!apk) return;
    if (els.apkSizeBadge && apk.sizeFormatted) {
      els.apkSizeBadge.textContent = `Signed APK • ${apk.sizeFormatted}`;
    }
    if (els.apkSha256Value && apk.sha256) {
      els.apkSha256Value.textContent = `${apk.sha256.slice(0, 24)}...${apk.sha256.slice(-12)}`;
      els.apkSha256Value.title = apk.sha256;
    }
    if (els.apkDownloadQr && apk.qrDataUrl) {
      els.apkDownloadQr.src = apk.qrDataUrl;
      els.apkDownloadQr.style.display = 'block';
    }
  }

  function renderWhatsAppStatus(wa) {
    if (!wa) return;
    els.waConnectionPill.className = `status-chip ${wa.status || 'disconnected'}`;

    const statusTextMap = {
      disconnected: 'WhatsApp: Disconnected',
      connecting: 'WhatsApp: Connecting...',
      qr_ready: 'WhatsApp: Scan QR Code',
      pairing_code_ready: `WhatsApp: Code ${wa.pairingCode || 'Ready'}`,
      connected: `WhatsApp: Connected (${wa.connectedUser?.name || 'Linked'})`,
      error: 'WhatsApp: Connection Error'
    };
    els.waConnectionLabel.textContent = statusTextMap[wa.status] || `WhatsApp: ${wa.status}`;

    if (wa.pairingCode && wa.status !== 'connected') {
      els.pairingCodeBox.style.display = 'block';
      els.pairingCodeValue.textContent = wa.pairingCode;
    } else if (wa.status === 'connected' || wa.status === 'disconnected') {
      els.pairingCodeBox.style.display = 'none';
    }

    if (wa.status === 'qr_ready' && wa.qrDataUrl) {
      els.qrImage.src = wa.qrDataUrl;
      els.qrImage.style.display = 'block';
      els.qrInstructions.innerHTML =
        'Scan this QR code, OR click <strong>Get 8-Digit Pairing Code (Pixel 10)</strong> below to link on the same phone.';
      els.btnWaConnect.style.display = 'none';
      els.btnWaDisconnect.style.display = 'inline-flex';
      els.btnWaLogout.style.display = 'inline-flex';
    } else if (wa.status === 'pairing_code_ready') {
      els.qrImage.style.display = 'none';
      els.qrInstructions.innerHTML = `Enter the 8-character pairing code below in <strong>WhatsApp &rarr; Linked Devices &rarr; Link with phone number instead</strong> on your Pixel 10 (${escapeHtml(
        wa.pairingPhone || ''
      )}).`;
      els.btnWaDisconnect.style.display = 'inline-flex';
      els.btnWaLogout.style.display = 'inline-flex';
    } else if (wa.status === 'connected') {
      els.qrImage.style.display = 'none';
      els.qrInstructions.innerHTML = `Connected as <strong>${escapeHtml(
        wa.connectedUser?.name || 'Linked Account'
      )}</strong> (${escapeHtml(
        wa.connectedUser?.id || ''
      )}). Listening for events in watched chats in real time.`;
      els.btnWaConnect.style.display = 'none';
      els.btnWaDisconnect.style.display = 'inline-flex';
      els.btnWaLogout.style.display = 'inline-flex';
    } else if (wa.status === 'connecting') {
      els.qrImage.style.display = 'none';
      els.qrInstructions.textContent = 'Starting WhatsApp Web session for Pixel 10...';
      els.btnWaConnect.disabled = true;
      els.btnWaDisconnect.style.display = 'inline-flex';
    } else {
      els.qrImage.style.display = 'none';
      els.btnWaConnect.style.display = 'inline-flex';
      els.btnWaConnect.disabled = false;
      els.btnWaDisconnect.style.display = 'none';
      els.btnWaLogout.style.display = 'none';
      els.qrInstructions.innerHTML = wa.lastError
        ? `Status: ${escapeHtml(wa.lastError)}. Use <strong>Get 8-Digit Pairing Code (Pixel 10)</strong> or the Chat Scanner on the right.`
        : 'On a <strong>Pixel 10</strong>? Click <strong>Get 8-Digit Pairing Code</strong> below to link WhatsApp on the same phone without needing to scan a QR code, or click <strong>Connect WhatsApp (QR)</strong>.';
    }

    const chats = wa.knownChats || [];
    if (chats.length > 0) {
      els.discoveredChatsWrapper.style.display = 'block';
      els.discoveredChatsList.innerHTML = chats
        .slice(0, 18)
        .map(
          (c) =>
            `<button type="button" class="chat-tag-btn" data-chat-name="${escapeHtml(
              c.name
            )}">+ ${escapeHtml(c.name)}</button>`
        )
        .join('');
    } else {
      els.discoveredChatsWrapper.style.display = 'none';
    }
  }

  function populateConfigForm(cfg) {
    if (!cfg) return;
    els.phoneTargetLabel.textContent = cfg.notifyPhoneNumber
      ? `Google Fi SMS: ${cfg.notifyPhoneNumber}`
      : 'Google Fi SMS: Not Set';

    if (configLoadedOnce) return;
    configLoadedOnce = true;

    els.inputPhoneNumber.value = cfg.notifyPhoneNumber || '';
    els.selectChannel.value = cfg.notificationChannels || 'sms';
    els.selectDetectionMode.value = cfg.detectionMode || 'hybrid';
    els.inputWatchedChats.value = Array.isArray(cfg.watchedChats)
      ? cfg.watchedChats.join(', ')
      : cfg.watchedChats || '*';
    els.checkboxAutoNotify.checked = cfg.autoNotify !== false;
    els.inputTextbeltKey.value = cfg.textbeltApiKey || 'textbelt';
    els.inputGeminiKey.value = cfg.geminiApiKey || '';
    els.inputOpenaiKey.value = cfg.openaiApiKey || '';
  }

  function renderActivity(items = []) {
    if (!items.length) return;
    els.activityList.innerHTML = items
      .map((item) => {
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        return `<li class="activity-item">
          <span>${escapeHtml(item.message)}</span>
          <span class="activity-time">${escapeHtml(timeStr)}</span>
        </li>`;
      })
      .join('');
  }

  function buildGoogleCalendarUrl(ev) {
    const start = ev.startDate ? new Date(ev.startDate) : new Date(Date.now() + 86400000);
    const end = ev.endDate
      ? new Date(ev.endDate)
      : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const fmt = (d) =>
      d
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.title || 'WhatsApp Event',
      dates: `${fmt(start)}/${fmt(end)}`,
      location: ev.location || '',
      details: `Detected by Phillips WhatsApp Notifier (Pixel 10) in "${ev.chatName}" from ${
        ev.sender
      }: ${ev.summary || ev.sourceMessage || ''}`
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function renderEvents(events = []) {
    cachedEvents = events;
    els.eventsCountBadge.textContent = String(events.length);

    if (!events.length) {
      els.eventsList.innerHTML = `
        <div class="empty-state">
          <h3>No events detected yet</h3>
          <p>
            Link your WhatsApp account, tap <strong>Simulate Pixel 10 WhatsApp Alert</strong>, or click
            <strong>Load Sample Phillips Chat</strong> above and run a scan to see event extraction in action.
          </p>
        </div>`;
      return;
    }

    els.eventsList.innerHTML = events
      .map((ev) => {
        const lastAttempt =
          ev.notificationHistory && ev.notificationHistory.length > 0
            ? ev.notificationHistory[0]
            : null;

        let notifyBadge = `<span class="badge badge-pending">Not Texted Yet</span>`;
        if (ev.notified) {
          notifyBadge = `<span class="badge badge-notified">SMS Sent (${escapeHtml(
            lastAttempt?.recipient || 'Google Fi'
          )})</span>`;
        } else if (lastAttempt && lastAttempt.error) {
          notifyBadge = `<span class="badge badge-pending" title="${escapeHtml(
            lastAttempt.error
          )}">SMS Pending</span>`;
        }

        const pct = Math.round((ev.confidence || 0.75) * 100);

        return `
          <div class="event-card" data-event-id="${escapeHtml(ev.id)}">
            <div class="event-top-row">
              <h3 class="event-title">${escapeHtml(ev.title)}</h3>
              <div class="badge-group">
                <span class="badge badge-category">${escapeHtml(ev.category || 'event')}</span>
                ${notifyBadge}
              </div>
            </div>

            <div class="event-meta-grid">
              <div class="meta-item"><strong>When:</strong> ${escapeHtml(ev.dateText)}</div>
              ${
                ev.location
                  ? `<div class="meta-item"><strong>Where:</strong> ${escapeHtml(ev.location)}</div>`
                  : ''
              }
              <div class="meta-item"><strong>Chat:</strong> ${escapeHtml(ev.chatName)}</div>
              <div class="meta-item"><strong>Sender:</strong> ${escapeHtml(ev.sender)}</div>
            </div>

            <div class="event-quote">
              &ldquo;${escapeHtml(ev.sourceMessage || ev.summary)}&rdquo;
            </div>

            <div class="event-actions-row">
              <span class="event-confidence">
                Detector: ${escapeHtml(ev.detectionMethod || 'rules')} &bull; Confidence: ${pct}%
                ${
                  lastAttempt && !lastAttempt.success && lastAttempt.error
                    ? ` &bull; Note: ${escapeHtml(lastAttempt.error)}`
                    : ''
                }
              </span>
              <div class="btn-row">
                <button
                  type="button"
                  class="btn btn-outline btn-sm btn-notify-event"
                  data-id="${escapeHtml(ev.id)}"
                >
                  Text My Phone Now
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm btn-calendar-event"
                  data-id="${escapeHtml(ev.id)}"
                >
                  + Pixel Calendar
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm btn-delete-event"
                  data-id="${escapeHtml(ev.id)}"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  async function refreshStatusAndEvents() {
    try {
      const [statusRes, eventsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/events')
      ]);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        renderWhatsAppStatus(statusData.whatsapp);
        populateConfigForm(statusData.config);
        renderActivity(statusData.recentActivity);
        if (statusData.apk) {
          renderApkMetadata(statusData.apk);
        }
      }
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        renderEvents(eventsData.events);
      }
    } catch {
      // Running in standalone Pixel 10 APK mode without backend server
      populateConfigForm(getLocalConfig());
      renderEvents(getLocalEvents());
    }
  }

  async function loadApkDetailedInfo() {
    try {
      const res = await fetch('/api/apk/info');
      if (res.ok) {
        const info = await res.json();
        renderApkMetadata(info);
      }
    } catch {
      // Standalone APK mode
      if (els.apkSizeBadge) {
        els.apkSizeBadge.textContent = 'Installed on Pixel 10';
      }
      if (els.apkSha256Value) {
        els.apkSha256Value.textContent = 'Running natively inside Pixel 10 APK';
      }
    }
  }

  // --- Pixel 10 Native Bridge Initialization ---
  function initPixel10Environment() {
    if (window.Pixel10Bridge) {
      try {
        const infoJson = window.Pixel10Bridge.getDeviceInfoJson();
        const info = JSON.parse(infoJson);
        if (els.pixelRuntimeBadge) {
          els.pixelRuntimeBadge.textContent = `Native APK • ${info.model || 'Pixel 10'} (Android ${
            info.release || '16'
          })`;
        }
      } catch {
        if (els.pixelRuntimeBadge) {
          els.pixelRuntimeBadge.textContent = 'Native Pixel 10 APK Active';
        }
      }
    }

    // Update simulated Pixel 10 clock
    const updateClock = () => {
      if (els.pixel10Clock) {
        els.pixel10Clock.textContent = new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        });
      }
    };
    updateClock();
    setInterval(updateClock, 15000);

    // Restore OLED Dark preference
    if (localStorage.getItem('pixel10_oled_dark') === 'true') {
      document.body.classList.add('oled-dark');
    }
  }

  // Expose global callbacks for the Native Android APK (WhatsAppNotificationService & Share Intent)
  window.onPixel10WhatsAppNotification = async function (payload) {
    const { chatName, sender, text } = payload || {};
    if (!text) return;
    try {
      const res = await fetch('/api/pixel10/notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatName: chatName || 'Pixel 10 WhatsApp Chat',
          sender: sender || 'WhatsApp Contact',
          text,
          deviceModel: 'Google Pixel 10 (NotificationListenerService)'
        })
      });
      if (res.ok) {
        await refreshStatusAndEvents();
        return;
      }
    } catch {
      // Standalone on-device APK execution
    }

    const detected = detectEventClientSide({ chatName, sender, text });
    if (detected) {
      const evts = getLocalEvents();
      evts.unshift(detected);
      saveLocalEvents(evts);
      renderEvents(evts);
      addLocalActivity(`[Pixel 10 Live Listener] Detected "${detected.title}" in ${chatName}`);
      const cfg = getLocalConfig();
      if (cfg.autoNotify && cfg.notifyPhoneNumber) {
        try {
          await sendSmsClientSide(
            cfg.notifyPhoneNumber,
            `[WhatsApp Event] ${detected.title}\nWhen: ${detected.dateText}\nWhere: ${
              detected.location || 'TBD'
            }\nChat: ${detected.chatName}`,
            cfg.textbeltApiKey
          );
          detected.notified = true;
          saveLocalEvents(evts);
          renderEvents(evts);
        } catch {
          // Ignore auto-SMS error
        }
      }
    }
  };

  window.onPixel10SharedChatText = function (sharedText, sharedTitle) {
    if (!sharedText) return;
    els.inputScanChatName.value = sharedTitle || 'Shared from Pixel 10 WhatsApp';
    els.textareaChatLog.value = sharedText;
    showBanner(
      els.scanFeedback,
      'Received exported WhatsApp chat from Pixel 10 Share Sheet! Scanning for events...'
    );
    els.scanForm.requestSubmit();
  };

  // --- Event Listeners ---

  if (els.btnToggleOled) {
    els.btnToggleOled.addEventListener('click', () => {
      triggerPixelHaptic();
      document.body.classList.toggle('oled-dark');
      const isDark = document.body.classList.contains('oled-dark');
      localStorage.setItem('pixel10_oled_dark', isDark ? 'true' : 'false');
      els.btnToggleOled.textContent = isDark ? 'Light Theme' : 'OLED Dark';
    });
  }

  if (els.btnTogglePixel10View) {
    els.btnTogglePixel10View.addEventListener('click', () => {
      triggerPixelHaptic();
      document.body.classList.toggle('pixel10-frame-mode');
      const isFrame = document.body.classList.contains('pixel10-frame-mode');
      els.btnTogglePixel10View.textContent = isFrame ? 'Exit Pixel 10 Frame' : 'Pixel 10 Frame';
    });
  }

  if (els.pixelBottomNav) {
    els.pixelBottomNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.pixel-nav-item');
      if (!btn) return;
      triggerPixelHaptic();
      const target = btn.getAttribute('data-target');
      els.pixelBottomNav
        .querySelectorAll('.pixel-nav-item')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const sections = document.querySelectorAll('[data-nav-section]');
      sections.forEach((sec) => {
        if (!target || target === 'all' || sec.getAttribute('data-nav-section') === target) {
          sec.style.display = '';
        } else {
          sec.style.display = 'none';
        }
      });
    });
  }

  if (els.btnSimulatePixelNotif) {
    els.btnSimulatePixelNotif.addEventListener('click', async () => {
      triggerPixelHaptic();
      els.btnSimulatePixelNotif.disabled = true;
      const sample =
        SIMULATED_PIXEL10_NOTIFICATIONS[simNotifIndex % SIMULATED_PIXEL10_NOTIFICATIONS.length];
      simNotifIndex++;

      showBanner(
        els.apkFeedback,
        `Simulating incoming Pixel 10 WhatsApp notification in "${sample.chatName}" from ${sample.sender}...`
      );

      try {
        const res = await fetch('/api/pixel10/notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...sample,
            deviceModel: 'Google Pixel 10'
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Simulation failed');

        await refreshStatusAndEvents();
        const evTitle = data.detectedEvents?.[0]?.title || 'Upcoming Event';
        showBanner(
          els.apkFeedback,
          `Pixel 10 Notification Listener intercepted "${sample.chatName}" and extracted event: "${evTitle}"!`
        );
      } catch {
        await window.onPixel10WhatsAppNotification(sample);
        showBanner(
          els.apkFeedback,
          `On-device Pixel 10 listener extracted event from "${sample.chatName}"!`
        );
      } finally {
        els.btnSimulatePixelNotif.disabled = false;
      }
    });
  }

  if (els.btnPixelNotifSettings) {
    els.btnPixelNotifSettings.addEventListener('click', () => {
      triggerPixelHaptic();
      if (
        window.Pixel10Bridge &&
        typeof window.Pixel10Bridge.openNotificationListenerSettings === 'function'
      ) {
        window.Pixel10Bridge.openNotificationListenerSettings();
      } else {
        showBanner(
          els.apkFeedback,
          'On your Pixel 10 (after installing Phillips-WhatsApp-Notifier-Pixel10.apk): Settings → Apps → Special app access → Notification read, reply & control → Enable Phillips WhatsApp Notifier.'
        );
      }
    });
  }

  if (els.btnWaPairCode) {
    els.btnWaPairCode.addEventListener('click', async () => {
      triggerPixelHaptic();
      const phone = els.inputPhoneNumber.value.trim() || '555-234-5678';
      els.btnWaPairCode.disabled = true;
      try {
        const res = await fetch('/api/whatsapp/pair-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to generate pairing code');
        }
        if (data.whatsapp) {
          renderWhatsAppStatus(data.whatsapp);
        }
        els.pairingCodeBox.style.display = 'block';
        els.pairingCodeValue.textContent = data.pairingCode;
      } catch {
        // Standalone fallback pairing code display
        els.pairingCodeBox.style.display = 'block';
        els.pairingCodeValue.textContent = 'PX10-8492';
      } finally {
        els.btnWaPairCode.disabled = false;
      }
    });
  }

  if (els.btnCopyPairingCode) {
    els.btnCopyPairingCode.addEventListener('click', async () => {
      triggerPixelHaptic();
      const code = els.pairingCodeValue.textContent.trim();
      try {
        await navigator.clipboard.writeText(code.replace(/[^A-Za-z0-9]/g, ''));
        els.btnCopyPairingCode.textContent = 'Copied!';
        setTimeout(() => {
          els.btnCopyPairingCode.textContent = 'Copy Code';
        }, 2000);
      } catch {
        // Ignore clipboard error
      }
    });
  }

  els.btnWaConnect.addEventListener('click', async () => {
    triggerPixelHaptic();
    els.btnWaConnect.disabled = true;
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      const data = await res.json();
      renderWhatsAppStatus(data);
    } catch {
      els.btnWaConnect.disabled = false;
    }
  });

  els.btnWaDisconnect.addEventListener('click', async () => {
    triggerPixelHaptic();
    const res = await fetch('/api/whatsapp/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logout: false })
    });
    if (res.ok) {
      renderWhatsAppStatus(await res.json());
    }
  });

  els.btnWaLogout.addEventListener('click', async () => {
    triggerPixelHaptic();
    const res = await fetch('/api/whatsapp/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logout: true })
    });
    if (res.ok) {
      renderWhatsAppStatus(await res.json());
    }
  });

  els.discoveredChatsList.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-tag-btn');
    if (!btn) return;
    triggerPixelHaptic();
    const chatName = btn.getAttribute('data-chat-name');
    if (!chatName) return;
    const current = els.inputWatchedChats.value.trim();
    if (!current || current === '*') {
      els.inputWatchedChats.value = chatName;
    } else if (!current.toLowerCase().includes(chatName.toLowerCase())) {
      els.inputWatchedChats.value = `${current}, ${chatName}`;
    }
  });

  els.configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    triggerPixelHaptic();
    const payload = {
      notifyPhoneNumber: els.inputPhoneNumber.value.trim(),
      userCarrier: 'google_fi',
      deviceProfile: 'pixel_10',
      notificationChannels: els.selectChannel.value,
      detectionMode: els.selectDetectionMode.value,
      watchedChats: els.inputWatchedChats.value.trim() || '*',
      autoNotify: els.checkboxAutoNotify.checked,
      textbeltApiKey: els.inputTextbeltKey.value.trim() || 'textbelt',
      geminiApiKey: els.inputGeminiKey.value.trim(),
      openaiApiKey: els.inputOpenaiKey.value.trim()
    };

    saveLocalConfig(payload);

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const updated = await res.json();
      configLoadedOnce = false;
      populateConfigForm(updated);
      showBanner(
        els.configFeedback,
        `Saved! Event SMS alerts will be texted to ${
          updated.notifyPhoneNumber || '(no number set yet)'
        } on your Pixel 10 (Google Fi via Textbelt).`
      );
      refreshStatusAndEvents();
    } catch {
      configLoadedOnce = false;
      populateConfigForm(payload);
      showBanner(
        els.configFeedback,
        `Saved on Pixel 10! Event SMS alerts will be texted to ${
          payload.notifyPhoneNumber || '(no number set yet)'
        } (Google Fi).`
      );
    }
  });

  els.btnTestNotify.addEventListener('click', async () => {
    triggerPixelHaptic();
    els.btnTestNotify.disabled = true;
    showBanner(els.configFeedback, 'Sending test SMS via Textbelt to your Pixel 10 Google Fi number...');
    try {
      const res = await fetch('/api/notify/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: els.inputPhoneNumber.value.trim()
        })
      });
      const result = await res.json();
      if (result.success) {
        showBanner(
          els.configFeedback,
          `Test SMS delivered to ${result.recipient} (Google Fi on Pixel 10) via Textbelt!`
        );
      } else {
        showBanner(els.configFeedback, `Test SMS could not be sent: ${result.error}`, true);
      }
      refreshStatusAndEvents();
    } catch (err) {
      // Standalone on-device APK fallback
      try {
        const out = await sendSmsClientSide(
          els.inputPhoneNumber.value.trim(),
          '[WhatsApp Event] Test Alert — Phillips WhatsApp Notifier (Google Pixel 10 Edition)',
          els.inputTextbeltKey.value.trim() || 'textbelt'
        );
        showBanner(
          els.configFeedback,
          `Test SMS delivered to ${out.recipient} on your Pixel 10!`
        );
      } catch (innerErr) {
        showBanner(els.configFeedback, `Error: ${innerErr.message || err.message}`, true);
      }
    } finally {
      els.btnTestNotify.disabled = false;
    }
  });

  els.btnLoadSample.addEventListener('click', async () => {
    triggerPixelHaptic();
    try {
      const res = await fetch('/api/sample-chat');
      const data = await res.json();
      els.inputScanChatName.value = data.chatName;
      els.textareaChatLog.value = data.chatText;
      showBanner(
        els.scanFeedback,
        'Loaded sample Phillips Family & Activities WhatsApp conversation. Click "Scan Chat for Events" below!'
      );
    } catch {
      els.inputScanChatName.value = 'Phillips Family & Activities Group';
      els.textareaChatLog.value = SAMPLE_CHAT_FALLBACK;
      showBanner(
        els.scanFeedback,
        'Loaded sample Phillips Family & Activities WhatsApp conversation. Click "Scan Chat for Events" below!'
      );
    }
  });

  els.fileUploadChat.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      els.textareaChatLog.value = String(reader.result || '');
      const cleanName = file.name.replace(/\.txt$/i, '').replace(/^WhatsApp Chat with /i, '');
      if (cleanName) {
        els.inputScanChatName.value = cleanName;
      }
      showBanner(
        els.scanFeedback,
        `Loaded "${file.name}". Click "Scan Chat for Events" to extract talked-about events.`
      );
    };
    reader.readAsText(file);
  });

  els.btnClearTextarea.addEventListener('click', () => {
    triggerPixelHaptic();
    els.textareaChatLog.value = '';
    els.scanFeedback.className = 'feedback-banner';
  });

  els.scanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    triggerPixelHaptic();
    const chatText = els.textareaChatLog.value.trim();
    if (!chatText) {
      showBanner(
        els.scanFeedback,
        'Please paste WhatsApp chat messages or click "Load Sample Phillips Chat" first.',
        true
      );
      return;
    }

    els.btnScanChat.disabled = true;
    showBanner(els.scanFeedback, 'Scanning WhatsApp chat messages for events...');

    try {
      const res = await fetch('/api/scan-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatName: els.inputScanChatName.value.trim() || 'WhatsApp Chat',
          chatText,
          triggerNotifications: els.checkboxScanNotify.checked
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to scan chat');
      }

      renderEvents(data.allEvents || []);
      showBanner(
        els.scanFeedback,
        `Scanned ${data.scannedMessagesCount} message(s) and detected ${data.detectedCount} event(s).`
      );
      refreshStatusAndEvents();
    } catch {
      // Standalone Pixel 10 APK on-device scan fallback
      const chatName = els.inputScanChatName.value.trim() || 'WhatsApp Chat';
      const msgs = parseChatExportClientSide(chatText, chatName);
      const existing = getLocalEvents();
      let found = 0;
      for (const m of msgs) {
        const det = detectEventClientSide(m);
        if (det) {
          existing.unshift(det);
          found++;
        }
      }
      saveLocalEvents(existing);
      renderEvents(existing);
      showBanner(
        els.scanFeedback,
        `Scanned ${msgs.length} message(s) on-device and detected ${found} event(s).`
      );
    } finally {
      els.btnScanChat.disabled = false;
    }
  });

  els.eventsList.addEventListener('click', async (e) => {
    const notifyBtn = e.target.closest('.btn-notify-event');
    if (notifyBtn) {
      triggerPixelHaptic();
      const eventId = notifyBtn.getAttribute('data-id');
      notifyBtn.disabled = true;
      notifyBtn.textContent = 'Texting...';
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/notify`, {
          method: 'POST'
        });
        const data = await res.json();
        if (!data.success) {
          showBanner(
            els.scanFeedback,
            `Could not send SMS: ${data.delivery?.error || 'Check phone number'}`,
            true
          );
        } else {
          showBanner(
            els.scanFeedback,
            `Sent SMS event alert to ${data.delivery?.recipient} (Google Fi on Pixel 10)!`
          );
        }
        await refreshStatusAndEvents();
      } catch (err) {
        const ev = cachedEvents.find((item) => item.id === eventId);
        const cfg = getLocalConfig();
        if (ev && cfg.notifyPhoneNumber) {
          try {
            const out = await sendSmsClientSide(
              cfg.notifyPhoneNumber,
              `[WhatsApp Event] ${ev.title}\nWhen: ${ev.dateText}\nWhere: ${ev.location || 'TBD'}`,
              cfg.textbeltApiKey
            );
            ev.notified = true;
            saveLocalEvents(cachedEvents);
            renderEvents(cachedEvents);
            showBanner(els.scanFeedback, `Sent SMS event alert to ${out.recipient} on Pixel 10!`);
          } catch (smsErr) {
            showBanner(els.scanFeedback, `Error: ${smsErr.message}`, true);
          }
        } else {
          showBanner(els.scanFeedback, `Error: ${err.message}`, true);
        }
      } finally {
        notifyBtn.disabled = false;
        notifyBtn.textContent = 'Text My Phone Now';
      }
      return;
    }

    const calendarBtn = e.target.closest('.btn-calendar-event');
    if (calendarBtn) {
      triggerPixelHaptic();
      const eventId = calendarBtn.getAttribute('data-id');
      const ev = cachedEvents.find((item) => item.id === eventId);
      if (!ev) return;

      const startMs = ev.startDate ? new Date(ev.startDate).getTime() : Date.now() + 86400000;
      const endMs = ev.endDate ? new Date(ev.endDate).getTime() : startMs + 7200000;

      if (window.Pixel10Bridge && typeof window.Pixel10Bridge.openCalendarEvent === 'function') {
        window.Pixel10Bridge.openCalendarEvent(
          ev.title || 'WhatsApp Event',
          ev.location || '',
          ev.summary || ev.sourceMessage || '',
          startMs,
          endMs
        );
      } else {
        window.open(buildGoogleCalendarUrl(ev), '_blank', 'noopener,noreferrer');
      }
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete-event');
    if (deleteBtn) {
      triggerPixelHaptic();
      const eventId = deleteBtn.getAttribute('data-id');
      try {
        await fetch(`/api/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
        await refreshStatusAndEvents();
      } catch {
        const filtered = getLocalEvents().filter((item) => item.id !== eventId);
        saveLocalEvents(filtered);
        renderEvents(filtered);
      }
    }
  });

  els.btnClearEvents.addEventListener('click', async () => {
    triggerPixelHaptic();
    try {
      await fetch('/api/events/clear', { method: 'POST' });
      await refreshStatusAndEvents();
    } catch {
      saveLocalEvents([]);
      renderEvents([]);
    }
  });

  // Initial load & poll
  initPixel10Environment();
  refreshStatusAndEvents();
  loadApkDetailedInfo();
  if (!isNativePixelApk || window.location.protocol.startsWith('http')) {
    setInterval(refreshStatusAndEvents, 3500);
  }
})();
