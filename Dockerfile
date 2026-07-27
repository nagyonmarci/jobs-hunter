# syntax=docker/dockerfile:1.7

FROM node:26-alpine3.22@sha256:c7932b9e5e337b0e733d6e16abc1b0e104759e8b05e59ed56586cce967d26dfe AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY tsconfig.json tsconfig.browser.json ./
COPY scripts ./scripts
COPY public ./public
RUN npx tsc && npx tsc -p tsconfig.browser.json

# Node application runtime (build target: app, also the default target)
FROM node:26-alpine3.22@sha256:c7932b9e5e337b0e733d6e16abc1b0e104759e8b05e59ed56586cce967d26dfe AS app
ENV NODE_ENV=production
WORKDIR /app

# hadolint ignore=DL3018
RUN addgroup -S app && adduser -S app -G app && \
    apk upgrade --no-cache && \
    apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont "expat>=2.8.2-r0"

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/dist/scripts ./scripts
COPY --from=build /app/public ./public
COPY config ./config
RUN mkdir -p /app/data/cvs && chown -R app:app /app/data

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4180/health || exit 1

ENTRYPOINT ["node"]
CMD ["scripts/import-server.js"]
