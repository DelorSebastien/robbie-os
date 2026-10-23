#!/bin/sh
# Démarrage de Robbie OS : écran de démarrage (Plymouth, Robbie qui ouvre les yeux),
# sans le texte de Linux ni le menu de démarrage, jusqu'au bureau
# À lancer en root : sudo sh installer-demarrage.sh <utilisateur> <dossier de Robbie OS>
set -eu

USER_NAME="${1:-robbie}"   # (sert seulement à trouver le dossier de Robbie OS par défaut)
ROBBIE_DIR="${2:-/home/$USER_NAME/robbie-os}"
THEME=/usr/share/plymouth/themes/robbie
FONT=/usr/share/fonts/truetype/robbie-os/Orbitron.ttf

# Thème Plymouth : le script, et les images fabriquées ici (un œil lumineux, le titre)
rm -rf "$THEME"
cp -r "$ROBBIE_DIR/systeme/plymouth/robbie" "$THEME"

# Œil : rectangle arrondi cyan, dégradé vers le haut, avec son halo
convert -size 120x150 xc:none -fill '#38e8ff' -draw 'roundrectangle 30,25 90,125 22,22' \
    \( +clone -blur 0x10 \) +swap -compose over -composite \
    \( -size 120x150 gradient:'rgba(255,255,255,0.45)-rgba(255,255,255,0)' \) -compose atop -composite \
    "$THEME/oeil.png"
convert -background none -fill '#cfe9f5' -font "$FONT" -pointsize 22 -kerning 9 label:'ROBBIE OS' "$THEME/titre.png"

plymouth-set-default-theme robbie

# Démarrage silencieux : écran de démarrage, pas de texte du noyau, pas de curseur clignotant ;
# menu de démarrage caché (Échap pendant le démarrage pour le faire apparaître)
sed -i 's/^GRUB_CMDLINE_LINUX_DEFAULT=.*/GRUB_CMDLINE_LINUX_DEFAULT="quiet splash loglevel=3 rd.udev.log_level=3 vt.global_cursor_default=0"/' /etc/default/grub
sed -i 's/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=0/' /etc/default/grub
grep -q '^GRUB_TIMEOUT_STYLE=' /etc/default/grub || echo 'GRUB_TIMEOUT_STYLE=hidden' >> /etc/default/grub
sed -i 's/^GRUB_TIMEOUT_STYLE=.*/GRUB_TIMEOUT_STYLE=hidden/' /etc/default/grub
update-grub
update-initramfs -u

# (après l'écran de démarrage vient l'écran de connexion de Robbie OS : voir installer-session.sh)
echo "Démarrage de Robbie OS installé"
