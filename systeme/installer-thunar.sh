#!/bin/sh
# Explorateur de fichiers : Thunar, modifié pour Robbie OS (section « Signets » séparée dans
# son panneau de gauche, sous Ordinateur / dossier personnel / Bureau / Corbeille).
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
    cp "$PAQUETS/robbie-os-signets.patch" debian/patches/
    echo robbie-os-signets.patch >> debian/patches/series
    VERSION="$(dpkg-parsechangelog -S Version)+robbie1"
    { printf 'thunar (%s) trixie; urgency=medium\n\n  * Robbie OS : section « Signets » séparée dans le panneau de gauche.\n\n -- Robbie OS <wolfyxkms@gmail.com>  %s\n\n' "$VERSION" "$(date -R)"
      cat debian/changelog; } > debian/changelog.robbie
    mv debian/changelog.robbie debian/changelog
    dpkg-buildpackage -b -us -uc -j"$(nproc)"
    rm -f "$PAQUETS"/*.deb
    cp ../thunar_*.deb ../thunar-data_*.deb ../libthunarx-3-0_*.deb "$PAQUETS/"
    rm -f "$PAQUETS"/*dbgsym*
fi

# Les trois paquets ensemble (même version), puis figés : une mise à jour de Debian
# ne remet pas le Thunar d'origine
apt-get install -y --allow-downgrades "$PAQUETS"/thunar_*.deb "$PAQUETS"/thunar-data_*.deb "$PAQUETS"/libthunarx-3-0_*.deb
apt-mark hold thunar thunar-data libthunarx-3-0

echo "Thunar de Robbie OS installé"
