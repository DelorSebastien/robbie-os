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

# Thèmes « Robbie » (sombre) et « Robbie-Clair » (verre givré blanc) : barre de titre (labwc)
# et fenêtres GTK, choisis dans les Réglages de Robbie OS (Apparence › Thème).
# Les fenêtres GTK reprennent Orchis en version compacte (marges et boutons plus petits),
# repeint avec le verre du bureau, presque opaque : le fond d'écran transparaît à peine
# (plus transparent, on lirait le texte d'une fenêtre à travers celle de devant).

# Ajouts communs aux deux thèmes : menus et bulles opaques (translucides, on lirait la fenêtre
# à travers), et le panneau de gauche de l'explorateur (Thunar) comme le menu des Réglages :
# lignes aérées aux coins arrondis, survol voilé, sélection en pilule avec un trait lumineux.
# (une règle CSS est ignorée en entier si un seul nom est inconnu : une version par GTK ;
# selon le mode, GTK lit gtk.css ou gtk-dark.css : on complète les deux)
# $1 thème  $2 fond des menus  $3 bord  $4 fond du panneau  $5 survol  $6 sélection  $7 trait  $8 texte sélectionné
robbie_extras() {
    cat > /tmp/robbie-gtk3.css <<EOF

/* Robbie OS : menus et bulles opaques, lisibles par-dessus les fenêtres translucides */
menu, .menu, .context-menu, .background.popup > menu, .background.csd > menu, combobox menu {
    background-color: $2;
    border: 1px solid $3;
}

popover.background, tooltip.background {
    background-color: $2;
}

/* Robbie OS : panneau de gauche de l'explorateur (Thunar) */
.thunar .shortcuts-pane {
    background-color: $4;
    padding: 6px 4px;
}

.thunar .shortcuts-pane treeview.view {
    padding: 4px 4px;
    border-radius: 10px;
    /* (moins de retrait à gauche : les noms longs tiennent dans le panneau) */
    -GtkTreeView-expander-size: 4;
}

.thunar .shortcuts-pane treeview.view:hover {
    background-color: $5;
}

.thunar .shortcuts-pane treeview.view:selected,
.thunar .shortcuts-pane treeview.view:selected:focus {
    background-color: $6;
    box-shadow: inset 3px 0 0 $7;
    color: $8;
}
EOF
    cat > /tmp/robbie-gtk4.css <<EOF

/* Robbie OS : menus et bulles opaques, lisibles par-dessus les fenêtres translucides */
popover > contents, popover > arrow, popover.menu > contents, tooltip.background {
    background-color: $2;
}
EOF
    for v in 3 4; do
        for css in gtk.css gtk-dark.css; do
            [ -f "/usr/share/themes/$1/gtk-$v.0/$css" ] && cat "/tmp/robbie-gtk$v.css" >> "/usr/share/themes/$1/gtk-$v.0/$css"
        done
    done
    rm -f /tmp/robbie-gtk3.css /tmp/robbie-gtk4.css
    cat > "/usr/share/themes/$1/index.theme" <<EOF
[Desktop Entry]
Type=X-GNOME-Metatheme
Name=$1
Comment=Thème de Robbie OS

[X-GNOME-Metatheme]
GtkTheme=$1
IconTheme=$ICONS
CursorTheme=$CURSOR
EOF
}

# Sombre : Orchis-Dark repeint en bleu nuit
rm -rf /usr/share/themes/Robbie
cp -r "$ROBBIE_DIR/systeme/theme-labwc/Robbie" /usr/share/themes/
for version in gtk-3.0 gtk-4.0; do
    cp -r "/usr/share/themes/Orchis-Dark-Compact/$version" "/usr/share/themes/Robbie/$version"
    find "/usr/share/themes/Robbie/$version" -name '*.css' -exec sed -i \
        -e 's/#212121/rgba(10, 18, 36, 0.86)/gI' \
        -e 's/#242424/rgba(10, 18, 36, 0.88)/gI' \
        -e 's/#2C2C2C/rgba(10, 18, 36, 0.3)/gI' \
        -e 's/#3C3C3C/rgba(255, 255, 255, 0.08)/gI' \
        -e 's/#404040/rgba(255, 255, 255, 0.12)/gI' \
        -e 's/#3281EA/#1e9cc4/gI' {} +
done
robbie_extras Robbie '#0f1a30' 'rgba(255, 255, 255, 0.1)' 'rgba(5, 10, 22, 0.35)' \
    'rgba(255, 255, 255, 0.06)' 'rgba(94, 231, 255, 0.16)' '#5ee7ff' '#ffffff'

# Clair : Orchis-Light repeint en verre givré blanc, accent cyan profond (lisible sur du blanc)
rm -rf /usr/share/themes/Robbie-Clair
cp -r "$ROBBIE_DIR/systeme/theme-labwc/Robbie-Clair" /usr/share/themes/
for version in gtk-3.0 gtk-4.0; do
    cp -r "/usr/share/themes/Orchis-Light-Compact/$version" "/usr/share/themes/Robbie-Clair/$version"
    find "/usr/share/themes/Robbie-Clair/$version" -name '*.css' -exec sed -i \
        -e 's/#F2F2F2/rgba(246, 248, 251, 0.86)/gI' \
        -e 's/#FAFAFA/rgba(250, 251, 253, 0.5)/gI' \
        -e 's/\(background\(-color\)\?: \)#FFFFFF/\1rgba(255, 255, 255, 0.5)/gI' \
        -e 's/#1A73E8/#0e8fb3/gI' {} +
    # (le système demande le mode sombre aux applis, qui lisent alors gtk-dark.css :
    # en clair, c'est la même feuille que gtk.css)
    cp "/usr/share/themes/Robbie-Clair/$version/gtk.css" "/usr/share/themes/Robbie-Clair/$version/gtk-dark.css"
done
robbie_extras Robbie-Clair '#f7f9fc' 'rgba(10, 18, 36, 0.1)' 'rgba(255, 255, 255, 0.35)' \
    'rgba(10, 18, 36, 0.06)' 'rgba(14, 143, 179, 0.14)' '#0e8fb3' '#0a1224'

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
  <property name="last-separator-position" type="int" value="200"/>
  <property name="shortcuts-icon-size" type="string" value="THUNAR_ICON_SIZE_16"/>
  <property name="tree-icon-size" type="string" value="THUNAR_ICON_SIZE_16"/>
  <property name="misc-small-toolbar-icons" type="bool" value="true"/>
  <!-- Titre de fenêtre : seulement le nom du dossier, sans « - Thunar » -->
  <property name="misc-window-title-style" type="string" value="THUNAR_WINDOW_TITLE_STYLE_FOLDER_NAME_WITHOUT_THUNAR_SUFFIX"/>
</channel>
EOF

echo "Apparence de Robbie OS installée"
