FROM node:20-alpine AS builder
WORKDIR /app
# cache buster

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3005
CMD ["node", "dist/main"]

# ─── DEV stage: hot-reload với ts-node + watch ───
FROM node:20-alpine AS dev
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig*.json nest-cli.json ./

EXPOSE 3005
CMD ["npx", "nest", "start", "--watch"]