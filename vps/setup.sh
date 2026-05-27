#!/bin/bash
# NIRI MT5 Sync — VPS Setup Script
# Ubuntu 24.04 LTS — run as root: bash setup.sh
set -euo pipefail

APP_USER=niri
APP_DIR=/opt/niri-sync
WINEPREFIX_DIR=/home/$APP_USER/.wine-mt5
WINE_PYTHON=/home/$APP_USER/.wine-mt5/drive_c/Python39/python.exe

echo "=== [1/8] System packages ==="
apt-get update -qq
apt-get install -y --no-install-recommends \
    curl wget git unzip \
    python3 python3-pip python3-venv \
    xvfb x11-utils \
    nginx certbot python3-certbot-nginx \
    wine64 winbind winetricks \
    ufw

# Create app user if not exists
id -u $APP_USER &>/dev/null || useradd -m -s /bin/bash $APP_USER

echo "=== [2/8] Xvfb service ==="
cat > /etc/systemd/system/xvfb.service <<'EOF'
[Unit]
Description=X Virtual Framebuffer
After=network.target

[Service]
Type=simple
User=niri
ExecStart=/usr/bin/Xvfb :99 -screen 0 1024x768x24 -nolisten tcp
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now xvfb
sleep 3

echo "=== [3/8] Wine + Windows Python 3.9 ==="
export DISPLAY=:99
export WINEPREFIX=$WINEPREFIX_DIR
export WINEARCH=win64
export WINEDEBUG=-all

sudo -u $APP_USER bash -c "
  export DISPLAY=:99
  export WINEPREFIX=$WINEPREFIX_DIR
  export WINEARCH=win64
  export WINEDEBUG=-all
  wine wineboot --init
  winetricks -q vcrun2015 vcrun2019
"

PYTHON_INSTALLER=/tmp/python-3.9.13-amd64.exe
if [ ! -f $PYTHON_INSTALLER ]; then
    wget -q "https://www.python.org/ftp/python/3.9.13/python-3.9.13-amd64.exe" -O $PYTHON_INSTALLER
fi

sudo -u $APP_USER bash -c "
  export DISPLAY=:99
  export WINEPREFIX=$WINEPREFIX_DIR
  export WINEARCH=win64
  export WINEDEBUG=-all
  wine $PYTHON_INSTALLER /quiet InstallAllUsers=0 PrependPath=0 TargetDir='C:\\Python39'
"

sleep 5

echo "=== [4/8] MT5 Terminal in Wine ==="
MT5_INSTALLER=/tmp/mt5setup.exe
if [ ! -f $MT5_INSTALLER ]; then
    wget -q "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe" -O $MT5_INSTALLER
fi

sudo -u $APP_USER bash -c "
  export DISPLAY=:99
  export WINEPREFIX=$WINEPREFIX_DIR
  export WINEARCH=win64
  export WINEDEBUG=-all
  wine $MT5_INSTALLER /auto
"

sleep 10
echo "MT5 terminal installed — waiting for it to finish first-run setup..."
sleep 30

# Kill any leftover MT5 processes so the service can manage it
sudo -u $APP_USER bash -c "wineserver -k" 2>/dev/null || true

echo "=== [5/8] Python packages in Wine ==="
sudo -u $APP_USER bash -c "
  export DISPLAY=:99
  export WINEPREFIX=$WINEPREFIX_DIR
  export WINEARCH=win64
  export WINEDEBUG=-all
  wine '$WINE_PYTHON' -m pip install --quiet MetaTrader5 mt5linux pyzmq
"

echo "=== [6/8] Linux Python venv ==="
mkdir -p $APP_DIR
python3 -m venv $APP_DIR/venv

# Copy app files from project directory (run this script from the project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/app/"*.py "$SCRIPT_DIR/app/requirements.txt" $APP_DIR/
cp "$SCRIPT_DIR/app/.env.example" $APP_DIR/.env.example

$APP_DIR/venv/bin/pip install --quiet -r $APP_DIR/requirements.txt

chown -R $APP_USER:$APP_USER $APP_DIR

# Generate Fernet key if .env doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
    FERNET_KEY=$($APP_DIR/venv/bin/python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
    sed "s|your-fernet-key-here|$FERNET_KEY|g" $APP_DIR/.env.example > $APP_DIR/.env
    chmod 600 $APP_DIR/.env
    echo ""
    echo "!!! ACTION REQUIRED: Fill in Supabase credentials in $APP_DIR/.env"
    echo ""
fi

echo "=== [7/8] Systemd services ==="
cp "$SCRIPT_DIR/mt5-terminal.service"    /etc/systemd/system/
cp "$SCRIPT_DIR/mt5linux-bridge.service" /etc/systemd/system/
cp "$SCRIPT_DIR/niri-sync.service"       /etc/systemd/system/

systemctl daemon-reload
systemctl enable mt5-terminal mt5linux-bridge niri-sync
systemctl start mt5-terminal
sleep 10
systemctl start mt5linux-bridge
sleep 5
systemctl start niri-sync

echo "=== [8/8] Nginx + SSL ==="
cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/niri-sync
ln -sf /etc/nginx/sites-available/niri-sync /etc/nginx/sites-enabled/niri-sync
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Request SSL cert (comment out if domain not pointing to this IP yet)
# certbot --nginx -d api.niri.live --non-interactive --agree-tos -m admin@niri.live

echo ""
echo "=== Firewall ==="
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "=== DONE ==="
echo "1. Edit $APP_DIR/.env with your Supabase credentials"
echo "2. Once domain is live: certbot --nginx -d api.niri.live ..."
echo "3. Restart services: systemctl restart niri-sync"
echo "4. Check logs: journalctl -u niri-sync -f"
