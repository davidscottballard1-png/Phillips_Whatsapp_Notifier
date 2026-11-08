# Phillips WhatsApp Notifier

**Phillips WhatsApp Notifier** scans WhatsApp chats that you grant it access to, detects any upcoming events talked about in the conversation, and automatically messages your **personal phone number** (via WhatsApp Direct Message and/or Twilio SMS) with the event details.

---

## Features

- **Live WhatsApp Chat Access (QR Link):** Connect your WhatsApp account in seconds by scanning a QR code directly from the Web Dashboard (`@whiskeysockets/baileys`). Choose specific WhatsApp groups/chats to monitor or watch all chats.
- **Exported Chat Log Scanner (`.txt`):** Upload or paste exported WhatsApp `.txt` chat logs (supports both iOS and Android export formats) to scan past conversations for talked-about events.
- **Hybrid AI + NLP Event Detection:**
  - **AI Extraction (Optional):** Supports **Google Gemini** (`gemini-2.5-flash`) and **OpenAI** (`gpt-4o-mini`) with conversational context to extract event titles, dates/times, locations, categories, and summaries.
  - **Built-in Chrono NLP Rules (Zero-Config):** Works out-of-the-box without an API key using natural-language date/time parsing (`chrono-node`) and event-intent scoring.
  - **Smart Deduplication:** Fingerprints detected events so lively group threads don't send duplicate alerts for the same event.
- **Personal Phone Notifications:**
  - **WhatsApp Direct Message (Free):** Sends a formatted event alert directly to your personal phone number on WhatsApp.
  - **SMS via Twilio (Optional):** Sends an SMS text message to your personal phone number via Twilio.

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Optional)

Copy `.env.example` to `.env` or configure everything live in the Web Dashboard:

```bash
cp .env.example .env
```

### 3. Start the Application

```bash
npm start
```

Open `http://localhost:3000` in your browser:

1. **Link WhatsApp (or Scan a Chat Log):** Click **Connect WhatsApp** to scan the pairing QR code from **WhatsApp → Linked Devices**, or click **Load Sample Phillips Chat** / **Upload `.txt` Export** to scan a conversation right away.
2. **Set Your Personal Phone Number:** Enter your phone number in E.164 format (e.g., `+15551234567`), select **WhatsApp Message**, **SMS via Twilio**, or **Both**, and click **Save Configuration**.
3. **Receive Event Notifications:** Whenever an event is talked about in a monitored WhatsApp chat, the app extracts the event details (Title, Date/Time, Location, Chat, Sender) and messages your phone number.

---

## Project Structure

- [`src/server.js`](./src/server.js) — Express server & REST API endpoints
- [`src/whatsapp.js`](./src/whatsapp.js) — Live WhatsApp Web client (`@whiskeysockets/baileys`), QR pairing, chat discovery, and direct messaging
- [`src/eventDetector.js`](./src/eventDetector.js) — Hybrid AI (Gemini / OpenAI) + Chrono NLP rule-based event extraction engine
- [`src/chatParser.js`](./src/chatParser.js) — Parser for iOS and Android WhatsApp `.txt` chat exports
- [`src/notifier.js`](./src/notifier.js) — Personal phone notification dispatcher (WhatsApp DM + Twilio SMS)
- [`src/store.js`](./src/store.js) — Persistent configuration and deduplicated event store
- [`public/`](./public) — Web dashboard (`index.html`, `styles.css`, `app.js`)
- [`test/notifier.test.js`](./test/notifier.test.js) — Automated unit & integration tests

---

## Running Tests

```bash
npm test
```