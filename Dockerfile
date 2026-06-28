# syntax=docker/dockerfile:1.7

FROM node:20-alpine3.22 AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --omit=dev --ignore-scripts; else npm install --omit=dev --ignore-scripts; fi

# Node application runtime (build target: app, also the default target)
FROM node:20-alpine3.22 AS app
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY config ./config
COPY scripts ./scripts
RUN mkdir -p /app/data

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4180/health || exit 1

ENTRYPOINT ["node"]
CMD ["scripts/import-server.mjs"]
