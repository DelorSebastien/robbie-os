#!/bin/sh
# Installation de la base de Robbie OS sur une Debian 13 minimale
# (affichage, son, Node.js pour l'interface, Python pour la voix)
# À lancer en root : sudo sh installer-base.sh <utilisateur>
set -eu

USER_NAME="${1:-robbie}"
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends \
    `# Affichage : labwc (compositeur Wayland) et de quoi l'aider` \
    labwc seatd xwayland foot swaybg wlr-randr wtype wl-clipboard grim \
    mesa-utils libgl1-mesa-dri fonts-noto-core fonts-noto-color-emoji fonts-inter \
    `# Premières applis : navigateur, fichiers, texte, images` \
    firefox-esr firefox-esr-l10n-fr thunar mousepad ristretto adwaita-icon-theme papirus-icon-theme \
    `# Son et micro` \
    pipewire pipewire-pulse pipewire-alsa wireplumber alsa-utils playerctl sox \
    `# Interface : Node.js et ce dont Electron a besoin` \
    nodejs npm libnss3 libgtk-3-0t64 libgbm1 libasound2t64 libxss1 libxtst6 libdrm2 libatk-bridge2.0-0t64 libcups2t64 \
    `# Voix : Python` \
    python3 python3-venv python3-pip libportaudio2 \
    `# Outils` \
    ca-certificates curl git dbus-user-session

# Accès à l'écran, au son et aux périphériques d'entrée
# (sous Debian, seatd donne l'accès au groupe video)
usermod -aG video,audio,input,render "$USER_NAME"
systemctl enable --now seatd

echo "Base de Robbie OS installée"
