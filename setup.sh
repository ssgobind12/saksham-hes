#!/usr/bin/env bash
# ==============================================================================
# SAKSHAM-145 HES Server Automated VPS Setup Script for ssgobind.space
# Automates Steps 1 through 14 (UFW, Node.js, PM2, Caddy, SSL, App Deployment)
# ==============================================================================

set -e

echo "=========================================================="
echo " ⚡ Setting up SAKSHAM-145 HES Server on ssgobind.space"
echo "=========================================================="

# Check if root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run this script with sudo or as root: sudo ./setup.sh"
  exit 1
fi

echo "📦 Step 1 & 2: Updating packages & Configuring Firewall..."
apt update && apt upgrade -y
apt install -y ufw curl git debian-keyring debian-archive-keyring apt-transport-https

# Configure UFW
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "🟢 Step 3 & 4: Installing Node.js LTS & PM2..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

echo "Node version: $(node -v)"
echo "NPM version:  $(npm -v)"

npm install -g pm2

echo "🔒 Step 5: Installing Caddy Web Server (with Automatic SSL)..."
if ! command -v caddy &> /dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt update
  apt install -y caddy
fi

echo "📁 Step 7: Preparing Application Directory /var/www/ssgobind..."
mkdir -p /var/www/ssgobind/server
mkdir -p /var/log/pm2
mkdir -p /var/log/caddy

# Copy files from current directory to /var/www/ssgobind/server if running locally
if [ -f "server.js" ]; then
  cp -r . /var/www/ssgobind/server/
fi

cd /var/www/ssgobind/server
npm install --production

# Step 8: Prepare .env if not exists
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
  else
    cat <<EOF > .env
NODE_ENV=production
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "saksham145-jwt-secret-key-2026")
ALLOWED_ORIGINS=https://ssgobind.space,https://www.ssgobind.space,http://localhost:3000
EOF
  fi
  echo "✅ Created default .env file in /var/www/ssgobind/server/.env"
fi

echo "🚀 Step 9 & 10: Starting Application with PM2..."
pm2 delete ssgobind-server 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root || true

echo "🌐 Step 11: Configuring Caddy Reverse Proxy..."
if [ -f "Caddyfile" ]; then
  cp Caddyfile /etc/caddy/Caddyfile
fi
systemctl reload caddy || systemctl restart caddy

echo "=========================================================="
echo " 🎉 SETUP COMPLETED SUCCESSFULLY!"
echo "=========================================================="
echo " 🌐 Web Portal:    https://ssgobind.space"
echo " 🩺 Health Check:  https://ssgobind.space/api/health"
echo " 👥 Default Admin: admin / admin123 (or check .env)"
echo ""
echo " Check PM2 status:    pm2 status"
echo " Check PM2 logs:      pm2 logs ssgobind-server"
echo " Check Caddy status:  systemctl status caddy"
echo "=========================================================="
