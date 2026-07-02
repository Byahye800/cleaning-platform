#!/bin/bash
cd "$(dirname "$0")/.."
export $(grep "^STRIPE_SECRET_KEY=" .env.local | xargs)
export STRIPE_API_KEY="$STRIPE_SECRET_KEY"
exec stripe listen --forward-to localhost:3002/api/stripe/webhook
