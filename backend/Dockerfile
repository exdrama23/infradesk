FROM node:24-slim AS build
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS deps
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

RUN npm install -g prisma@^7

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=deps  /app/prisma ./prisma
COPY --from=deps  /app/prisma.config.ts ./
COPY package*.json ./

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]