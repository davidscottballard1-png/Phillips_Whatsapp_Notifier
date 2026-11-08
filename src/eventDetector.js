const chrono = require('chrono-node');

const EVENT_KEYWORDS = {
  social: [
    'dinner', 'lunch', 'brunch', 'breakfast', 'coffee', 'drinks', 'happy hour',
    'party', 'birthday', 'bbq', 'barbecue', 'cookout', 'potluck', 'hangout',
    'get-together', 'get together', 'gathering', 'celebration', 'wedding',
    'shower', 'concert', 'movie', 'picnic', 'game night', 'trivia'
  ],
  family: [
    'family dinner', 'reunion', 'anniversary', 'visit', 'visiting', 'holidays',
    'thanksgiving', 'christmas', 'easter', 'graduation', 'recital', 'church',
    'service', 'sunday lunch', 'kids', 'pickup', 'drop off'
  ],
  meeting: [
    'meeting', 'call', 'sync', 'standup', 'zoom', 'google meet', 'teams',
    'workshop', 'seminar', 'conference', 'webinar', 'presentation', 'interview',
    'appointment', 'consultation', 'session', 'class', 'lecture', 'rehearsal'
  ],
  sports: [
    'game', 'match', 'practice', 'training', 'tournament', 'workout', 'run',
    'hike', 'hiking', 'golf', 'tennis', 'pickleball', 'soccer', 'basketball',
    'baseball', 'kickoff', 'scrimmage'
  ],
  travel: [
    'flight', 'trip', 'vacation', 'camping', 'road trip', 'departure',
    'check-in', 'hotel', 'airbnb', 'carpool'
  ],
  deadline: [
    'deadline', 'due', 'rsvp', 'registration', 'sign up', 'signup', 'tickets',
    'submission', 'exam', 'test'
  ]
};

const INVITE_PHRASES = [
  "let's meet", "lets meet", "we are meeting", "we're meeting", "join us",
  "are we still on", "save the date", "mark your calendar", "coming over",
  "come over", "hosting", "planning to", "scheduled for", "moved to",
  "rescheduled to", "starts at", "starting at", "begins at", "see you all",
  "see everyone", "who's in", "who is in", "rsvp by", "don't forget"
];

const LOCATION_PATTERNS = [
  /\b(?:at|@)\s+([A-Z][A-Za-z0-9'&\-\s]{2,40}?)(?=\s+(?:on|this|next|tomorrow|today|at|from|for|to\b)|[.,!?;]|$)/,
  /\blocation:\s*([^\n.,!?;]{3,50})/i,
  /\bwhere:\s*([^\n.,!?;]{3,50})/i,
  /\bplace:\s*([^\n.,!?;]{3,50})/i,
  /\b(https?:\/\/(?:[\w-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)\/[^\s)]+)/i
];

function detectCategory(lowerText) {
  for (const [category, words] of Object.entries(EVENT_KEYWORDS)) {
    for (const word of words) {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lowerText)) {
        return { category, matchedKeyword: word };
      }
    }
  }
  return { category: 'general', matchedKeyword: null };
}

function extractLocation(text, dateText) {
  for (const pattern of LOCATION_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Avoid matching times or day names as locations
      if (
        !/^(?:\d|noon|midnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|morning|afternoon|evening|night)/i.test(
          candidate
        ) &&
        (!dateText || !dateText.toLowerCase().includes(candidate.toLowerCase()))
      ) {
        return candidate;
      }
    }
  }
  return '';
}

function buildCleanTitle(text, matchedKeyword, dateText, location) {
  // Check for explicit "Event: ..." or subject line
  const explicitMatch = text.match(/(?:event|subject|what|reminder):\s*([^\n.!?;]{3,60})/i);
  if (explicitMatch && explicitMatch[1]) {
    return explicitMatch[1].trim();
  }

  // Strip out conversational prefixes
  let cleaned = text
    .split(/\n/)[0]
    .replace(/^(?:hey\s+(?:everyone|guys|all|team|family|folks)[,!.\s]*)/i, '')
    .replace(/^(?:hi\s+(?:everyone|guys|all|team|family)[,!.\s]*)/i, '')
    .replace(/^(?:just\s+a\s+(?:quick\s+)?reminder\s*(?:that|about|for)?[:,!.\s]*)/i, '')
    .replace(/^(?:don't\s+forget\s*(?:that|about)?[:,!.\s]*)/i, '')
    .replace(/^(?:heads\s+up[,!.\s]*)/i, '')
    .replace(/^(?:we're\s+having\s+(?:a|an)?\s*)/i, '')
    .replace(/^(?:we\s+are\s+having\s+(?:a|an)?\s*)/i, '')
    .replace(/^(?:let's\s+(?:do|have|meet\s+for)\s+(?:a|an)?\s*)/i, '')
    .replace(/^(?:are\s+we\s+still\s+on\s+for\s+)/i, '');

  if (dateText) {
    const escapedDate = dateText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\b(?:on|this|next|at|for)?\\s*${escapedDate}`, 'i'), '');
  }

  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/^[,.\-:;!\s]+|[,.\-:;!\s]+$/g, '')
    .trim();

  if (cleaned.length >= 4 && cleaned.length <= 65) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  if (matchedKeyword) {
    const capitalizedKeyword = matchedKeyword
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    if (location) {
      return `${capitalizedKeyword} at ${location}`;
    }
    return capitalizedKeyword;
  }

  const snippet = cleaned.slice(0, 52).trim();
  return snippet ? snippet.charAt(0).toUpperCase() + snippet.slice(1) : 'Upcoming Chat Event';
}

function formatHumanDate(startDate, endDate, fallbackText) {
  if (!startDate) return fallbackText || 'Date TBD';
  try {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return fallbackText || 'Date TBD';
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    let formatted = dateFormatter.format(d);
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        const timeFormatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        });
        formatted += ` – ${timeFormatter.format(end)}`;
      }
    }
    return formatted;
  } catch {
    return fallbackText || 'Date TBD';
  }
}

/**
 * Rule-based + Chrono NLP event detector
 */
function detectEventWithRules(messageText, options = {}) {
  if (!messageText || typeof messageText !== 'string') return null;
  const text = messageText.trim();
  if (text.length < 8) return null;

  const refDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const parsedDates = chrono.parse(text, refDate, { forwardDate: true });

  const lowerText = text.toLowerCase();
  const { category, matchedKeyword } = detectCategory(lowerText);
  const hasInvitePhrase = INVITE_PHRASES.some((phrase) => lowerText.includes(phrase));

  if (parsedDates.length === 0) {
    return null;
  }

  const primaryDate = parsedDates[0];
  const startDateObj = primaryDate.start ? primaryDate.start.date() : null;
  const endDateObj = primaryDate.end ? primaryDate.end.date() : null;
  const dateTextRaw = primaryDate.text;

  // Score whether this message is genuinely talking about an event
  let confidence = 0.35;
  if (matchedKeyword) confidence += 0.35;
  if (hasInvitePhrase) confidence += 0.2;
  if (primaryDate.start && primaryDate.start.isCertain('hour')) confidence += 0.12;
  if (primaryDate.start && (primaryDate.start.isCertain('weekday') || primaryDate.start.isCertain('day'))) {
    confidence += 0.1;
  }

  const location = extractLocation(text, dateTextRaw);
  if (location) confidence += 0.1;

  // Filter out pure past references without event keywords
  if (startDateObj && startDateObj.getTime() < refDate.getTime() - 12 * 3600 * 1000 && !matchedKeyword) {
    return null;
  }

  // Require either an event keyword, invite phrase, location, or high date specificity
  if (!matchedKeyword && !hasInvitePhrase && !location && confidence < 0.6) {
    return null;
  }

  confidence = Math.min(0.96, Number(confidence.toFixed(2)));
  const minConfidence = typeof options.minConfidence === 'number' ? options.minConfidence : 0.55;
  if (confidence < minConfidence) {
    return null;
  }

  const title = buildCleanTitle(text, matchedKeyword, dateTextRaw, location);
  const formattedDate = formatHumanDate(startDateObj, endDateObj, dateTextRaw);

  return {
    isEvent: true,
    title,
    dateText: `${formattedDate} ("${dateTextRaw}")`,
    startDate: startDateObj ? startDateObj.toISOString() : null,
    endDate: endDateObj ? endDateObj.toISOString() : null,
    location,
    category,
    summary: text.length > 180 ? `${text.slice(0, 177)}...` : text,
    confidence,
    detectionMethod: 'rules'
  };
}

/**
 * AI-powered event extraction (Gemini or OpenAI)
 */
async function detectEventWithAI(messageText, contextMessages = [], config = {}) {
  const referenceIso = new Date().toISOString();
  const contextString =
    contextMessages.length > 0
      ? contextMessages.map((m) => `[${m.sender || 'Member'}]: ${m.text}`).join('\n')
      : '(No prior context)';

  const systemPrompt = `You analyze WhatsApp chat messages to detect any upcoming or talked-about events, gatherings, meetings, plans, appointments, games, trips, or deadlines.
Current reference time: ${referenceIso}.
Respond ONLY with a valid JSON object matching this schema:
{
  "isEvent": boolean,
  "title": string (concise name of the event, e.g. "Family BBQ at Phillips House"),
  "dateText": string (human-readable date and time, e.g. "Fri, Nov 13, 2026 at 6:30 PM"),
  "startDate": string | null (ISO 8601 timestamp if resolvable, else null),
  "location": string (venue, address, or link if mentioned, else ""),
  "category": "social" | "family" | "meeting" | "sports" | "travel" | "deadline" | "general",
  "summary": string (1-sentence summary of the event details discussed),
  "confidence": number (0.0 to 1.0)
}`;

  const userPrompt = `Recent chat context:\n${contextString}\n\nLatest message to evaluate:\n"${messageText}"`;

  // Prefer Gemini if key is configured and selected
  if (config.geminiApiKey && (config.aiProvider === 'gemini' || !config.openaiApiKey)) {
    const model = config.geminiModel || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) return null;
    const parsed = JSON.parse(rawJson);
    if (!parsed.isEvent || (parsed.confidence || 0) < (config.minConfidence || 0.55)) {
      return null;
    }
    return {
      ...parsed,
      detectionMethod: `ai:gemini (${model})`
    };
  }

  // OpenAI fallback / primary
  if (config.openaiApiKey) {
    const model = config.openaiModel || 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawJson = data?.choices?.[0]?.message?.content;
    if (!rawJson) return null;
    const parsed = JSON.parse(rawJson);
    if (!parsed.isEvent || (parsed.confidence || 0) < (config.minConfidence || 0.55)) {
      return null;
    }
    return {
      ...parsed,
      detectionMethod: `ai:openai (${model})`
    };
  }

  return null;
}

/**
 * Unified detector supporting 'hybrid', 'ai', and 'rules' modes
 */
async function analyzeMessageForEvent(message, contextMessages = [], config = {}) {
  const text = typeof message === 'string' ? message : message?.text || '';
  if (!text || text.trim().length < 8) return null;

  const mode = config.detectionMode || 'hybrid';
  const hasAiKey = Boolean(config.geminiApiKey || config.openaiApiKey);

  if ((mode === 'ai' || mode === 'hybrid') && hasAiKey) {
    try {
      const aiResult = await detectEventWithAI(text, contextMessages, config);
      if (aiResult) {
        return {
          ...aiResult,
          chatName: message.chatName || 'WhatsApp Chat',
          chatJid: message.chatJid || '',
          sender: message.sender || 'Chat Member',
          sourceMessage: text,
          messageTimestamp: message.timestamp || new Date().toISOString()
        };
      }
      if (mode === 'ai') return null;
    } catch (err) {
      if (mode === 'ai') {
        throw err;
      }
      // In hybrid mode, gracefully fall back to rules
    }
  }

  if (mode === 'ai' && !hasAiKey) {
    // Even if user chose AI mode without a key yet, fall back to rules so detection still works
  }

  const ruleResult = detectEventWithRules(text, {
    referenceDate: message.timestamp ? new Date(message.timestamp) : new Date(),
    minConfidence: config.minConfidence || 0.55
  });

  if (!ruleResult) return null;

  return {
    ...ruleResult,
    chatName: message.chatName || 'WhatsApp Chat',
    chatJid: message.chatJid || '',
    sender: message.sender || 'Chat Member',
    sourceMessage: text,
    messageTimestamp: message.timestamp || new Date().toISOString()
  };
}

module.exports = {
  analyzeMessageForEvent,
  detectEventWithRules,
  detectEventWithAI
};
