# .node-version と同じ版に固定する。.node-version を上げるときは、ここも一緒に上げる
FROM node:24.22.1-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY main.ts ./
COPY src ./src
RUN npm run build

FROM node:24.22.1-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# 公式 node イメージの node ユーザー（UID/GID 1000）。hadolint DL3066 に従い数値で指定する
USER 1000:1000
ENTRYPOINT ["node", "dist/main.js"]
