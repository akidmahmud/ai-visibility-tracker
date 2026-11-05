# One image for api, worker and web: the monorepo is built once; each service runs a different command
# (see infra/docker-compose.prod.yml). Node 24 LTS: Prisma doesn't support odd-numbered Node releases.
FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @avt/db generate && pnpm turbo run build

FROM node:24-slim
ENV NODE_ENV=production PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000 4000
