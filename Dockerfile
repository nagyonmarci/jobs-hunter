# syntax=docker/dockerfile:1.7

FROM node:26-alpine3.22 AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts; fi
COPY tsconfig.json ./
COPY scripts ./scripts
RUN npx tsc

# Static admin UI served by nginx (build target: admin)
FROM nginx:1.31-alpine AS admin
COPY public /usr/share/nginx/html
COPY nginx/admin.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:80/admin.html || exit 1

# Node application runtime (build target: app, also the default target)
FROM node:26-alpine3.22 AS app
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

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --omit=dev --ignore-scripts; else npm install --omit=dev --ignore-scripts; fi
COPY --from=build /app/dist/scripts ./scripts
COPY config ./config
RUN mkdir -p /app/data

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4180/health || exit 1

ENTRYPOINT ["node"]
CMD ["scripts/import-server.js"]
