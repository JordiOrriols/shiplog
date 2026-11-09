# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=github_token,required=true \
    GITHUB_TOKEN="$(cat /run/secrets/github_token)" npm ci
COPY index.html index.css tsconfig.json vite.config.mjs ./
COPY src ./src
RUN npm run compile && npm run build

FROM nginx:1.28-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/shiplog
EXPOSE 80
