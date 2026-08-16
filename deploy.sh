#!/usr/bin/env bash
# ==============================================================================
# SAKSHAM-145 Quick Deploy / Update Script for ssgobind.space (Step 14)
# ==============================================================================

set -e

echo "🔄 Deploying updates to ssgobind.space..."
cd /var/www/ssgobind/server

if [ -d ".git" ]; then
  git pull
fi

npm install --production
pm2 restart ssgobind-server

echo "✅ App restarted with latest updates!"
pm2 status ssgobind-server
