# syntax=docker/dockerfile:1.7

FROM oven/bun:1.4.0-debian@sha256:5bb0f9be3a1a36a03e27c9a9dd894a3b1ad26657155c7df4dda771e17bf872ef AS base

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

FROM base AS dependencies

COPY package.json bun.lock ./
COPY packages/sdk/package.json ./packages/sdk/package.json
RUN --mount=type=cache,id=paperboy-bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN BETTER_AUTH_SECRET=paperboy-container-build-only-secret \
    BETTER_AUTH_URL=http://127.0.0.1:3000 \
    DATABASE_URL=postgres://paperboy:paperboy@127.0.0.1:5432/paperboy \
    bun --bun next build

FROM base AS production-dependencies

COPY package.json bun.lock ./
COPY packages/sdk/package.json ./packages/sdk/package.json
RUN --mount=type=cache,id=paperboy-bun-production,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

FROM base AS runtime

ENV HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000 \
    PAPERBOY_DEFAULT_TIME_ZONE=Australia/Sydney \
    PAPERBOY_FIXED_TIME_ZONE=Australia/Sydney \
    TZ=Australia/Sydney

WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/jusso-dev/PaperBoy"

COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/.next ./.next
COPY --from=build --chown=bun:bun /app/drizzle ./drizzle
COPY --from=build --chown=bun:bun /app/bun.lock /app/next.config.ts /app/package.json /app/tsconfig.json ./
COPY --from=build --chown=bun:bun /app/src ./src

USER bun

EXPOSE 3000

CMD ["bun", "--no-install", "--bun", "next", "start"]
