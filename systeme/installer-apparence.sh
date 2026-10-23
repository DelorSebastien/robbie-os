#!/bin/sh
# Apparence de Robbie OS : thème d'icônes (pour toutes les applis) et thème sombre
# À lancer en root : sudo sh installer-apparence.sh <dossier de Robbie OS>
set -eu

ROBBIE_DIR="${1:-/home/robbie/robbie-os}"
ICONS="Vivid-Glassy-Dark-Icons"

# Thème d'icônes, extrait sous Linux pour garder ses liens (une icône sert sous plusieurs noms)
rm -rf "/usr/share/icons/$ICONS"
tar -xJf "$ROBBIE_DIR/assets/icones/$ICONS.tar.xz" -C /usr/share/icons --warning=no-unknown-keyword
gtk-update-icon-cache -f -q "/usr/share/icons/$ICONS" 2>/dev/null || true

# Thème par défaut des applis GTK (Thunar, Mousepad…) : icônes vitrées et mode sombre
for version in 3.0 4.0; do
    mkdir -p "/etc/gtk-$version"
    cat > "/etc/gtk-$version/settings.ini" <<EOF
[Settings]
gtk-icon-theme-name=$ICONS
gtk-application-prefer-dark-theme=true
gtk-font-name=Inter 10
EOF
done

echo "Apparence de Robbie OS installée"
