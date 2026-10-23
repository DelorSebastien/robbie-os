#!/bin/sh
# Apparence de Robbie OS : icônes, thème des fenêtres GTK, curseurs, barre de titre
# À lancer en root : sudo sh installer-apparence.sh <dossier de Robbie OS>
set -eu

ROBBIE_DIR="${1:-/home/robbie/robbie-os}"
ICONS="Vivid-Glassy-Dark-Icons"
GTK_THEME="Robbie"
CURSOR="Bibata-Modern-Classic"

export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends orchis-gtk-theme bibata-cursor-theme \
    dconf-cli dconf-gsettings-backend gsettings-desktop-schemas libglib2.0-bin gettext

# Police de Robbie OS (Orbitron, licence OFL) pour tout le système
mkdir -p /usr/share/fonts/truetype/robbie-os
cp "$ROBBIE_DIR/assets/polices/Orbitron.ttf" "$ROBBIE_DIR/assets/polices/Orbitron-OFL.txt" /usr/share/fonts/truetype/robbie-os/
fc-cache -f /usr/share/fonts/truetype/robbie-os

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

# Thème « Robbie » : barre de titre (labwc) et fenêtres GTK.
# Les fenêtres GTK reprennent Orchis-Dark, repeint avec le verre translucide du bureau :
# les fonds deviennent du bleu nuit transparent, comme le dock et la barre latérale.
rm -rf /usr/share/themes/Robbie
cp -r "$ROBBIE_DIR/systeme/theme-labwc/Robbie" /usr/share/themes/
for version in gtk-3.0 gtk-4.0; do
    # Version compacte d'Orchis : marges et boutons plus petits, interface épurée
    cp -r "/usr/share/themes/Orchis-Dark-Compact/$version" "/usr/share/themes/Robbie/$version"
    find "/usr/share/themes/Robbie/$version" -name '*.css' -exec sed -i \
        -e 's/#212121/rgba(10, 18, 36, 0.5)/gI' \
        -e 's/#242424/rgba(10, 18, 36, 0.55)/gI' \
        -e 's/#2C2C2C/rgba(10, 18, 36, 0.28)/gI' \
        -e 's/#3C3C3C/rgba(255, 255, 255, 0.08)/gI' \
        -e 's/#404040/rgba(255, 255, 255, 0.12)/gI' \
        -e 's/#3281EA/#1e9cc4/gI' {} +

done

# Menus, menus contextuels, bulles d'aide et listes déroulantes restent opaques :
# translucides, on lirait le contenu de la fenêtre à travers.
# (une règle CSS est ignorée en entier si un seul nom est inconnu : une version par GTK ;
# en mode sombre, GTK lit gtk-dark.css au lieu de gtk.css : on complète les deux)
cat > /tmp/robbie-menus-gtk3.css <<'EOF'

/* Robbie OS : menus et bulles opaques, lisibles par-dessus les fenêtres translucides */
menu, .menu, .context-menu, .background.popup > menu, .background.csd > menu, combobox menu {
    background-color: #0f1a30;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

popover.background, tooltip.background {
    background-color: #0f1a30;
}
EOF

cat > /tmp/robbie-menus-gtk4.css <<'EOF'

/* Robbie OS : menus et bulles opaques, lisibles par-dessus les fenêtres translucides */
popover > contents, popover > arrow, popover.menu > contents, tooltip.background {
    background-color: #0f1a30;
}
EOF
for v in 3 4; do
    for css in gtk.css gtk-dark.css; do
        cat "/tmp/robbie-menus-gtk$v.css" >> "/usr/share/themes/Robbie/gtk-$v.0/$css"
    done
done
rm -f /tmp/robbie-menus-gtk3.css /tmp/robbie-menus-gtk4.css
cat > /usr/share/themes/Robbie/index.theme <<EOF
[Desktop Entry]
Type=X-GNOME-Metatheme
Name=Robbie
Comment=Thème de Robbie OS : bleu nuit et cyan

[X-GNOME-Metatheme]
GtkTheme=Robbie
IconTheme=$ICONS
CursorTheme=$CURSOR
EOF

# Écran de verrouillage en français (gtklock n'a pas de traduction française : on fournit la nôtre)
msgfmt -o /usr/share/locale/fr/LC_MESSAGES/gtklock.mo "$ROBBIE_DIR/systeme/traductions/gtklock-fr.po"

# Thunar (fichiers) épuré par défaut : sans barre de menus (touche Alt pour l'afficher),
# icônes moyennes, petites icônes dans la colonne et la barre d'outils, sans barre d'état
mkdir -p /etc/xdg/xfce4/xfconf/xfce-perchannel-xml
cat > /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/thunar.xml <<'EOF'
<?xml version="1.1" encoding="UTF-8"?>
<channel name="thunar" version="1.0">
  <property name="last-view" type="string" value="ThunarIconView"/>
  <property name="last-icon-view-zoom-level" type="string" value="THUNAR_ZOOM_LEVEL_75_PERCENT"/>
  <property name="last-menubar-visible" type="bool" value="false"/>
  <property name="last-statusbar-visible" type="bool" value="false"/>
  <property name="last-window-maximized" type="bool" value="false"/>
  <property name="last-window-width" type="int" value="980"/>
  <property name="last-window-height" type="int" value="560"/>
  <property name="last-separator-position" type="int" value="170"/>
  <property name="shortcuts-icon-size" type="string" value="THUNAR_ICON_SIZE_16"/>
  <property name="tree-icon-size" type="string" value="THUNAR_ICON_SIZE_16"/>
  <property name="misc-small-toolbar-icons" type="bool" value="true"/>
</channel>
EOF

echo "Apparence de Robbie OS installée"
