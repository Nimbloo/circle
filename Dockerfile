# syntax=docker/dockerfile:1

# Circle (Next.js 15 standalone SSR) — imagem para o EKS Nimbloo.
# Build precisa de egress para fonts.googleapis.com (Geist via next/font/google).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

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
USER nimbloo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
   CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
