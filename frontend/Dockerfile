# IBVAP frontend — React + Vite, built statically then served by nginx.

# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Same-origin API + WebSocket in production: the gateway nginx proxies
# /api and /socket.io/ to the backend. Overridable via build args.
ARG VITE_API_BASE_URL=/api
ARG VITE_WS_URL=/

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_URL=$VITE_WS_URL

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci && npm cache clean --force

COPY frontend/ ./
RUN npm run build

# ── Stage 2: static runtime ─────────────────────────────────────
FROM nginx:1.28-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1
