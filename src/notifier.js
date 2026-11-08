/**
 * Notification service that messages the user's personal phone number
 * via WhatsApp Direct Message and/or Twilio SMS whenever an event is detected.
 */

function normalizePhoneDigits(phone) {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/[^\d]/g, '');
}

function normalizeE164(phone) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return '';
  return phone.trim().startsWith('+') ? `+${digits}` : `+${digits}`;
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

async function sendTwilioSms({ to, body, accountSid, authToken, fromNumber }) {
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      'Twilio SMS credentials (Account SID, Auth Token, and From Number) are not configured.'
    );
  }
  const formattedTo = normalizeE164(to);
  if (!formattedTo || formattedTo.length < 8) {
    throw new Error('A valid personal phone number is required to send SMS.');
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Messages.json`;

  const params = new URLSearchParams();
  params.set('To', formattedTo);
  params.set('From', fromNumber.trim());
  params.set('Body', body);

  const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Twilio API returned HTTP ${response.status}`);
  }

  return {
    channel: 'sms',
    to: formattedTo,
    sid: data.sid,
    status: data.status || 'sent'
  };
}

async function sendWhatsAppDirectMessage({ to, body, whatsappManager }) {
  if (!whatsappManager) {
    throw new Error('WhatsApp manager is not initialized.');
  }
  const digits = normalizePhoneDigits(to);
  if (!digits || digits.length < 7) {
    throw new Error('A valid personal phone number is required to send a WhatsApp notification.');
  }
  return whatsappManager.sendDirectMessage(digits, body);
}

/**
 * Dispatches notification for a detected event to the configured personal phone number.
 */
async function notifyUserOfEvent(event, config, whatsappManager) {
  const targetPhone = config.notifyPhoneNumber;
  if (!targetPhone || normalizePhoneDigits(targetPhone).length < 7) {
    return {
      success: false,
      recipient: targetPhone || '',
      channelsAttempted: [],
      results: [],
      error: 'Personal phone number (notifyPhoneNumber) is not configured yet.'
    };
  }

  const channelPref = (config.notificationChannels || 'whatsapp').toLowerCase();
  const useWhatsApp = channelPref === 'whatsapp' || channelPref === 'both';
  const useSms = channelPref === 'sms' || channelPref === 'both';

  const channelsAttempted = [];
  const results = [];
  const errors = [];

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

  if (useSms) {
    channelsAttempted.push('sms');
    try {
      const smsBody = formatSmsMessage(event);
      const res = await sendTwilioSms({
        to: targetPhone,
        body: smsBody,
        accountSid: config.twilioAccountSid,
        authToken: config.twilioAuthToken,
        fromNumber: config.twilioFromNumber
      });
      results.push({ channel: 'sms', success: true, detail: res });
    } catch (err) {
      errors.push(`SMS: ${err.message}`);
      results.push({ channel: 'sms', success: false, error: err.message });
    }
  }

  const anySuccess = results.some((r) => r.success);

  return {
    success: anySuccess,
    recipient: normalizeE164(targetPhone),
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
  sendTwilioSms
};
