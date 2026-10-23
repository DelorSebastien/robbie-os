import io
import sys
import json
import base64
import wave
from pathlib import Path

from piper import PiperVoice

# Serveur de synthèse vocale hors ligne (Piper) : lancé une seule fois, il garde la voix
# en mémoire et reçoit les phrases (une requête JSON par ligne), répond en WAV base64
sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")

VOICE = Path(__file__).resolve().parent.parent / "voix" / "fr_FR-tom-medium.onnx"
voice = PiperVoice.load(str(VOICE))
print(f"Voix chargée : {VOICE.stem}", file=sys.stderr, flush=True)


def synthesize(text):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        voice.synthesize_wav(text, wav)
    return base64.b64encode(buffer.getvalue()).decode()


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
