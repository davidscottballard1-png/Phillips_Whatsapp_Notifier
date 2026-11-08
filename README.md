# Phillips WhatsApp Notifier

**Phillips WhatsApp Notifier** scans WhatsApp chats that you grant it access to, detects any upcoming events talked about in the conversation, and automatically sends an **SMS text message** to your **Google Fi** phone number via **Textbelt** (and/or a WhatsApp direct message).

---

## Features

- **Instant Google Fi SMS Delivery via Textbelt:**
  - The user simply enters their 10-digit **Google Fi** phone number (e.g. `555-123-4567` — automatically normalized to `+15551234567`) and clicks **Save Phone Number**.
  - Uses **[Textbelt](https://textbelt.com)** (`https://textbelt.com/text`) so real SMS text messages work immediately without any carrier A2P 10DLC paperwork.
- **Live WhatsApp Chat Access (QR Link):** Connect your WhatsApp account in seconds by scanning a QR code directly from the Web Dashboard (`@whiskeysockets/baileys`). Choose specific WhatsApp groups/chats to monitor or watch all chats.
- **Exported Chat Log Scanner (`.txt`):** Upload or paste exported WhatsApp `.txt` chat logs (supports both iOS and Android export formats) to scan past conversations for talked-about events.
- **Hybrid AI + NLP Event Detection:**
  - **AI Extraction (Optional):** Supports **Google Gemini** (`gemini-2.5-flash`) and **OpenAI** (`gpt-4o-mini`) with conversational context to extract event titles, dates/times, locations, categories, and summaries.
  - **Built-in Chrono NLP Rules (Zero-Config):** Works out-of-the-box without an API key using natural-language date/time parsing (`chrono-node`) and event-intent scoring.
  - **Smart Deduplication:** Fingerprints detected events so lively group threads don't send duplicate SMS alerts for the same event.

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Optional)

Copy `.env.example` to `.env` (set `TEXTBELT_API_KEY` to your Textbelt key, or leave `textbelt` for the built-in test tier):

```bash
cp .env.example .env
```

### 3. Start the Application

```bash
npm start
```

Open `http://localhost:3000` in your browser:

1. **Enter Your Google Fi Phone Number:** Type your 10-digit phone number (e.g. `555-123-4567`) and click **Save Phone Number**.
2. **Link WhatsApp (or Scan a Chat Log):** Click **Connect WhatsApp** to scan the pairing QR code from **WhatsApp → Linked Devices**, or click **Load Sample Phillips Chat** / **Upload `.txt` Export** to scan a conversation right away.
3. **Receive SMS Event Alerts:** Whenever an event is talked about in a monitored WhatsApp chat, the app extracts the event details (Title, Date/Time, Location, Chat, Sender) and texts your Google Fi phone number.

---

## Project Structure

- [`src/server.js`](./src/server.js) — Express server & REST API endpoints
- [`src/whatsapp.js`](./src/whatsapp.js) — Live WhatsApp Web client (`@whiskeysockets/baileys`), QR pairing, chat discovery, and direct messaging
- [`src/eventDetector.js`](./src/eventDetector.js) — Hybrid AI (Gemini / OpenAI) + Chrono NLP rule-based event extraction engine
- [`src/chatParser.js`](./src/chatParser.js) — Parser for iOS and Android WhatsApp `.txt` chat exports
- [`src/notifier.js`](./src/notifier.js) — Google Fi SMS notification dispatcher via Textbelt (`https://textbelt.com/text`) + optional WhatsApp DM
- [`src/store.js`](./src/store.js) — Persistent configuration and deduplicated event store
- [`public/`](./public) — Web dashboard (`index.html`, `styles.css`, `app.js`)
- [`test/notifier.test.js`](./test/notifier.test.js) — Automated unit & integration tests

---

## Running Tests

```bash
npm test
```