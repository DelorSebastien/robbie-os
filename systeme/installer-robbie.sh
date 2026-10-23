#!/bin/sh
# Voix et oreille de Robbie : environnement Python avec Whisper (reconnaissance vocale)
# et Piper (synthèse vocale hors ligne), plus une voix française
# À lancer en tant qu'utilisateur (pas en root) : sh installer-robbie.sh <dossier de Robbie OS>
set -eu

ROBBIE_DIR="${1:-$HOME/robbie-os}"
VENV="$ROBBIE_DIR/.venv"
VOICES="$ROBBIE_DIR/robbie/voix"
VOICE="fr_FR-tom-medium"
VOICE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/tom/medium"

python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet faster-whisper sounddevice numpy piper-tts

# Voix française de Piper (fonctionne sans internet une fois téléchargée)
mkdir -p "$VOICES"
for file in "$VOICE.onnx" "$VOICE.onnx.json"; do
    [ -s "$VOICES/$file" ] || curl -fsSL -o "$VOICES/$file" "$VOICE_URL/$file"
done

# Modèle Whisper téléchargé tout de suite (sinon au premier mot prononcé)
"$VENV/bin/python" -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL:-small}', device='cpu', compute_type='int8')"

echo "Voix et oreille de Robbie installées"
