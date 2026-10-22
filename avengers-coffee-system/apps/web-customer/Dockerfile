FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=http://localhost:3000
ARG VITE_SOCKET_URL=http://localhost:3005
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_RECAPTCHA_SITE_KEY=
ARG VITE_MAPBOX_ACCESS_TOKEN=
ARG VITE_VIETMAP_API_KEY=
ARG VITE_VIETMAP_TILE_KEY=
ARG VITE_FACEBOOK_APP_ID=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ENV VITE_RECAPTCHA_SITE_KEY=${VITE_RECAPTCHA_SITE_KEY}
ENV VITE_MAPBOX_ACCESS_TOKEN=${VITE_MAPBOX_ACCESS_TOKEN}
ENV VITE_VIETMAP_API_KEY=${VITE_VIETMAP_API_KEY}
ENV VITE_VIETMAP_TILE_KEY=${VITE_VIETMAP_TILE_KEY}
ENV VITE_FACEBOOK_APP_ID=${VITE_FACEBOOK_APP_ID}

COPY package*.json ./
RUN npm ci
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
