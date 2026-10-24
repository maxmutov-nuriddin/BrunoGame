# Authoritative multiplayer server. The frontend is a static build (npm run build) served separately.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY server ./server
COPY tsconfig.json ./
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT:-8787}/health || exit 1
USER node
CMD ["npx", "tsx", "server/main.ts"]
