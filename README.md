# Phillips WhatsApp Notifier — Google Pixel 10 Edition & Android APK

**Phillips WhatsApp Notifier** scans WhatsApp chats that you grant it access to, detects any upcoming events talked about in the conversation, and automatically sends an **SMS text message** to your **Google Fi** phone number on your **Google Pixel 10** via **Textbelt** and/or **Native Pixel 10 Google Fi SIM (`SmsManager`)**.

---

## Google Pixel 10 Optimizations & Downloadable APK

- **Signed Downloadable Android APK (`Phillips-WhatsApp-Notifier-Pixel10.apk`):**
  - Package: `com.phillips.whatsappnotifier.pixel10` (`v2.0.0-pixel10`, signed with APK Signature Scheme v2 + v3)
  - Download directly from the web dashboard (`GET /api/apk/download` or `/phillips-whatsapp-notifier-pixel10.apk`) or from the repository root (`Phillips-WhatsApp-Notifier-Pixel10.apk`).
- **On-Device Pixel 10 WhatsApp Notification Listener (`WhatsAppNotificationService`):**
  - Intercepts incoming WhatsApp (`com.whatsapp`) and WhatsApp Business (`com.whatsapp.w4b`) notifications directly on your Pixel 10 in real time—no second phone required.
- **Same-Phone 8-Digit WhatsApp Pairing Code:**
  - Link WhatsApp directly on your Pixel 10 using an 8-character pairing code (`WhatsApp → Linked Devices → Link with phone number instead`) without needing to point your camera at your own screen to scan a QR code.
- **Pixel 10 Android Share Sheet Integration:**
  - In WhatsApp on your Pixel 10, tap **More → Export chat → Without media** and select **Phillips WhatsApp Notifier** directly from the Android Share Sheet to scan the conversation immediately.
- **6.3" Actua OLED 120Hz Display & Material 3 Ergonomics:**
  - Configured for the Pixel 10's `1080 × 2424` (`412 × 915 dp`, `20:9`) Actua OLED display with `120Hz` Smooth Display refresh rate, punch-hole cutout & gesture bar safe-area insets, **Actua OLED True-Black Dark Mode**, and a one-handed **Material 3 Bottom Navigation Bar**.
- **Google Fi SMS + 1-Tap Google Calendar Integration:**
  - Delivers SMS alerts via **Textbelt** (`https://textbelt.com/text`) and native Pixel 10 `SmsManager`, plus 1-tap **+ Pixel Calendar** export (`CalendarContract` intent & `.ics` download).

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Signed Pixel 10 APK (Optional — Pre-built APK Included)

```bash
npm run build:apk
```

### 3. Start the Application

```bash
npm start
```

Open `http://localhost:3000`:

1. **Download the Pixel 10 APK:** Click **Download Pixel 10 APK** in the header (or scan the download QR code with your Pixel 10 camera) to install `Phillips-WhatsApp-Notifier-Pixel10.apk`.
2. **Enter Your Google Fi Phone Number:** Type your 10-digit phone number (e.g. `555-123-4567`) and click **Save Phone Number**.
3. **Link WhatsApp on Your Pixel 10:**
   - Enable **Pixel 10 Notification Access** inside the APK for automatic on-device WhatsApp scanning, **OR**
   - Click **Get 8-Digit Pairing Code (Pixel 10)** to link WhatsApp Web on the same phone, **OR**
   - Share an exported `.txt` chat log from WhatsApp or click **Load Sample Phillips Chat**.

---

## Project Structure

- [`Phillips-WhatsApp-Notifier-Pixel10.apk`](./Phillips-WhatsApp-Notifier-Pixel10.apk) — Compiled, zipaligned, and signed Android APK for Google Pixel 10
- [`android/`](./android) — Native Android source (`AndroidManifest.xml`, `MainActivity.java`, `Pixel10Bridge.java`, `WhatsAppNotificationService.java`, and resources)
- [`scripts/build-apk.sh`](./scripts/build-apk.sh) — Reproducible Android SDK build pipeline (`aapt2`, `javac`, `d8`, `zipalign`, `apksigner`)
- [`src/server.js`](./src/server.js) — Express server, REST API, APK download/metadata endpoints, and `.ics` calendar generator
- [`src/whatsapp.js`](./src/whatsapp.js) — Live WhatsApp Web client (`@whiskeysockets/baileys`), same-phone 8-digit pairing code, QR pairing, and Pixel 10 notification ingestion
- [`src/eventDetector.js`](./src/eventDetector.js) — Hybrid AI (Gemini 2.5 Flash / OpenAI) + Chrono NLP event extraction engine
- [`src/chatParser.js`](./src/chatParser.js) — Parser for Android and iOS WhatsApp `.txt` chat exports
- [`src/notifier.js`](./src/notifier.js) — Google Fi SMS notification dispatcher via Textbelt (`https://textbelt.com/text`) + optional WhatsApp DM
- [`src/store.js`](./src/store.js) — Persistent configuration and deduplicated event store
- [`public/`](./public) — Pixel 10 Web & APK UI (`index.html`, `styles.css`, `app.js`, `manifest.json`, `phillips-whatsapp-notifier-pixel10.apk`)
- [`test/notifier.test.js`](./test/notifier.test.js) — Automated unit & integration tests

---

## Running Tests

```bash
npm test
```