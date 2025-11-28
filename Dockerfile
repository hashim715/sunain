# ------------ BUILD STAGE ------------
FROM node:22.2.0 AS builder

WORKDIR /app

# Install OpenSSL for build stage
RUN apt-get update -y && apt-get install -y openssl

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) for build
RUN npm install

# Copy full source
COPY . .

# Prisma generate
RUN npx prisma generate

# Build project
RUN npm run build


# ------------ PRODUCTION STAGE ------------
FROM node:22.2.0-slim AS production

WORKDIR /app

# Install OpenSSL in production too (required at runtime)
RUN apt-get update -y && apt-get install -y openssl

# Only copy package.json for prod install
COPY package*.json ./

# Install ONLY production dependencies
RUN npm install --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy Prisma schema + generated client + engine
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Fix permissions
RUN chown -R node:node /app

USER node

EXPOSE 5001

# Run Prisma migrations first, then start app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
    