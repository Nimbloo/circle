# syntax=docker/dockerfile:1

# Circle (Next.js 15 standalone SSR) — imagem para o EKS Nimbloo.
# Build precisa de egress para fonts.googleapis.com (Geist via next/font/google).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# Cache mount no store do pnpm: rebuilds só baixam pacote novo (sobrevive à invalidação
# da camada e ao builder prune limitado). package-import-method=copy evita erro de
# hardlink cross-device entre o store (cache mount) e o node_modules (layer).
RUN --mount=type=cache,id=circle-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store --config.package-import-method=copy

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* sao EMBUTIDOS no bundle do browser em tempo de build — definir so no
# runtime (chart) ativa Sentry no server/edge e deixa o CLIENTE mudo. Por isso entram
# como build arg. Vazio = SDK inerte, que e o default seguro.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_CIRCLE_ENV="production"
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_CIRCLE_ENV=$NEXT_PUBLIC_CIRCLE_ENV
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Cache mount no .next/cache: compilação incremental do Next entre builds. (Não vai pro
# runtime — standalone não copia .next/cache — é só aceleração de build.)
RUN --mount=type=cache,id=circle-next-cache,target=/app/.next/cache \
    pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nimbloo && adduser -u 1001 -S nimbloo -G nimbloo
# output: 'standalone' já empacota só o node_modules necessário.
COPY --from=build --chown=nimbloo:nimbloo /app/.next/standalone ./
COPY --from=build --chown=nimbloo:nimbloo /app/.next/static ./.next/static
COPY --from=build --chown=nimbloo:nimbloo /app/public ./public
# Migrations SQL (aplicadas no boot via instrumentation.ts com drizzle-orm/pg — deps de prod).
COPY --from=build --chown=nimbloo:nimbloo /app/db/migrations ./db/migrations
USER nimbloo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
   CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
