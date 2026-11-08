/**
 * Parses WhatsApp exported .txt chat logs (iOS and Android formats) or plain text conversations
 * into structured message objects.
 *
 * Supported formats:
 * 1. iOS: [11/8/26, 2:15:30 PM] Sarah Phillips: Hey everyone, family dinner this Friday at 7pm!
 * 2. Android: 11/8/26, 14:15 - Sarah Phillips: Hey everyone, family dinner this Friday at 7pm!
 * 3. Simple "Sender: Message" lines or single raw messages
 */

const IOS_LINE_REGEX =
  /^\[(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APMapm]{2})?)\]\s+([^:]+):\s*(.+)$/;

const ANDROID_LINE_REGEX =
  /^(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APMapm]{2})?)\s+-\s+([^:]+):\s*(.+)$/;

const SIMPLE_SPEAKER_REGEX = /^([A-Za-z0-9_.\s+'()-]{2,35}):\s+(.+)$/;

const SYSTEM_MESSAGE_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /created group/i,
  /changed the subject/i,
  /changed this group's icon/i,
  /<media omitted>/i,
  /image omitted/i,
  /audio omitted/i,
  /video omitted/i
];

function isSystemNotice(text) {
  return SYSTEM_MESSAGE_PATTERNS.some((rx) => rx.test(text));
}

function parseWhatsAppExport(rawText, defaultChatName = 'Imported WhatsApp Chat') {
  if (!rawText || typeof rawText !== 'string') return [];

  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const messages = [];
  let currentMsg = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[\u200e\u200f]+/, '').trim();
    if (!line) continue;

    const iosMatch = line.match(IOS_LINE_REGEX);
    if (iosMatch) {
      if (currentMsg && !isSystemNotice(currentMsg.text)) {
        messages.push(currentMsg);
      }
      const [, datePart, timePart, sender, text] = iosMatch;
      const parsedTs = new Date(`${datePart} ${timePart}`);
      currentMsg = {
        chatName: defaultChatName,
        sender: sender.trim(),
        text: text.trim(),
        timestamp: !isNaN(parsedTs.getTime()) ? parsedTs.toISOString() : new Date().toISOString()
      };
      continue;
    }

    const androidMatch = line.match(ANDROID_LINE_REGEX);
    if (androidMatch) {
      if (currentMsg && !isSystemNotice(currentMsg.text)) {
        messages.push(currentMsg);
      }
      const [, datePart, timePart, sender, text] = androidMatch;
      const parsedTs = new Date(`${datePart} ${timePart}`);
      currentMsg = {
        chatName: defaultChatName,
        sender: sender.trim(),
        text: text.trim(),
        timestamp: !isNaN(parsedTs.getTime()) ? parsedTs.toISOString() : new Date().toISOString()
      };
      continue;
    }

    const speakerMatch = line.match(SIMPLE_SPEAKER_REGEX);
    if (speakerMatch && !/^https?$/i.test(speakerMatch[1])) {
      if (currentMsg && !isSystemNotice(currentMsg.text)) {
        messages.push(currentMsg);
      }
      currentMsg = {
        chatName: defaultChatName,
        sender: speakerMatch[1].trim(),
        text: speakerMatch[2].trim(),
        timestamp: new Date().toISOString()
      };
      continue;
    }

    if (currentMsg) {
      currentMsg.text += `\n${line}`;
    } else {
      currentMsg = {
        chatName: defaultChatName,
        sender: 'Chat Participant',
        text: line,
        timestamp: new Date().toISOString()
      };
    }
  }

  if (currentMsg && !isSystemNotice(currentMsg.text)) {
    messages.push(currentMsg);
  }

  return messages;
}

module.exports = {
  parseWhatsAppExport
};
