FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_SOCKET_URL=http://localhost:3005
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}

COPY package*.json ./
RUN npm install
RUN sha256sum package-lock.json | cut -d ' ' -f 1 > node_modules/.avengers-package-lock-sha256

COPY . .
COPY dev-entrypoint.sh /usr/local/bin/avengers-web-dev-entrypoint
RUN chmod +x /usr/local/bin/avengers-web-dev-entrypoint
RUN npm run build
ENTRYPOINT ["/usr/local/bin/avengers-web-dev-entrypoint"]

FROM nginx:1.27-alpine AS runner
WORKDIR /usr/share/nginx/html

COPY --from=builder /app/dist ./
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
