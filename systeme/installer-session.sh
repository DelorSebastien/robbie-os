#!/bin/sh
# Robbie OS pour tous les comptes : installé dans /opt/robbie-os, écran de connexion de Robbie OS
# (greetd), puis pour chaque personne sa propre session (labwc et l'interface).
# À lancer en root : sudo sh installer-session.sh <dossier source de Robbie OS>
set -eu

SOURCE="${1:-/home/robbie/robbie-os}"
ROBBIE_DIR=/opt/robbie-os
CONFIG=/etc/robbie-os

# ---- Robbie OS dans /opt, lisible par tous ----
if [ "$(realpath "$SOURCE")" != "$ROBBIE_DIR" ]; then
    mkdir -p "$ROBBIE_DIR"
    # (--remove-destination : remplace aussi les programmes en cours d'utilisation, comme Electron)
    cp -a --remove-destination "$SOURCE/." "$ROBBIE_DIR/"
fi
# Modèles de Whisper partagés (sinon chaque compte retéléchargerait 500 Mo)
mkdir -p "$ROBBIE_DIR/modeles"
for home in /home/*; do
    [ -d "$home/.cache/huggingface/hub" ] && cp -an "$home/.cache/huggingface/hub" "$ROBBIE_DIR/modeles/" || true
done
chown -R root:root "$ROBBIE_DIR"
chmod -R a+rX "$ROBBIE_DIR"

# ---- Sur quelle machine tourne Robbie OS (lu au démarrage de la session et de l'accueil) ----
# Vrai PC : tout normal. VirtualBox : sa carte graphique simulée ne sait pas faire de 3D, l'interface
# est dessinée par le processeur (ROBBIE_SANS_GPU). VMware : sa carte graphique prête la vraie 3D
# de l'ordinateur, on s'en sert. Dans une machine virtuelle, le cerveau de Robbie (Ollama) est
# sur l'ordinateur hôte : VirtualBox le montre en 10.0.2.2, VMware à l'adresse .1 de son réseau.
mkdir -p /usr/local/lib/robbie-os
cat > /usr/local/lib/robbie-os/machine <<'EOF'
case "$(systemd-detect-virt 2>/dev/null)" in
    oracle)
        export ROBBIE_SANS_GPU=1
        export ROBBIE_OLLAMA=http://10.0.2.2:11434
        ;;
    vmware)
        gateway=$(ip route show default 2>/dev/null | awk '/^default via/ { print $3; exit }')
        [ -n "$gateway" ] && export ROBBIE_OLLAMA="http://${gateway%.*}.1:11434"
        ;;
esac
# (adresse choisie à la main, prioritaire : une ligne http://… dans ce fichier)
[ -s /etc/robbie-os/ollama ] && export ROBBIE_OLLAMA="$(head -n 1 /etc/robbie-os/ollama)"
EOF
chmod 644 /usr/local/lib/robbie-os/machine

# ---- Outil de gestion des comptes (lancé par sudo depuis les Réglages) ----
install -D -m 755 "$ROBBIE_DIR/systeme/outils/comptes" /usr/local/lib/robbie-os/comptes
getent group robbie-enfant >/dev/null || groupadd robbie-enfant
# Chacun peut modifier son propre compte (mot de passe, nom, identifiant) sans être administrateur :
# l'outil vérifie lui-même son mot de passe actuel
cat > /etc/sudoers.d/robbie-os-comptes <<'EOF'
ALL ALL=(root) NOPASSWD: /usr/local/lib/robbie-os/comptes moi *
EOF
chmod 440 /etc/sudoers.d/robbie-os-comptes
visudo -cq -f /etc/sudoers.d/robbie-os-comptes || rm -f /etc/sudoers.d/robbie-os-comptes
# Un compte ouvert ne peut pas changer d'identifiant : c'est fait au démarrage suivant,
# avant l'écran de connexion
cat > /etc/systemd/system/robbie-os-renommages.service <<'EOF'
[Unit]
Description=Robbie OS : identifiants de comptes changés
Before=greetd.service

[Service]
Type=oneshot
ExecStart=/usr/local/lib/robbie-os/comptes appliquer-renommages

[Install]
WantedBy=multi-user.target
EOF
systemctl enable robbie-os-renommages.service >/dev/null 2>&1
mkdir -p "$CONFIG/enfants"

# ---- Applis de Robbie OS : Photos (photothèque, albums, visionneuse, retouches) ----
install -m 644 "$ROBBIE_DIR/applis/photos/robbie-photos.desktop" /usr/share/applications/
update-desktop-database -q /usr/share/applications 2>/dev/null || true
# Photos ouvre les images et les vidéos ; les dossiers s'ouvrent dans l'explorateur
mkdir -p /etc/xdg
{
    echo '[Default Applications]'
    echo 'inode/directory=thunar.desktop'
    for type in image/jpeg image/png image/webp image/gif image/bmp image/avif image/tiff video/mp4 video/webm video/quicktime; do
        echo "$type=robbie-photos.desktop"
    done
} > /etc/xdg/mimeapps.list

# ---- Configuration de labwc commune à tous les comptes ----
mkdir -p "$CONFIG/labwc"

cat > "$CONFIG/labwc/environment" <<'EOF'
XKB_DEFAULT_LAYOUT=fr
WLR_NO_HARDWARE_CURSORS=1
XCURSOR_THEME=Bibata-Modern-Classic
XCURSOR_SIZE=24
EOF

# Raccourcis : Super seule = Robbie, Super+A applis, Super+N notifications, Super+I réglages,
# Super+L verrouiller, Super+Entrée terminal (et ceux de labwc : Alt+Tab…)
cat > "$CONFIG/labwc/rc.xml" <<'EOF'
<?xml version="1.0"?>
<labwc_config>
  <theme>
    <name>Robbie</name>
    <cornerRadius>14</cornerRadius>
    <titlebar><layout>close,iconify,max:</layout></titlebar>
    <font place="ActiveWindow"><name>Orbitron</name><size>9</size><weight>Medium</weight></font>
    <font place="InactiveWindow"><name>Orbitron</name><size>9</size><weight>Medium</weight></font>
    <font place="MenuItem"><name>Orbitron</name><size>9</size></font>
    <font place="OnScreenDisplay"><name>Inter</name><size>11</size></font>
  </theme>
  <!-- Place réservée au dock (en bas) et à la barre latérale (à droite) -->
  <margin top="10" bottom="120" left="10" right="78" />
  <keyboard>
    <default />
    <keybind key="Super_L" onRelease="yes">
      <action name="Execute" command="sh -c 'kill -USR2 $(cat $HOME/.cache/robbie-os.pid)'" />
    </keybind>
    <keybind key="W-Return"><action name="Execute" command="foot" /></keybind>
    <keybind key="W-a"><action name="Execute" command="sh -c 'echo lanceur > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-n"><action name="Execute" command="sh -c 'echo notifications > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-i"><action name="Execute" command="sh -c 'echo reglages > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-l"><action name="Execute" command="sh -c 'echo verrouiller > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-space"><action name="Execute" command="sh -c 'echo recherche > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-v"><action name="Execute" command="sh -c 'echo presse-papiers > $HOME/.cache/robbie-os.commande'" /></keybind>
    <!-- Fenêtres côte à côte : Super + flèches (et en glissant une fenêtre contre un bord) -->
    <keybind key="W-Left"><action name="SnapToEdge" direction="left" /></keybind>
    <keybind key="W-Right"><action name="SnapToEdge" direction="right" /></keybind>
    <keybind key="W-Up"><action name="ToggleMaximize" /></keybind>
    <keybind key="W-Down"><action name="Iconify" /></keybind>
    <!-- Bureaux virtuels : Super + 1…4 pour y aller, Super + Maj + 1…4 pour y envoyer la fenêtre ;
         l'interface est prévenue pour allumer le bon point (XF86Launch1…4 : ses clics à elle) -->
    <keybind key="W-1"><action name="GoToDesktop" to="1" /><action name="Execute" command="sh -c 'echo bureau-1 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="XF86Launch1"><action name="GoToDesktop" to="1" /><action name="Execute" command="sh -c 'echo bureau-1 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-S-1"><action name="SendToDesktop" to="1" follow="yes" /><action name="Execute" command="sh -c 'echo bureau-1 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-2"><action name="GoToDesktop" to="2" /><action name="Execute" command="sh -c 'echo bureau-2 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="XF86Launch2"><action name="GoToDesktop" to="2" /><action name="Execute" command="sh -c 'echo bureau-2 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-S-2"><action name="SendToDesktop" to="2" follow="yes" /><action name="Execute" command="sh -c 'echo bureau-2 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-3"><action name="GoToDesktop" to="3" /><action name="Execute" command="sh -c 'echo bureau-3 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="XF86Launch3"><action name="GoToDesktop" to="3" /><action name="Execute" command="sh -c 'echo bureau-3 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-S-3"><action name="SendToDesktop" to="3" follow="yes" /><action name="Execute" command="sh -c 'echo bureau-3 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-4"><action name="GoToDesktop" to="4" /><action name="Execute" command="sh -c 'echo bureau-4 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="XF86Launch4"><action name="GoToDesktop" to="4" /><action name="Execute" command="sh -c 'echo bureau-4 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <keybind key="W-S-4"><action name="SendToDesktop" to="4" follow="yes" /><action name="Execute" command="sh -c 'echo bureau-4 > $HOME/.cache/robbie-os.commande'" /></keybind>
    <!-- Touches invisibles envoyées par l'interface (wtype) : le bureau passe devant les fenêtres
         le temps qu'un de ses panneaux est ouvert, puis repasse dessous -->
    <keybind key="XF86Launch8">
      <action name="ForEach"><query identifier="robbie-os" /><then>
        <action name="ToggleAlwaysOnBottom" /><action name="Raise" /><action name="Focus" />
      </then></action>
    </keybind>
    <keybind key="XF86Launch9">
      <action name="ForEach"><query identifier="robbie-os" /><then>
        <action name="ToggleAlwaysOnBottom" />
      </then></action>
    </keybind>
  </keyboard>
  <!-- Le bureau (l'interface de Robbie OS, en plein écran) reste toujours sous les fenêtres :
       un clic dessus ne les cache plus -->
  <windowRules>
    <windowRule identifier="robbie-os" skipWindowSwitcher="yes">
      <action name="ToggleAlwaysOnBottom" />
      <!-- (présente sur tous les bureaux virtuels) -->
      <action name="ToggleOmnipresent" />
    </windowRule>
  </windowRules>
  <desktops number="4"><popupTime>0</popupTime><prefix>Bureau</prefix></desktops>
  <!-- Fenêtre glissée contre un bord : aperçu en verre de la place qu'elle va prendre -->
  <snapping>
    <range>12</range>
    <overlay><enabled>yes</enabled><delay><inner>300</inner><outer>300</outer></delay></overlay>
    <topMaximize>yes</topMaximize>
  </snapping>
  <!-- Alt+Tab : le nom de l'appli et le titre de la fenêtre -->
  <windowSwitcher show="yes" preview="yes" outlines="yes">
    <fields>
      <field content="desktop_entry_name" width="30%" />
      <field content="title" width="70%" />
    </fields>
  </windowSwitcher>
</labwc_config>
EOF

# Au démarrage de la session : l'interface de Robbie OS
# (machine virtuelle : le cerveau de Robbie est sur l'ordinateur hôte ; voir robbie-os-machine)
cat > "$CONFIG/labwc/autostart" <<EOF
amixer -q sset 'Mic Boost (+20dB)' on 2>/dev/null
. /usr/local/lib/robbie-os/machine
mkdir -p "\$HOME/.cache"
$ROBBIE_DIR/node_modules/.bin/electron $ROBBIE_DIR > "\$HOME/.cache/robbie-os-interface.log" 2>&1 &
EOF

# ---- Session d'une personne (lancée par l'écran de connexion) ----
cat > /usr/local/bin/robbie-os-session <<'EOF'
#!/bin/sh
# Session Robbie OS : labwc avec la configuration commune, avec la carte graphique si possible
export XDG_CURRENT_DESKTOP=Robbie-OS
export XDG_SESSION_TYPE=wayland
mkdir -p "$HOME/.cache"

# Invité : on repart toujours d'un dossier vide, et on l'efface en partant
clean_guest() {
    if [ "$(id -un)" = invite ] && [ "$HOME" = /home/invite ]; then
        find "$HOME" -mindepth 1 -delete 2>/dev/null
        cp -r /etc/skel/. "$HOME/"
        mkdir -p "$HOME/.cache"
    fi
}

# Fin de session : tout ce qui reste de la session s'arrête (interface, oreille de Robbie…),
# sinon ces programmes continueraient d'écouter le micro après la déconnexion.
# Tous les programmes de la connexion sont dans le même groupe (cgroup) : on les arrête tous.
stop_leftovers() {
    group="/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/$$/cgroup)"
    for signal in TERM KILL; do
        for pid in $(cat "$group/cgroup.procs" 2>/dev/null); do
            [ "$pid" != $$ ] && kill -s "$signal" "$pid" 2>/dev/null
        done
        [ "$signal" = TERM ] && sleep 2
    done
}

# Dossiers personnels en français (Documents, Images, Vidéos, Musique, Téléchargements),
# et en favoris dans l'explorateur de fichiers la première fois
setup_folders() {
    LANG=fr_FR.UTF-8 xdg-user-dirs-update
    # (dossier anglais vide laissé par Firefox avant que Téléchargements existe)
    [ "$(xdg-user-dir DOWNLOAD)" != "$HOME/Downloads" ] && rmdir "$HOME/Downloads" 2>/dev/null
    bookmarks="$HOME/.config/gtk-3.0/bookmarks"
    [ -s "$bookmarks" ] && return
    mkdir -p "$(dirname "$bookmarks")"
    for name in DOCUMENTS PICTURES VIDEOS MUSIC DOWNLOAD; do
        folder="$(xdg-user-dir "$name")"
        [ "$folder" != "$HOME" ] && [ -d "$folder" ] || continue
        python3 -c 'import pathlib, sys; print(pathlib.Path(sys.argv[1]).as_uri())' "$folder"
    done > "$bookmarks"
}

# Configuration de labwc propre à la personne : copie de la commune (remise à jour à chaque
# connexion), où l'interface règle la place réservée à la barre latérale (à gauche ou à droite)
LABWC_DIR="$HOME/.config/robbie-os/labwc"
setup_labwc() {
    mkdir -p "$LABWC_DIR"
    cp /etc/robbie-os/labwc/* "$LABWC_DIR/"
    if grep -q '"barre": *"gauche"' "$HOME/.config/robbie-os/reglages.json" 2>/dev/null; then
        sed -i 's|left="10" right="78"|left="78" right="10"|' "$LABWC_DIR/rc.xml"
    fi
    # (curseur choisi dans les Réglages : pour le pointeur du bureau aussi)
    cursor=$(sed -n 's/.*"cursorTheme": *"\([A-Za-z0-9_.+-]*\)".*/\1/p' "$HOME/.config/robbie-os/reglages.json" 2>/dev/null)
    [ -n "$cursor" ] && sed -i "s|^XCURSOR_THEME=.*|XCURSOR_THEME=$cursor|" "$LABWC_DIR/environment"
    # (fenêtres agrandies en plein écran : pas de place réservée au dock)
    if grep -q '"pleinEcran": *true' "$HOME/.config/robbie-os/reglages.json" 2>/dev/null; then
        sed -i 's|bottom="120"|bottom="10"|' "$LABWC_DIR/rc.xml"
    fi
}

# Invite de commande de Robbie OS dans le terminal (comptes créés avant qu'elle existe)
setup_shell() {
    grep -q 'robbie-os/invite.sh' "$HOME/.bashrc" 2>/dev/null \
        || printf '\n# Invite de commande de Robbie OS\n[ -f /etc/robbie-os/invite.sh ] && . /etc/robbie-os/invite.sh\n' >> "$HOME/.bashrc"
}

clean_guest
setup_folders
setup_labwc
setup_shell
labwc -C "$LABWC_DIR" > "$HOME/.cache/robbie-os-session.log" 2>&1 \
    || WLR_RENDERER=pixman labwc -C "$LABWC_DIR" >> "$HOME/.cache/robbie-os-session.log" 2>&1
stop_leftovers
clean_guest
EOF
chmod 755 /usr/local/bin/robbie-os-session

# ---- Écran de connexion de Robbie OS (greetd + cage) ----
cat > /usr/local/bin/robbie-os-accueil <<EOF
#!/bin/sh
# Écran de connexion : l'interface de Robbie OS en mode accueil, seule à l'écran (cage)
export XKB_DEFAULT_LAYOUT=fr
export XCURSOR_THEME=Bibata-Modern-Classic
export XCURSOR_SIZE=24
. /usr/local/lib/robbie-os/machine
APP="$ROBBIE_DIR/node_modules/.bin/electron $ROBBIE_DIR --accueil"
cage -s -d -- \$APP || WLR_RENDERER=pixman exec cage -s -d -- \$APP
EOF
chmod 755 /usr/local/bin/robbie-os-accueil

cat > /etc/greetd/config.toml <<'EOF'
[terminal]
vt = 1

[default_session]
command = "/usr/local/bin/robbie-os-accueil"
user = "_greetd"
EOF

# L'écran de connexion remplace la connexion automatique sur l'écran 1
rm -f /etc/systemd/system/getty@tty1.service.d/autologin.conf
mkdir -p /etc/systemd/system/greetd.service.d
cat > /etc/systemd/system/greetd.service.d/robbie-os.conf <<'EOF'
[Unit]
Conflicts=getty@tty1.service
After=getty@tty1.service
EOF
# Pas de console entre l'écran de démarrage et l'écran de connexion : à la fin du démarrage,
# l'animation garde sa dernière image à l'écran (--retain-splash) au lieu de revenir au texte,
# jusqu'à ce que l'écran de connexion la remplace par la même image, puis apparaisse en fondu
mkdir -p /etc/systemd/system/plymouth-quit.service.d
cat > /etc/systemd/system/plymouth-quit.service.d/robbie-os.conf <<'EOF'
[Service]
ExecStart=
ExecStart=-/usr/bin/plymouth quit --retain-splash
EOF
systemctl disable getty@tty1.service >/dev/null 2>&1 || true

# L'écran de connexion peut éteindre ou redémarrer l'ordinateur
mkdir -p /etc/polkit-1/rules.d
cat > /etc/polkit-1/rules.d/50-robbie-os-accueil.rules <<'EOF'
polkit.addRule(function (action, subject) {
    if (subject.user === "_greetd" && /^org\.freedesktop\.login1\.(power-off|reboot)/.test(action.id)) {
        return polkit.Result.YES;
    }
});
EOF

# Machine virtuelle : tampons audio plus grands (la voix de Robbie ne saccade pas)
if systemd-detect-virt -q; then
    mkdir -p /etc/pipewire/pipewire.conf.d /etc/pipewire/pipewire-pulse.conf.d
    cat > /etc/pipewire/pipewire.conf.d/10-robbie-vm.conf <<'EOF'
context.properties = {
    default.clock.quantum = 2048
    default.clock.min-quantum = 1024
}
EOF
    cat > /etc/pipewire/pipewire-pulse.conf.d/10-robbie-vm.conf <<'EOF'
pulse.properties = {
    pulse.min.req = 1024/48000
    pulse.min.quantum = 1024/48000
}
EOF
fi

systemctl daemon-reload
systemctl enable greetd >/dev/null 2>&1

echo "Robbie OS installé pour tous les comptes"
