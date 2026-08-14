# Build context is the repo root: docker build -f server/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /build
ENV CI=true
# pnpm 11 ignores pnpm.onlyBuiltDependencies, and esbuild and sqlite need their scripts
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY packages/ts ./packages/ts
RUN cd packages/ts && pnpm install --ignore-workspace --frozen-lockfile && pnpm build

COPY server/package.json server/pnpm-lock.yaml ./server/
RUN cd server && pnpm install --ignore-workspace --frozen-lockfile
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY server/tsconfig.json ./server/

FROM node:22-bookworm-slim
WORKDIR /app
RUN useradd --uid 10001 --create-home foreseer && mkdir -p /data && chown foreseer:foreseer /data
COPY --from=build --chown=foreseer:foreseer /build/packages/ts ./packages/ts
COPY --from=build --chown=foreseer:foreseer /build/server ./server
WORKDIR /app/server
USER foreseer

ENV NODE_ENV=production
ENV PORT=8787
ENV FORESEER_DB=/data/foreseer.db
VOLUME ["/data"]
EXPOSE 8787

# Refuses to boot without FORESEER_ADMIN_KEY and FORESEER_TEE_KEY
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No package manager at runtime, tsx directly
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/main.ts"]
