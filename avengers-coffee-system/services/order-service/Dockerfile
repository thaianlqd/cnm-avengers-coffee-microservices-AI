FROM node:20-alpine AS builder
WORKDIR /app
# cache buster

RUN npm config set registry https://registry.npmmirror.com \
    && npm config set fetch-timeout 300000 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com \
    && npm config set fetch-timeout 300000 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3005
CMD ["node", "dist/main"]

# ─── DEV stage: hot-reload với ts-node + watch ───
FROM node:20-alpine AS dev
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com \
    && npm config set fetch-timeout 300000

COPY package*.json ./
RUN npm install

COPY tsconfig*.json nest-cli.json ./

EXPOSE 3005
CMD ["npx", "nest", "start", "--watch"]