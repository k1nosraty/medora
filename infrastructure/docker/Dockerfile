FROM public.ecr.aws/docker/library/node:24.18.0-bookworm AS build
WORKDIR /app
RUN npm install -g pnpm@10.32.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY web/package*.json web/
RUN npm ci --prefix web
COPY . .
RUN pnpm build

FROM build AS api-dependencies
WORKDIR /service
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm --filter @medora/api... install --prod --offline --frozen-lockfile --ignore-scripts

FROM public.ecr.aws/docker/library/node:24.18.0-bookworm-slim AS api
COPY --from=api-dependencies /service /service
WORKDIR /service/apps/api
COPY --from=build /app/apps/api/dist ./dist
COPY scripts/migration/apply.mjs ./scripts/migration/apply.mjs
COPY migrations/server ./migrations/server
USER node
CMD ["sh","-c","node scripts/migration/apply.mjs && exec node dist/server.mjs"]

FROM public.ecr.aws/docker/library/node:24.18.0-bookworm-slim AS compatibility-fixture
WORKDIR /app
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /app/web/node_modules web/node_modules
COPY web/package.json web/package.json
COPY web/scripts/fixture-service.mjs web/scripts/fixture-service.mjs
COPY web/src web/src
COPY web/public/medication/domain web/public/medication/domain
COPY web/public/medication/shared/crypto web/public/medication/shared/crypto
COPY infrastructure/cloudflare/local.json infrastructure/cloudflare/local.json
RUN mkdir -p /state && chown node:node /state
USER node
CMD ["node","web/scripts/fixture-service.mjs"]

FROM caddy:2.11.7-alpine AS web
COPY --from=build /app/apps/web/dist /srv
COPY infrastructure/docker/Caddyfile /etc/caddy/Caddyfile
