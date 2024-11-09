FROM node:22-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/domain ./packages/domain
COPY apps/api ./apps/api

RUN pnpm --filter @groups/domain build
RUN pnpm --filter @groups/api build

FROM node:22-alpine AS runner

WORKDIR /app
RUN npm install -g pnpm

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/domain/dist ./packages/domain/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/db ./apps/api/db

EXPOSE 3001

CMD ["node", "apps/api/dist/server.js"]
