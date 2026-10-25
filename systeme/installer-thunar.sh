#!/bin/sh
# Explorateur de fichiers : Thunar, modifié pour Robbie OS (section « Signets » séparée dans
# son panneau de gauche, sous Ordinateur / dossier personnel / Bureau / Corbeille ; un signet
# vers un lanceur d'appli, comme « Photos », lance l'appli).
# Installe les paquets déjà construits (systeme/paquets/thunar), ou les reconstruit avec
# --construire (par exemple quand Debian publie une nouvelle version de Thunar).
# À lancer en root : sudo sh installer-thunar.sh <dossier de Robbie OS> [--construire]
set -eu

ROBBIE_DIR="${1:-/home/robbie/robbie-os}"
PAQUETS="$ROBBIE_DIR/systeme/paquets/thunar"
export DEBIAN_FRONTEND=noninteractive

if [ "${2:-}" = "--construire" ]; then
    apt-get install -y --no-install-recommends dpkg-dev
    apt-get build-dep -y thunar
    BUILD=/var/tmp/robbie-os-thunar
    rm -rf "$BUILD" && mkdir -p "$BUILD" && cd "$BUILD"
    apt-get source thunar
    cd thunar-*/
    # (les modifications de Robbie OS : section « Signets », signets qui lancent une appli)
    for PATCH in "$PAQUETS"/robbie-os-*.patch; do
        cp "$PATCH" debian/patches/
        basename "$PATCH" >> debian/patches/series
    done
    VERSION="$(dpkg-parsechangelog -S Version)+robbie2"
    { printf 'thunar (%s) trixie; urgency=medium\n\n  * Robbie OS : section « Signets » séparée dans le panneau de gauche ; un signet vers un lanceur d’appli lance l’appli.\n\n -- Robbie OS <wolfyxkms@gmail.com>  %s\n\n' "$VERSION" "$(date -R)"
      cat debian/changelog; } > debian/changelog.robbie
    mv debian/changelog.robbie debian/changelog
    dpkg-buildpackage -b -us -uc -j"$(nproc)"
    rm -f "$PAQUETS"/*.deb
    cp ../thunar_*.deb ../thunar-data_*.deb ../libthunarx-3-0_*.deb "$PAQUETS/"
    rm -f "$PAQUETS"/*dbgsym*
fi

# Les trois paquets ensemble (même version), puis figés : une mise à jour de Debian
# ne remet pas le Thunar d'origine
apt-get install -y --allow-downgrades --allow-change-held-packages "$PAQUETS"/thunar_*.deb "$PAQUETS"/thunar-data_*.deb "$PAQUETS"/libthunarx-3-0_*.deb
apt-mark hold thunar thunar-data libthunarx-3-0

# « Définir comme fond d'écran » (clic droit sur une image) : le module de Thunar ne connaît que
# les bureaux Xfce, GNOME… ; il est mis de côté et remplacé par une action de Robbie OS
# (outil « fond » : l'image est rangée dans Images › Fonds d'écran et l'interface la prend tout de suite)
install -D -m 755 "$ROBBIE_DIR/systeme/outils/fond" /usr/local/lib/robbie-os/fond
PLUGIN=/usr/lib/x86_64-linux-gnu/thunarx-3/thunar-wallpaper-plugin.so
dpkg-divert --quiet --local --rename --divert "$PLUGIN.robbie-os" --add "$PLUGIN"
FOND='<action><icon>preferences-desktop-wallpaper</icon><name>Définir comme fond d’écran</name><submenu></submenu><unique-id>robbie-os-fond</unique-id><command>/usr/local/lib/robbie-os/fond %f</command><description>Utiliser cette image comme fond d’écran de Robbie OS</description><range>1</range><patterns>*.jpg;*.jpeg;*.png;*.webp;*.avif;*.JPG;*.JPEG;*.PNG</patterns><image-files/></action>'
# « Voir dans Photos » (clic droit sur un dossier) : ses photos et vidéos dans l'appli Photos
PHOTOS='<action><icon>/opt/robbie-os/applis/photos/photos.svg</icon><name>Voir dans Photos</name><submenu></submenu><unique-id>robbie-os-photos</unique-id><command>/opt/robbie-os/node_modules/.bin/electron /opt/robbie-os/applis/photos %f</command><description>Ouvrir les photos de ce dossier dans Photos</description><range>1</range><patterns>*</patterns><directories/></action>'
# (pour les nouveaux comptes, et dans les actions déjà personnalisées de chaque compte)
for UCA in /etc/xdg/Thunar/uca.xml /home/*/.config/Thunar/uca.xml; do
    [ -f "$UCA" ] || continue
    grep -q robbie-os-fond "$UCA" || sed -i "s|</actions>|$FOND\n</actions>|" "$UCA"
    grep -q robbie-os-photos "$UCA" || sed -i "s|</actions>|$PHOTOS\n</actions>|" "$UCA"
    # (l'action d'origine de Thunar n'a pas de nom en français)
    sed -i 's|<name>Open Terminal Here</name>|<name>Ouvrir un terminal ici</name>|' "$UCA"
done

echo "Thunar de Robbie OS installé"
