#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/davidscottballard1-png/Phillips_Whatsapp_Notifier.git"
APP_DIR="$HOME/Phillips_Whatsapp_Notifier"

echo "========================================================"
echo "  Phillips WhatsApp Notifier — 24/7 Cloud Installer"
echo "========================================================"

# 1. Ensure git is installed
if ! command -v git >/dev/null 2>&1; then
  echo "[1/5] Installing git..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y && sudo apt-get install -y git curl
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y git curl
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y git curl
  fi
else
  echo "[1/5] git is already installed."
fi

# 2. Ensure Docker is installed and running
if ! command -v docker >/dev/null 2>&1; then
  echo "[2/5] Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo systemctl enable --now docker || true
else
  echo "[2/5] Docker is already installed."
  sudo systemctl start docker || true
fi

# 3. Clone or update repository
if [ -d "$APP_DIR/.git" ]; then
  echo "[3/5] Updating existing repo in $APP_DIR..."
  git -C "$APP_DIR" pull --ff-only
else
  echo "[3/5] Cloning repository into $APP_DIR..."
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
mkdir -p "$APP_DIR/data"

# 4. Build and start the 24/7 WhatsApp Notifier container
echo "[4/5] Building and starting Phillips WhatsApp Notifier (24/7 mode)..."
sudo docker build -t whatsapp-notifier .
sudo docker rm -f whatsapp-notifier >/dev/null 2>&1 || true
sudo docker run -d \
  --name whatsapp-notifier \
  --restart always \
  -p 3000:3000 \
  -v "$APP_DIR/data:/app/data" \
  whatsapp-notifier

# 5. Start Cloudflare HTTPS Tunnel (bypasses Oracle/GCP firewall rules automatically)
echo "[5/5] Starting Cloudflare HTTPS Tunnel..."
sudo docker rm -f whatsapp-tunnel >/dev/null 2>&1 || true
sudo docker run -d \
  --name whatsapp-tunnel \
  --restart always \
  --network host \
  cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://localhost:3000

echo "Waiting for your public HTTPS link to generate..."
TUNNEL_URL=""
for i in $(seq 1 20); do
  TUNNEL_URL=$(sudo docker logs whatsapp-tunnel 2>&1 | grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' | head -n 1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 2
done

echo ""
echo "========================================================"
echo "  SUCCESS! Phillips WhatsApp Notifier is running 24/7"
echo "========================================================"
if [ -n "$TUNNEL_URL" ]; then
  echo ""
  echo "  Send this HTTPS link to your friend:"
  echo "  👉  $TUNNEL_URL"
  echo ""
else
  echo ""
  echo "  Run this command in a few seconds to view your HTTPS link:"
  echo "  sudo docker logs whatsapp-tunnel 2>&1 | grep -o 'https://[-a-z0-9]*\.trycloudflare\.com'"
  echo ""
fi
echo "  Persistent data (WhatsApp session & phone settings) is saved in:"
echo "  $APP_DIR/data"
echo "========================================================"
