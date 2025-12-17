# ------------ BUILD STAGE ------------
FROM node:22.2.0 AS builder

WORKDIR /app

# Install OpenSSL for build stage
RUN apt-get update -y && apt-get install -y openssl && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) for build
RUN npm cache clean --force
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

# Install OpenSSL in production (required at runtime)
RUN apt-get update -y && apt-get install -y openssl && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm cache clean --force
RUN npm install --omit=dev

# Copy complete Twilio package from builder (it's broken when reinstalled)
COPY --from=builder /app/node_modules/twilio ./node_modules/twilio
# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy Prisma schema + generated client + migrations folder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Copy migration script
COPY scripts/migrate-and-start.sh ./scripts/
RUN chmod +x ./scripts/migrate-and-start.sh

# Fix permissions
RUN chown -R node:node /app

USER node

EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5001/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run migrations with retry logic, then start app
CMD ["./scripts/migrate-and-start.sh"]