FROM node:22-slim

WORKDIR /app

# Copy package manifests first for layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src ./src
COPY public ./public

# Persistent volume directory for config.json, events.json, and WhatsApp session (wa-session/)
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "src/server.js"]
