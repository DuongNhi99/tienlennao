#!/bin/sh
# One-time preparation of a fresh Ubuntu 22.04/24.04 server (run as root):
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/deploy/setup-server.sh \
#     | sh -s -- tienlen.example you@example.com
# Installs Docker, a firewall (SSH, HTTP, HTTPS), swap and automatic security updates; creates
# the `deploy` user and /opt/tienlen/.env with a random database password; and prints the SSH
# key the Deploy workflow uses (store it as the DEPLOY_SSH_KEY repository secret).
set -eu

DOMAIN=${1:?usage: setup-server.sh <domain> <email for HTTPS certificates>}
EMAIL=${2:?usage: setup-server.sh <domain> <email for HTTPS certificates>}
APP_DIR=/opt/tienlen

[ "$(id -u)" -eq 0 ] || { echo 'Run as root.' >&2; exit 1; }

echo '==> Packages, automatic security updates, firewall'
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl openssl ufw unattended-upgrades
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo '==> Docker'
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo '==> Swap (2 GB) for small servers'
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo '==> deploy user and SSH key for GitHub Actions'
if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
keydir=$(mktemp -d)
ssh-keygen -q -t ed25519 -N '' -C 'github-actions-deploy' -f "$keydir/key"
cat "$keydir/key.pub" >>/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "==> $APP_DIR"
install -d -o deploy -g deploy "$APP_DIR" "$APP_DIR/backups"
if [ ! -f "$APP_DIR/.env" ]; then
  cat >"$APP_DIR/.env" <<EOF
# Production settings (see deploy/.env.example in the repository for every option).
APP_DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BACKUP_KEEP_DAYS=14
# Email for account verification and password reset (uncomment and fill in):
# SMTP_URL=smtps://user:password@smtp.example.com:465
# MAIL_FROM=Tiến Lên Online <no-reply@$DOMAIN>
EOF
  chown deploy:deploy "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

cat <<EOF

Server ready. Next steps (docs/DEPLOYMENT.md, "Quick start"):
 1. DNS: an A record for $DOMAIN pointing at this server's public IP.
 2. GitHub → Settings → Secrets and variables → Actions:
      variable APP_DOMAIN     = $DOMAIN
      secret   DEPLOY_HOST    = this server's IP address or hostname
      secret   DEPLOY_SSH_KEY = the whole private key below
 3. Push to main (or run the Deploy workflow by hand).

----- DEPLOY_SSH_KEY (shown once; not stored on this server) -----
$(cat "$keydir/key")
-------------------------------------------------------------------
EOF
rm -rf "$keydir"
