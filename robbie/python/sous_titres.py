import os
import sys
import json
import threading
import queue

import numpy as np

# Sous-titres d'un appel : le son de l'autre personne arrive sur l'entrée standard
# (mono, 16 kHz, entiers 16 bits) ; chaque phrase reconnue sort en JSON : {"texte": "..."}
sys.stdout.reconfigure(encoding="utf-8")

SAMPLE_RATE = 16000
CHUNK = 1600                 # un dixième de seconde
VOICE_LEVEL = 0.012          # niveau (RMS) à partir duquel quelqu'un parle
SILENCE_END = 0.7            # secondes de silence qui terminent une phrase
MAX_SPEECH = 8               # une longue tirade est découpée
MIN_SPEECH = 0.4
CPU_MODEL = os.environ.get("WHISPER_SOUS_TITRES", "small")
GPU_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
HALLUCINATIONS = ("sous-titres", "amara.org", "merci d'avoir regardé", "abonnez-vous", "sous-titrage")


def load_model():
    from faster_whisper import WhisperModel
    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() > 0:
            return WhisperModel(GPU_MODEL, device="cuda", compute_type="float16")
    except Exception:
        pass
    return WhisperModel(CPU_MODEL, device="cpu", compute_type="int8", cpu_threads=max(2, (os.cpu_count() or 4) // 2))


def say(data):
    print(json.dumps(data, ensure_ascii=False), flush=True)


def main():
    model = load_model()
    phrases = queue.Queue()

    # La reconnaissance tourne à part : le son continue d'arriver pendant ce temps
    def recognize():
        while True:
            audio = phrases.get()
            segments, _ = model.transcribe(audio, language="fr", beam_size=1, vad_filter=False, condition_on_previous_text=False)
            text = " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.6).strip()
            if text and not any(h in text.lower() for h in HALLUCINATIONS):
                say({"texte": text})

    threading.Thread(target=recognize, daemon=True).start()
    say({"pret": True})

    speech = []
    silence = 0.0
    stream = sys.stdin.buffer
    while True:
        data = stream.read(CHUNK * 2)
        if not data:
            break
        block = np.frombuffer(data[: len(data) // 2 * 2], dtype=np.int16).astype(np.float32) / 32768
        level = float(np.sqrt(np.mean(block ** 2))) if len(block) else 0.0
        if level >= VOICE_LEVEL:
            speech.append(block)
            silence = 0.0
        elif speech:
            speech.append(block)
            silence += len(block) / SAMPLE_RATE
        length = sum(len(b) for b in speech) / SAMPLE_RATE
        if speech and (silence >= SILENCE_END or length >= MAX_SPEECH):
            if length - silence >= MIN_SPEECH:
                phrases.put(np.concatenate(speech))
            speech = []
            silence = 0.0


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
