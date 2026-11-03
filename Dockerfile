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
USER node
ENTRYPOINT ["node", "dist/main.js"]
