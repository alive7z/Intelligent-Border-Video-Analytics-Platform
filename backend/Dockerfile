# IBVAP backend — Node.js + Express + Socket.IO
# Build context is the repository root so `database/` is available for the
# migration runner (backend/src/db/migrate.js resolves ../../../database).
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies only (package-lock.json is committed).
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source + shared migration/schema files. Tests, local environment
# files and node_modules are intentionally excluded from the runtime image.
COPY backend/src/ ./src/
COPY database/ /database/

# Non-root runtime user (fixed uid so shared evidence storage is readable by the
# AI engine too; deploy scripts chown ./storage to uid 10001).
RUN addgroup -S -g 10001 ibvap && adduser -S -u 10001 -G ibvap ibvap \
  && chown -R ibvap:ibvap /app

USER ibvap

EXPOSE 5001

HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=6 \
  CMD wget -qO- http://127.0.0.1:5001/api/health || exit 1

CMD ["npm", "start"]
