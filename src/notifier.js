/**
 * Notification service that texts the user's personal Google Fi / carrier phone number
 * via Textbelt SMS (and optionally WhatsApp Direct Message) whenever an event is detected.
 */

function normalizePhoneDigits(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/[^\d]/g, '');
  // Automatically prepend US country code '1' for standard 10-digit Google Fi / US numbers
  if (digits.length === 10) {
    return `1${digits}`;
  }
  return digits;
}

function normalizeE164(phone) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return '';
  return `+${digits}`;
}

function getTenDigitUsNumber(phone) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

function getGoogleFiGatewayAddress(phone) {
  const tenDigit = getTenDigitUsNumber(phone);
  if (tenDigit.length !== 10) return null;
  return `${tenDigit}@msg.fi.google.com`;
}

function formatEventNotificationMessage(event) {
  const lines = [
    `📅 *Phillips WhatsApp Event Alert*`,
    ``,
    `📌 *Event:* ${event.title}`,
    `🕒 *When:* ${event.dateText || 'Date TBD'}`
  ];

  if (event.location) {
    lines.push(`📍 *Where:* ${event.location}`);
  }

  lines.push(`💬 *Chat:* ${event.chatName || 'WhatsApp Chat'}`);
  if (event.sender) {
    lines.push(`👤 *Mentioned by:* ${event.sender}`);
  }

  if (event.summary) {
    lines.push(``, `📝 *Message:* "${event.summary}"`);
  }

  return lines.join('\n');
}

function formatSmsMessage(event) {
  const parts = [
    `[WhatsApp Event] ${event.title}`,
    `When: ${event.dateText || 'TBD'}`
  ];
  if (event.location) {
    parts.push(`Where: ${event.location}`);
  }
  parts.push(`Chat: ${event.chatName || 'WhatsApp'} (${event.sender || 'Member'})`);
  if (event.summary) {
    parts.push(`"${event.summary.slice(0, 120)}"`);
  }
  return parts.join('\n');
}

/**
 * Sends a real SMS text message to the user's carrier phone number (e.g. Google Fi)
 * using the Textbelt SMS API (https://textbelt.com/text).
 */
async function sendTextbeltSms({ to, body, apiKey = 'textbelt', fetchImpl = fetch }) {
  const formattedTo = normalizeE164(to);
  if (!formattedTo || formattedTo.length < 10) {
    throw new Error('Please enter a valid 10-digit mobile phone number.');
  }

  const effectiveKey = (apiKey || 'textbelt').trim() || 'textbelt';

  const response = await fetchImpl('https://textbelt.com/text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phone: formattedTo,
      message: body,
      key: effectiveKey
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(
      data.error || `Textbelt SMS API returned HTTP ${response.status}`
    );
  }

  return {
    channel: 'sms',
    provider: 'textbelt',
    carrier: 'Google Fi',
    to: formattedTo,
    googleFiGateway: getGoogleFiGatewayAddress(to),
    textId: data.textId || null,
    quotaRemaining: data.quotaRemaining !== undefined ? data.quotaRemaining : null,
    status: 'sent'
  };
}

async function sendWhatsAppDirectMessage({ to, body, whatsappManager }) {
  if (!whatsappManager) {
    throw new Error('WhatsApp manager is not initialized.');
  }
  const digits = normalizePhoneDigits(to);
  if (!digits || digits.length < 10) {
    throw new Error('A valid personal phone number is required to send a WhatsApp notification.');
  }
  return whatsappManager.sendDirectMessage(digits, body);
}

/**
 * Dispatches notification for a detected event to the configured personal phone number.
 */
async function notifyUserOfEvent(event, config, whatsappManager, options = {}) {
  const targetPhone = config.notifyPhoneNumber;
  if (!targetPhone || normalizePhoneDigits(targetPhone).length < 10) {
    return {
      success: false,
      recipient: targetPhone || '',
      channelsAttempted: [],
      results: [],
      error: 'Personal phone number is not set yet. Enter your 10-digit Google Fi number and click Save.'
    };
  }

  const channelPref = (config.notificationChannels || 'sms').toLowerCase();
  const useSms = channelPref === 'sms' || channelPref === 'both';
  const useWhatsApp = channelPref === 'whatsapp' || channelPref === 'both';

  const channelsAttempted = [];
  const results = [];
  const errors = [];

  if (useSms) {
    channelsAttempted.push('sms');
    try {
      const smsBody = formatSmsMessage(event);
      const res = await sendTextbeltSms({
        to: targetPhone,
        body: smsBody,
        apiKey: config.textbeltApiKey || process.env.TEXTBELT_API_KEY || 'textbelt',
        fetchImpl: options.fetchImpl || fetch
      });
      results.push({ channel: 'sms', success: true, detail: res });
    } catch (err) {
      errors.push(`SMS (Textbelt): ${err.message}`);
      results.push({ channel: 'sms', success: false, error: err.message });
    }
  }

  if (useWhatsApp) {
    channelsAttempted.push('whatsapp');
    try {
      const waBody = formatEventNotificationMessage(event);
      const res = await sendWhatsAppDirectMessage({
        to: targetPhone,
        body: waBody,
        whatsappManager
      });
      results.push({ channel: 'whatsapp', success: true, detail: res });
    } catch (err) {
      errors.push(`WhatsApp: ${err.message}`);
      results.push({ channel: 'whatsapp', success: false, error: err.message });
    }
  }

  const anySuccess = results.some((r) => r.success);

  return {
    success: anySuccess,
    recipient: normalizeE164(targetPhone),
    carrier: 'Google Fi',
    googleFiGateway: getGoogleFiGatewayAddress(targetPhone),
    channelsAttempted,
    results,
    error: anySuccess ? null : errors.join(' | ') || 'No notification channel succeeded.'
  };
}

module.exports = {
  notifyUserOfEvent,
  formatEventNotificationMessage,
  formatSmsMessage,
  normalizePhoneDigits,
  normalizeE164,
  getGoogleFiGatewayAddress,
  sendTextbeltSms
};
