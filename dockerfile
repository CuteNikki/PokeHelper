FROM oven/bun:1-alpine AS base
WORKDIR /app

COPY package.json bun.lock* ./

COPY prisma ./prisma/

RUN bun install --frozen-lockfile --production

RUN bunx prisma generate

COPY . .

CMD ["bun", "run", "src/index.ts"]