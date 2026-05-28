# syntax=docker/dockerfile:1.7

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --omit=dev --ignore-scripts; else npm install --omit=dev --ignore-scripts; fi

# Static admin UI served by nginx (build target: admin)
FROM nginx:1.27-alpine AS admin
COPY public /usr/share/nginx/html
COPY nginx/admin.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:80/admin.html || exit 1

# Node application runtime (build target: app, also the default target)
FROM node:26-alpine AS app
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY config ./config
COPY scripts ./scripts
COPY data ./data
COPY public ./public

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)"

ENTRYPOINT ["node"]
CMD ["scripts/import-server.mjs"]
