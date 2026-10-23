#!/bin/sh
# Apparence de Robbie OS : icônes, thème des fenêtres GTK, curseurs, barre de titre
# À lancer en root : sudo sh installer-apparence.sh <dossier de Robbie OS>
set -eu

ROBBIE_DIR="${1:-/home/robbie/robbie-os}"
ICONS="Vivid-Glassy-Dark-Icons"
GTK_THEME="Orchis-Dark"
CURSOR="Bibata-Modern-Classic"

export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends orchis-gtk-theme bibata-cursor-theme \
    dconf-cli dconf-gsettings-backend gsettings-desktop-schemas libglib2.0-bin

# Thème d'icônes, extrait sous Linux pour garder ses liens (une icône sert sous plusieurs noms)
rm -rf "/usr/share/icons/$ICONS"
tar -xJf "$ROBBIE_DIR/assets/icones/$ICONS.tar.xz" -C /usr/share/icons --warning=no-unknown-keyword
gtk-update-icon-cache -f -q "/usr/share/icons/$ICONS" 2>/dev/null || true

# Réglages par défaut des applis GTK. Sous Wayland, elles les lisent dans dconf (gsettings),
# pas dans settings.ini : on écrit les deux.
mkdir -p /etc/dconf/profile /etc/dconf/db/local.d
printf 'user-db:user\nsystem-db:local\n' > /etc/dconf/profile/user
cat > /etc/dconf/db/local.d/00-robbie-os <<EOF
[org/gnome/desktop/interface]
gtk-theme='$GTK_THEME'
icon-theme='$ICONS'
cursor-theme='$CURSOR'
cursor-size=24
color-scheme='prefer-dark'
font-name='Inter 10'
EOF
dconf update

for version in 3.0 4.0; do
    mkdir -p "/etc/gtk-$version"
    cat > "/etc/gtk-$version/settings.ini" <<EOF
[Settings]
gtk-theme-name=$GTK_THEME
gtk-icon-theme-name=$ICONS
gtk-cursor-theme-name=$CURSOR
gtk-cursor-theme-size=24
gtk-application-prefer-dark-theme=true
gtk-font-name=Inter 10
EOF
done

# Thème de la barre de titre (labwc)
rm -rf /usr/share/themes/Robbie
cp -r "$ROBBIE_DIR/systeme/theme-labwc/Robbie" /usr/share/themes/

echo "Apparence de Robbie OS installée"
