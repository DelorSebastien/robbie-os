#!/bin/sh
# Démarrage de Robbie OS : connexion automatique sur l'écran 1, puis labwc
# qui lance l'interface en plein écran (aucun bureau, aucun écran de connexion)
# À lancer en root : sudo sh installer-session.sh <utilisateur> <dossier de Robbie OS>
set -eu

USER_NAME="${1:-robbie}"
ROBBIE_DIR="${2:-/home/$USER_NAME/robbie-os}"
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"

# Connexion automatique sur le premier écran
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USER_NAME --noclear %I \$TERM
EOF

# Une fois connecté sur l'écran 1, on lance labwc (les autres écrans restent des consoles)
cat > "$HOME_DIR/.bash_profile" <<'EOF'
[ -f ~/.bashrc ] && . ~/.bashrc

if [ "$(tty)" = /dev/tty1 ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
    # Machine virtuelle sans 3D : l'écran est dessiné par le processeur
    systemd-detect-virt -q && export WLR_RENDERER=pixman
    exec labwc > ~/.robbie-os-session.log 2>&1
fi
EOF

# labwc : clavier français, et l'interface de Robbie OS au démarrage
mkdir -p "$HOME_DIR/.config/labwc"
cat > "$HOME_DIR/.config/labwc/environment" <<'EOF'
XKB_DEFAULT_LAYOUT=fr
WLR_NO_HARDWARE_CURSORS=1
EOF

cat > "$HOME_DIR/.config/labwc/autostart" <<EOF
cd "$ROBBIE_DIR" && ./node_modules/.bin/electron . > ~/.robbie-os-interface.log 2>&1 &
EOF

chown -R "$USER_NAME:$USER_NAME" "$HOME_DIR/.bash_profile" "$HOME_DIR/.config"
systemctl daemon-reload

echo "Session de Robbie OS installée"
