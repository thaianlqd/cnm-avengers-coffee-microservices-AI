FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ARG VITE_API_URL=http://localhost:3000
ARG VITE_SOCKET_URL=http://localhost:3005

RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY server.js ./server.js

EXPOSE 80

CMD ["node", "server.js"]
