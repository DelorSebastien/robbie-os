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

# Explorateur de fichiers (Nemo) épuré : sans barre de menus ni barre d'état (touche Alt pour
# les menus), et tous les signets (Documents, Images…) dans leur propre section « Signets »
[org/nemo/window-state]
start-with-menu-bar=false
start-with-status-bar=false
sidebar-bookmark-breakpoint=0
sidebar-width=240

[org/nemo/desktop]
show-desktop-icons=false

[org/cinnamon/desktop/default-applications/terminal]
exec='foot'
EOF
dconf update

# Les dossiers s'ouvrent dans Nemo
mkdir -p /etc/xdg
printf '[Default Applications]
inode/directory=nemo.desktop
' > /etc/xdg/mimeapps.list

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
# les fonds deviennent du bleu nuit presque opaque (le fond d'écran transparaît à peine :
# plus transparent, on lirait le texte d'une fenêtre à travers celle de devant).
rm -rf /usr/share/themes/Robbie
cp -r "$ROBBIE_DIR/systeme/theme-labwc/Robbie" /usr/share/themes/
for version in gtk-3.0 gtk-4.0; do
    # Version compacte d'Orchis : marges et boutons plus petits, interface épurée
    cp -r "/usr/share/themes/Orchis-Dark-Compact/$version" "/usr/share/themes/Robbie/$version"
    find "/usr/share/themes/Robbie/$version" -name '*.css' -exec sed -i \
        -e 's/#212121/rgba(10, 18, 36, 0.86)/gI' \
        -e 's/#242424/rgba(10, 18, 36, 0.88)/gI' \
        -e 's/#2C2C2C/rgba(10, 18, 36, 0.3)/gI' \
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

/* Robbie OS : panneau de gauche de l'explorateur (Nemo) : lignes aérées, survol voilé,
   sélection en bande cyan translucide. (Pas de coins arrondis ni de trait : GTK dessine le fond
   colonne par colonne, et Nemo a plusieurs colonnes par ligne : chaque morceau serait arrondi) */
.nemo-window .nemo-places-sidebar {
    background-color: rgba(5, 10, 22, 0.35);
    padding: 6px 4px;
}

.nemo-window treeview.places-treeview {
    padding: 4px 4px;
}

/* (seul le panneau porte le fond : les lignes au repos sont transparentes) */
.nemo-window treeview.places-treeview:not(:hover):not(:selected) {
    background-color: transparent;
}

.nemo-window treeview.places-treeview:hover {
    background-color: rgba(255, 255, 255, 0.06);
}

.nemo-window treeview.places-treeview:selected,
.nemo-window treeview.places-treeview:selected:focus {
    background-color: rgba(94, 231, 255, 0.18);
    color: #ffffff;
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

echo "Apparence de Robbie OS installée"
