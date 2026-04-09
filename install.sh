#!/bin/bash
# ================================================================
# Autostalling De Bazuin — Installatiescript
# Getest op Ubuntu 22.04 LTS / Debian 12
# Voer uit als root of met sudo: bash install.sh
# ================================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════╗"
echo "║  Autostalling De Bazuin — Installatie        ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Systeemvereisten ────────────────────────────────────────
info "Systeem updaten..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx postgresql postgresql-contrib

# ── 2. Node.js 20 ─────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  info "Node.js 20 installeren..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
ok "Node.js $(node -v) geïnstalleerd"

# ── 3. PostgreSQL database aanmaken ───────────────────────────
info "Database aanmaken..."
DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
sudo -u postgres psql -c "CREATE USER bazuin WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE bazuin_pms OWNER bazuin;" 2>/dev/null || true
sudo -u postgres psql -d bazuin_pms -f "$(dirname "$0")/backend/migrations/001_initial_schema.sql" -q
sudo -u postgres psql -d bazuin_pms -f "$(dirname "$0")/backend/migrations/002_seed_data.sql" -q
ok "Database aangemaakt: bazuin_pms"

# ── 4. .env aanmaken ──────────────────────────────────────────
info "Omgevingsvariabelen instellen..."
INSTALL_DIR="$(dirname "$0")"

JWT_SECRET=$(openssl rand -base64 48)
JWT_REFRESH_SECRET=$(openssl rand -base64 48)

if [ ! -f "$INSTALL_DIR/backend/.env" ]; then
  cat > "$INSTALL_DIR/backend/.env" << EOF
DATABASE_URL=postgresql://bazuin:${DB_PASSWORD}@localhost:5432/bazuin_pms
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
STRIPE_SECRET_KEY=sk_live_VERVANG_DIT
STRIPE_PUBLISHABLE_KEY=pk_live_VERVANG_DIT
STRIPE_WEBHOOK_SECRET=whsec_VERVANG_DIT
SMTP_HOST=smtp.VERVANG_DIT.nl
SMTP_PORT=587
SMTP_USER=info@autostallingdebazuin.nl
SMTP_PASS=VERVANG_DIT
EMAIL_FROM_ADDRESS=info@autostallingdebazuin.nl
FRONTEND_BOOKING_URL=https://parkeren-harlingen.nl
FRONTEND_ADMIN_URL=https://admin.autostallingdebazuin.nl
API_URL=https://api.autostallingdebazuin.nl
NODE_ENV=production
PORT=3001
EOF
  warn ".env aangemaakt — VERVANG de Stripe en SMTP waarden in backend/.env"
fi

# ── 5. Pakketten installeren ───────────────────────────────────
info "Backend dependencies installeren..."
cd "$INSTALL_DIR/backend" && npm ci --silent

info "Admin dashboard dependencies installeren..."
cd "$INSTALL_DIR/frontend-admin" && npm ci --silent

info "Klantportal dependencies installeren..."
cd "$INSTALL_DIR/frontend-booking" && npm ci --silent

# ── 6. Builden ─────────────────────────────────────────────────
info "Backend bouwen..."
cd "$INSTALL_DIR/backend" && npm run build

info "Admin dashboard bouwen..."
cd "$INSTALL_DIR/frontend-admin" && NEXT_PUBLIC_API_URL=https://api.autostallingdebazuin.nl/api/v1 npm run build

info "Klantportal bouwen..."
cd "$INSTALL_DIR/frontend-booking" && NEXT_PUBLIC_API_URL=https://api.autostallingdebazuin.nl/api/v1 npm run build

# ── 7. PM2 process manager ────────────────────────────────────
info "PM2 installeren..."
npm install -g pm2 --silent

cd "$INSTALL_DIR"

# PM2 ecosystem config
cat > ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [
    {
      name: 'bazuin-api',
      cwd: './backend',
      script: 'dist/index.js',
      env_file: './backend/.env',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'bazuin-booking',
      cwd: './frontend-booking',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://api.autostallingdebazuin.nl/api/v1' },
      instances: 1,
      autorestart: true,
    },
    {
      name: 'bazuin-admin',
      cwd: './frontend-admin',
      script: 'node_modules/.bin/next',
      args: 'start -p 3002',
      env: { NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://api.autostallingdebazuin.nl/api/v1' },
      instances: 1,
      autorestart: true,
    },
  ],
};
PMEOF

pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash 2>/dev/null || true

# ── 8. Nginx ──────────────────────────────────────────────────
info "Nginx configureren..."
cp "$INSTALL_DIR/nginx/nginx.conf" /etc/nginx/sites-available/bazuin
ln -sf /etc/nginx/sites-available/bazuin /etc/nginx/sites-enabled/bazuin
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "Nginx geconfigureerd"

# ── 9. SSL (Let's Encrypt) ────────────────────────────────────
warn "SSL certificaten aanvragen — zorg dat DNS al wijst naar dit IP-adres!"
read -p "Domeinen geconfigureerd? (j/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Jj]$ ]]; then
  certbot --nginx \
    -d parkeren-harlingen.nl \
    -d www.parkeren-harlingen.nl \
    -d autostallingdebazuin.nl \
    -d api.autostallingdebazuin.nl \
    -d admin.autostallingdebazuin.nl \
    --non-interactive --agree-tos --email info@autostallingdebazuin.nl
  ok "SSL certificaten aangevraagd"
else
  warn "SSL overgeslagen — voer later handmatig 'certbot --nginx' uit"
fi

# ── Klaar ──────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Installatie voltooid!                           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Klantportal:    https://parkeren-harlingen.nl"
echo "  API:            https://api.autostallingdebazuin.nl"
echo "  Admin:          https://admin.autostallingdebazuin.nl/login"
echo ""
echo -e "${YELLOW}  VERPLICHT — doe dit nu:${NC}"
echo "  1. Bewerk backend/.env — vul Stripe sleutels in"
echo "  2. Bewerk backend/.env — vul SMTP gegevens in"
echo "  3. Wijzig het admin wachtwoord via de login pagina"
echo "  4. Configureer Stripe webhook URL:"
echo "     https://api.autostallingdebazuin.nl/api/v1/payments/webhook"
echo ""
echo "  Handig:"
echo "  pm2 status          — bekijk draaiende processen"
echo "  pm2 logs bazuin-api — bekijk API logs"
echo "  pm2 restart all     — herstart na .env aanpassing"
echo ""
