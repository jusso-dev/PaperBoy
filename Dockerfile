# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_HOME=/usr/local/share/corepack \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN mkdir -p "$COREPACK_HOME" && \
    corepack enable && \
    corepack prepare pnpm@10.33.0 --activate && \
    chmod -R a+rX "$COREPACK_HOME"

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=paperboy-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN BETTER_AUTH_SECRET=paperboy-container-build-only-secret \
    BETTER_AUTH_URL=http://127.0.0.1:3000 \
    DATABASE_URL=postgres://paperboy:paperboy@127.0.0.1:5432/paperboy \
    pnpm build

FROM dependencies AS production-dependencies

RUN pnpm prune --prod

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

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/next.config.ts /app/package.json /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/src ./src

USER node

EXPOSE 3000

CMD ["pnpm", "start"]
