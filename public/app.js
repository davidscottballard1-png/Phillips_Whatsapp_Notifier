(function () {
  const els = {
    waConnectionPill: document.getElementById('wa-connection-pill'),
    waConnectionLabel: document.getElementById('wa-connection-label'),
    phoneTargetLabel: document.getElementById('phone-target-label'),
    qrInstructions: document.getElementById('qr-instructions'),
    qrImage: document.getElementById('qr-image'),
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
    activityList: document.getElementById('activity-list')
  };

  let configLoadedOnce = false;

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

  function renderWhatsAppStatus(wa) {
    if (!wa) return;
    els.waConnectionPill.className = `status-chip ${wa.status || 'disconnected'}`;

    const statusTextMap = {
      disconnected: 'WhatsApp: Disconnected',
      connecting: 'WhatsApp: Connecting...',
      qr_ready: 'WhatsApp: Scan QR Code',
      connected: `WhatsApp: Connected (${wa.connectedUser?.name || 'Linked'})`,
      error: 'WhatsApp: Connection Error'
    };
    els.waConnectionLabel.textContent = statusTextMap[wa.status] || `WhatsApp: ${wa.status}`;

    if (wa.status === 'qr_ready' && wa.qrDataUrl) {
      els.qrImage.src = wa.qrDataUrl;
      els.qrImage.style.display = 'block';
      els.qrInstructions.innerHTML =
        'Scan this QR code with your phone: <strong>WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device</strong>';
      els.btnWaConnect.style.display = 'none';
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
      els.qrInstructions.textContent = 'Starting WhatsApp Web session and generating QR code...';
      els.btnWaConnect.disabled = true;
      els.btnWaDisconnect.style.display = 'inline-flex';
    } else {
      els.qrImage.style.display = 'none';
      els.btnWaConnect.style.display = 'inline-flex';
      els.btnWaConnect.disabled = false;
      els.btnWaDisconnect.style.display = 'none';
      els.btnWaLogout.style.display = 'none';
      els.qrInstructions.innerHTML = wa.lastError
        ? `Status: ${escapeHtml(wa.lastError)}. Click <strong>Connect WhatsApp</strong> to retry or use the Chat Scanner on the right.`
        : 'Click <strong>Connect WhatsApp</strong> to generate a QR code, then scan it from <strong>WhatsApp &rarr; Linked Devices</strong> on your phone.';
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

  function renderEvents(events = []) {
    els.eventsCountBadge.textContent = String(events.length);

    if (!events.length) {
      els.eventsList.innerHTML = `
        <div class="empty-state">
          <h3>No events detected yet</h3>
          <p>
            Link your WhatsApp account to monitor live chats, or click
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
      }
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        renderEvents(eventsData.events);
      }
    } catch {
      // Ignore transient network errors during background poll
    }
  }

  // --- Event Listeners ---

  els.btnWaConnect.addEventListener('click', async () => {
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
    const payload = {
      notifyPhoneNumber: els.inputPhoneNumber.value.trim(),
      userCarrier: 'google_fi',
      notificationChannels: els.selectChannel.value,
      detectionMode: els.selectDetectionMode.value,
      watchedChats: els.inputWatchedChats.value.trim() || '*',
      autoNotify: els.checkboxAutoNotify.checked,
      textbeltApiKey: els.inputTextbeltKey.value.trim() || 'textbelt',
      geminiApiKey: els.inputGeminiKey.value.trim(),
      openaiApiKey: els.inputOpenaiKey.value.trim()
    };

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
        } (Google Fi via Textbelt).`
      );
      refreshStatusAndEvents();
    } catch (err) {
      showBanner(els.configFeedback, `Failed to save settings: ${err.message}`, true);
    }
  });

  els.btnTestNotify.addEventListener('click', async () => {
    els.btnTestNotify.disabled = true;
    showBanner(els.configFeedback, 'Sending test SMS via Textbelt to your Google Fi number...');
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
          `Test SMS delivered to ${result.recipient} (Google Fi) via Textbelt!`
        );
      } else {
        showBanner(els.configFeedback, `Test SMS could not be sent: ${result.error}`, true);
      }
      refreshStatusAndEvents();
    } catch (err) {
      showBanner(els.configFeedback, `Error: ${err.message}`, true);
    } finally {
      els.btnTestNotify.disabled = false;
    }
  });

  els.btnLoadSample.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/sample-chat');
      const data = await res.json();
      els.inputScanChatName.value = data.chatName;
      els.textareaChatLog.value = data.chatText;
      showBanner(
        els.scanFeedback,
        'Loaded sample Phillips Family & Activities WhatsApp conversation. Click "Scan Chat for Events" below!'
      );
    } catch (err) {
      showBanner(els.scanFeedback, `Could not load sample chat: ${err.message}`, true);
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
    els.textareaChatLog.value = '';
    els.scanFeedback.className = 'feedback-banner';
  });

  els.scanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
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
    } catch (err) {
      showBanner(els.scanFeedback, `Scan failed: ${err.message}`, true);
    } finally {
      els.btnScanChat.disabled = false;
    }
  });

  els.eventsList.addEventListener('click', async (e) => {
    const notifyBtn = e.target.closest('.btn-notify-event');
    if (notifyBtn) {
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
            `Sent SMS event alert to ${data.delivery?.recipient} (Google Fi)!`
          );
        }
        await refreshStatusAndEvents();
      } catch (err) {
        showBanner(els.scanFeedback, `Error: ${err.message}`, true);
      } finally {
        notifyBtn.disabled = false;
        notifyBtn.textContent = 'Text My Phone Now';
      }
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete-event');
    if (deleteBtn) {
      const eventId = deleteBtn.getAttribute('data-id');
      await fetch(`/api/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
      await refreshStatusAndEvents();
    }
  });

  els.btnClearEvents.addEventListener('click', async () => {
    await fetch('/api/events/clear', { method: 'POST' });
    await refreshStatusAndEvents();
  });

  // Initial load & poll
  refreshStatusAndEvents();
  setInterval(refreshStatusAndEvents, 3500);
})();
