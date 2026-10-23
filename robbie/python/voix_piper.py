import io
import os
import sys
import json
import base64
import shutil
import subprocess
import wave
from pathlib import Path

from piper import PiperVoice

# Serveur de synthèse vocale hors ligne (Piper) : lancé une seule fois, il garde la voix
# en mémoire et reçoit les phrases (une requête JSON par ligne), répond en WAV base64
sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")

# Voix de Robbie : Siwis (voix féminine), passée par l'effet « robot léger » :
# un peu plus aiguë, un peu plus rapide, avec un léger chœur métallique
VOICE_NAME = os.environ.get("ROBBIE_VOIX", "fr_FR-siwis-medium")
# Effet (réglable dans les réglages : ROBBIE_EFFET = "robot" ou "aucun")
ROBOT = os.environ.get("ROBBIE_EFFET", "robot") != "aucun"
ROBOT_EFFECT = ["pitch", "280", "tempo", "1.05", "chorus", "0.6", "0.9", "20", "0.4", "0.3", "2", "-s"]

VOICE = Path(__file__).resolve().parent.parent / "voix" / f"{VOICE_NAME}.onnx"
voice = PiperVoice.load(str(VOICE))
SOX = shutil.which("sox") if ROBOT else None
effect = " + effet robot" if SOX else (" (sox absent : sans effet robot)" if ROBOT else " (sans effet)")
print(f"Voix chargée : {VOICE.stem}{effect}", file=sys.stderr, flush=True)


def robot(audio):
    # sox lit le WAV sur son entrée et rend le WAV transformé sur sa sortie
    result = subprocess.run([SOX, "-t", "wav", "-", "-t", "wav", "-", *ROBOT_EFFECT],
                            input=audio, capture_output=True, check=True)
    return fix_sizes(bytearray(result.stdout))


def fix_sizes(audio):
    # En écrivant dans un tuyau, sox ne peut pas revenir noter les tailles dans l'en-tête
    # et y met une valeur bidon : on écrit les vraies (certains lecteurs refusent sinon)
    data = audio.find(b"data")
    if audio[:4] == b"RIFF" and data != -1:
        audio[4:8] = (len(audio) - 8).to_bytes(4, "little")
        audio[data + 4:data + 8] = (len(audio) - data - 8).to_bytes(4, "little")
    return bytes(audio)


def synthesize(text):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        voice.synthesize_wav(text, wav)
    audio = buffer.getvalue()

    if SOX:
        try:
            audio = robot(audio)
        except subprocess.CalledProcessError as error:
            print(f"Effet robot impossible : {error.stderr.decode(errors='ignore')[:200]}", file=sys.stderr, flush=True)

    return base64.b64encode(audio).decode()


for line in sys.stdin:
    try:
        request = json.loads(line)
    except json.JSONDecodeError:
        continue

    try:
        reply = {"id": request["id"], "audio": synthesize(request["text"])}
    except Exception as error:
        reply = {"id": request.get("id"), "error": str(error)}

    print(json.dumps(reply), flush=True)
