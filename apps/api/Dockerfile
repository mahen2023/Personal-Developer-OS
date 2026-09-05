# Build context is the repo root — this is an npm workspace, so the lockfile and
# both package manifests must be present for a reproducible install.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# argon2 and the Prisma engines need a toolchain to build; it stays in this
# stage and never reaches the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @devos/api --include-workspace-root --ignore-scripts \
  && npm rebuild argon2 --foreground-scripts

FROM deps AS build
COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build --workspace @devos/api

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/storage && chown node:node /app/storage

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/package.json apps/api/
COPY package.json ./

WORKDIR /app/apps/api
USER node
EXPOSE 4000

# The container's own health signal; compose and any orchestrator read this.
HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
