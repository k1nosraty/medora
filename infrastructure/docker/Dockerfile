FROM public.ecr.aws/docker/library/node:24.18.0-bookworm AS build
WORKDIR /app
RUN npm install -g pnpm@10.32.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm --filter @medora/api deploy --prod --legacy /service

FROM public.ecr.aws/docker/library/node:24.18.0-bookworm-slim AS api
WORKDIR /service
COPY --from=build /service /service
COPY --from=build /app/apps/api/dist /service/dist
COPY scripts/migration /service/scripts/migration
COPY migrations/server /service/migrations/server
USER node
CMD ["sh","-c","node scripts/migration/apply.mjs && exec node dist/server.mjs"]

FROM caddy:2.11.7-alpine AS web
COPY --from=build /app/apps/web/dist /srv
COPY infrastructure/docker/Caddyfile /etc/caddy/Caddyfile
