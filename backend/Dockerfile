# Debian-based (not Alpine): Prisma 5 engines need OpenSSL 3 (libssl.so.3),
# which Alpine's musl images no longer satisfy (libssl.so.1.1 missing).
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
# NOTE: backend is an npm workspace of the repo root, so the root
# package-lock.json is the source of truth. This image installs from
# backend/package.json directly (post-MVP: switch to root-context build + npm ci).
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
COPY scripts ./scripts
RUN npm run build
EXPOSE 4000
# Migrate and seed on boot so fresh volumes/deploys always have tables and test accounts.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/src/index.js"]
