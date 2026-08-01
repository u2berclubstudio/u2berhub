#!/usr/bin/env bash
# One-shot deploy: U2berClub Tools hub on a fresh Ubuntu VPS. Run as root.
# Usage: bash deploy-vps.sh <domain> <ssl-email> <admin-email> <admin-password>
set -euo pipefail
DOMAIN="${1:-}"; EMAIL="${2:-}"; ADMIN_EMAIL="${3:-}"; ADMIN_PASSWORD="${4:-}"
if [[ -z "$DOMAIN" || -z "$EMAIL" || -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  echo "usage: bash deploy-vps.sh <domain> <ssl-email> <admin-email> <admin-password>"; exit 1
fi
APP_DIR="/opt/u2berhub"
DB_PASS="$(openssl rand -hex 16)"

echo "==> 1/8 Packages"; apt-get update -y; apt-get install -y curl nginx postgresql postgresql-contrib
echo "==> 2/8 Node 20"
command -v node >/dev/null 2>&1 || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y nodejs; }
npm install -g pm2 >/dev/null 2>&1

echo "==> 3/8 Postgres database + user"
systemctl enable --now postgresql
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='u2ber'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER u2ber WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='u2berhub'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE u2berhub OWNER u2ber;"
sudo -u postgres psql -d u2berhub -c "GRANT ALL ON SCHEMA public TO u2ber;" || true
DB_URL="postgres://u2ber:$DB_PASS@localhost:5432/u2berhub"

echo "==> 4/8 App files -> $APP_DIR"
mkdir -p "$APP_DIR"; SRC="$(cd "$(dirname "$0")" && pwd)"
cp -r "$SRC"/. "$APP_DIR"/ 2>/dev/null || true
cd "$APP_DIR"

echo "==> 5/8 Install + build (server + client)"
npm install
npm run build   # builds the React client into client/dist

echo "==> 6/8 Start with PM2"
DATABASE_URL="$DB_URL" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  pm2 delete u2berhub >/dev/null 2>&1 || true
DATABASE_URL="$DB_URL" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_NAME="Admin" \
  pm2 start server/index.js --name u2berhub --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
# persist env for restarts
pm2 set pm2:autodump true >/dev/null 2>&1 || true

echo "==> 7/8 Nginx for $DOMAIN"
cat > /etc/nginx/sites-available/u2berhub << NGINX
server {
    listen 80; server_name $DOMAIN;
    client_max_body_size 25M;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/u2berhub /etc/nginx/sites-enabled/u2berhub
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> 8/8 HTTPS"
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || \
  echo "   SSL skipped — point $DOMAIN's DNS here, then: certbot --nginx -d $DOMAIN"

echo
echo "======================================================"
echo "  DONE  ->  https://$DOMAIN"
echo "  Admin login: $ADMIN_EMAIL  (the password you passed in)"
echo "  DB password (save it): $DB_PASS"
echo "  Update later: cd $APP_DIR && git pull && npm run build && pm2 restart u2berhub"
echo "======================================================"
