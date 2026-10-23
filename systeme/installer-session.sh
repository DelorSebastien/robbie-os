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
ExecStart=-/sbin/agetty --autologin $USER_NAME --noclear --noissue --skip-login --nohints %I \$TERM
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
XCURSOR_THEME=Bibata-Modern-Classic
XCURSOR_SIZE=24
EOF

# Raccourcis : touche Super seule = palette de Robbie (signal envoyé à l'interface),
# Super+Entrée = terminal, et les raccourcis habituels de labwc (Alt+Tab...)
cat > "$HOME_DIR/.config/labwc/rc.xml" <<'EOF'
<?xml version="1.0"?>
<labwc_config>
  <theme>
    <name>Robbie</name>
    <cornerRadius>12</cornerRadius>
    <titlebar><layout>close,iconify,max:</layout></titlebar>
    <font place="ActiveWindow"><name>Orbitron</name><size>9</size><weight>Medium</weight></font>
    <font place="InactiveWindow"><name>Orbitron</name><size>9</size><weight>Medium</weight></font>
    <font place="MenuItem"><name>Orbitron</name><size>9</size></font>
  </theme>
  <!-- Place réservée au dock (en bas) et à la barre latérale (à droite) :
       les fenêtres, même agrandies, ne les recouvrent pas -->
  <margin top="10" bottom="120" left="10" right="78" />
  <keyboard>
    <default />
    <keybind key="Super_L" onRelease="yes">
      <action name="Execute" command="sh -c 'kill -USR2 $(cat $HOME/.cache/robbie-os.pid)'" />
    </keybind>
    <keybind key="W-Return">
      <action name="Execute" command="foot" />
    </keybind>
    <keybind key="W-a">
      <action name="Execute" command="sh -c 'echo lanceur > $HOME/.cache/robbie-os.commande'" />
    </keybind>
    <keybind key="W-n">
      <action name="Execute" command="sh -c 'echo notifications > $HOME/.cache/robbie-os.commande'" />
    </keybind>
    <keybind key="W-i">
      <action name="Execute" command="sh -c 'echo reglages > $HOME/.cache/robbie-os.commande'" />
    </keybind>
    <keybind key="W-l">
      <action name="Execute" command="sh -c 'echo verrouiller > $HOME/.cache/robbie-os.commande'" />
    </keybind>
  </keyboard>
</labwc_config>
EOF

# Dans une machine virtuelle :
# - le cerveau de Robbie (Ollama) est celui de l'ordinateur hôte, qui a la carte graphique :
#   VirtualBox le rend joignable à l'adresse 10.0.2.2 ;
# - l'interface est dessinée par le processeur : la carte graphique simulée de VirtualBox
#   accélère labwc, mais pas Chromium (qui retomberait sur un rendu logiciel plus lent)
cat > "$HOME_DIR/.config/labwc/autostart" <<EOF
# Amplification du micro quand la carte son la propose (sinon il faut parler collé au micro)
amixer -q sset 'Mic Boost (+20dB)' on 2>/dev/null

if systemd-detect-virt -q; then
    export ROBBIE_OLLAMA=http://10.0.2.2:11434
    export ROBBIE_SANS_GPU=1
fi
cd "$ROBBIE_DIR" && ./node_modules/.bin/electron . > ~/.robbie-os-interface.log 2>&1 &
EOF

# Machine virtuelle : tampons audio plus grands, pour que la voix de Robbie
# ne saccade pas quand le processeur est occupé (un peu plus de latence, sans importance ici)
if systemd-detect-virt -q; then
    mkdir -p "$HOME_DIR/.config/pipewire/pipewire.conf.d" "$HOME_DIR/.config/pipewire/pipewire-pulse.conf.d"
    cat > "$HOME_DIR/.config/pipewire/pipewire.conf.d/10-robbie-vm.conf" <<'EOF'
context.properties = {
    default.clock.quantum = 2048
    default.clock.min-quantum = 1024
}
EOF
    cat > "$HOME_DIR/.config/pipewire/pipewire-pulse.conf.d/10-robbie-vm.conf" <<'EOF'
pulse.properties = {
    pulse.min.req = 1024/48000
    pulse.min.quantum = 1024/48000
}
EOF
fi

chown -R "$USER_NAME:$USER_NAME" "$HOME_DIR/.bash_profile" "$HOME_DIR/.config"
systemctl daemon-reload

echo "Session de Robbie OS installée"
