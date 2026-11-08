const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWhatsAppExport } = require('../src/chatParser');
const { detectEventWithRules, analyzeMessageForEvent } = require('../src/eventDetector');
const {
  formatEventNotificationMessage,
  formatSmsMessage,
  notifyUserOfEvent
} = require('../src/notifier');

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

test('notifyUserOfEvent sends formatted alert to personal phone number via WhatsApp manager', async () => {
  const sentMessages = [];
  const mockWhatsAppManager = {
    async sendDirectMessage(phoneDigits, body) {
      sentMessages.push({ phoneDigits, body });
      return { jid: `${phoneDigits}@s.whatsapp.net`, messageId: 'mock_msg_1' };
    }
  };

  const event = {
    title: 'Phillips Family Sunday BBQ',
    dateText: 'Sun, Nov 15, 2026, 1:00 PM',
    location: 'Oak Creek Park',
    chatName: 'Phillips Family Group',
    sender: 'Uncle Dave',
    summary: 'Hosting the Phillips Family Sunday BBQ at Oak Creek Park this Sunday at 1:00 PM.'
  };

  const config = {
    notifyPhoneNumber: '+1 (555) 234-5678',
    notificationChannels: 'whatsapp'
  };

  const res = await notifyUserOfEvent(event, config, mockWhatsAppManager);
  assert.equal(res.success, true);
  assert.equal(res.recipient, '+15552345678');
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].phoneDigits, '15552345678');
  assert.match(sentMessages[0].body, /Phillips Family Sunday BBQ/);
  assert.match(sentMessages[0].body, /Oak Creek Park/);

  const smsText = formatSmsMessage(event);
  assert.match(smsText, /\[WhatsApp Event\] Phillips Family Sunday BBQ/);
  const waText = formatEventNotificationMessage(event);
  assert.match(waText, /Phillips WhatsApp Event Alert/);
});
