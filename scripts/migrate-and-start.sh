#!/bin/sh
set -e

echo "🔄 Running database migrations..."

MAX_RETRIES=5
RETRY_COUNT=0

until npx prisma migrate deploy || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "⚠️ Migration failed. Retry $RETRY_COUNT/$MAX_RETRIES in 5 seconds..."
  sleep 5
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "❌ Migrations failed after $MAX_RETRIES attempts"
  exit 1
fi

echo "✅ Migrations completed successfully"

# Start the application
echo "🚀 Starting application..."
exec node dist/index.js