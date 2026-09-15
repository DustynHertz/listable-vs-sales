FROM node:22-alpine AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --omit=dev
COPY api/ ./api/
COPY --from=web-build /app/web/dist ./web/dist
WORKDIR /app/api
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
