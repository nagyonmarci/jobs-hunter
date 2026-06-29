# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --include=dev --ignore-scripts; else npm install --include=dev --ignore-scripts; fi
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
FROM node:20-alpine AS app
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY package.json ./
COPY config ./config
COPY --from=build /app/dist/scripts ./scripts
COPY data ./data
COPY public ./public

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)"

ENTRYPOINT ["node"]
CMD ["scripts/import-server.js"]
