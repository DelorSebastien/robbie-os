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
    # D'abord avec la carte graphique ; si elle ne répond pas (machine virtuelle sans 3D),
    # l'écran est dessiné par le processeur
    labwc > ~/.robbie-os-session.log 2>&1 || WLR_RENDERER=pixman exec labwc >> ~/.robbie-os-session.log 2>&1
fi
EOF

# labwc : clavier français, et l'interface de Robbie OS au démarrage
mkdir -p "$HOME_DIR/.config/labwc"
cat > "$HOME_DIR/.config/labwc/environment" <<'EOF'
XKB_DEFAULT_LAYOUT=fr
WLR_NO_HARDWARE_CURSORS=1
EOF

# Raccourcis : touche Super seule = palette de Robbie (signal envoyé à l'interface),
# Super+Entrée = terminal, et les raccourcis habituels de labwc (Alt+Tab...)
cat > "$HOME_DIR/.config/labwc/rc.xml" <<'EOF'
<?xml version="1.0"?>
<labwc_config>
  <theme>
    <name></name>
    <cornerRadius>10</cornerRadius>
    <font place="ActiveWindow"><name>Inter</name><size>10</size><weight>Bold</weight></font>
  </theme>
  <keyboard>
    <default />
    <keybind key="Super_L" onRelease="yes">
      <action name="Execute" command="sh -c 'kill -USR2 $(cat $HOME/.cache/robbie-os.pid)'" />
    </keybind>
    <keybind key="W-Return">
      <action name="Execute" command="foot" />
    </keybind>
  </keyboard>
</labwc_config>
EOF

# Dans une machine virtuelle, l'interface passe par XWayland : le pilote graphique
# de VirtualBox ne sait pas partager ses images avec Chromium sous Wayland
cat > "$HOME_DIR/.config/labwc/autostart" <<EOF
FLAGS=""
systemd-detect-virt -q && FLAGS="--ozone-platform=x11"
cd "$ROBBIE_DIR" && ./node_modules/.bin/electron . \$FLAGS > ~/.robbie-os-interface.log 2>&1 &
EOF

chown -R "$USER_NAME:$USER_NAME" "$HOME_DIR/.bash_profile" "$HOME_DIR/.config"
systemctl daemon-reload

echo "Session de Robbie OS installée"
