import os
import re
import sys
import json
import base64
import time
import queue
import threading
from collections import deque
from pathlib import Path

import numpy as np
import sounddevice as sd

# Sortie en UTF-8 pour conserver les accents
sys.stdout.reconfigure(encoding="utf-8")

# Configuration
# Modèle : large-v3-turbo sur carte graphique (bien plus précis), small sur processeur
GPU_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
CPU_MODEL = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "auto")  # auto, cuda ou cpu
SAMPLE_RATE = 16000
BLOCK_SECONDS = 0.1
# Volume minimal à partir duquel on considère qu'on parle (réglable : VOICE_THRESHOLD)
VOICE_THRESHOLD = int(os.environ.get("VOICE_THRESHOLD", 150))
NOISE_FACTOR = 3          # la voix doit dépasser le bruit de fond (ambiance, ventilateur) de ce facteur
SILENCE_END = 0.8         # secondes de silence qui terminent une phrase
MIN_SPEECH = 0.4          # durée minimale d'une phrase
MAX_SPEECH = 15           # durée maximale d'une phrase

# Phrase jugée incertaine (Robbie fait répéter) : les mots hors vocabulaire connu
# sont en moyenne peu probables ET la phrase entière aussi (mesuré : du charabia comme
# « Jugez Ming » tombe vers 0,71 / -0,6, une vraie phrase est au-dessus de 0,85 / -0,45)
UNSURE_WORDS = 0.75
UNSURE_LOGPROB = -0.5

# Phrases inventées par Whisper sur du bruit
HALLUCINATIONS = (
    "sous-titres", "amara.org", "merci d'avoir regardé",
    "abonnez-vous", "sous-titrage", "merci à tous"
)


# Ajout des bibliothèques CUDA installées par pip (Windows)
def add_cuda_libraries():
    try:
        import nvidia
    except ImportError:
        return False

    found = set()

    for base in nvidia.__path__:
        for name in ("cublas", "cudnn"):
            folder = Path(base) / name / "bin"

            if folder.exists():
                os.add_dll_directory(str(folder))
                os.environ["PATH"] = str(folder) + os.pathsep + os.environ["PATH"]
                found.add(name)

    return found == {"cublas", "cudnn"}


# Chargement de Whisper sur la carte graphique, sinon sur le processeur
def load_model():
    from faster_whisper import WhisperModel

    if DEVICE != "cpu" and add_cuda_libraries():
        try:
            model = WhisperModel(GPU_MODEL, device="cuda", compute_type="float16")

            # Premier passage pour vérifier que CUDA fonctionne vraiment
            segments, _ = model.transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32), language="fr")
            list(segments)

            print(f"Whisper {GPU_MODEL} : carte graphique", file=sys.stderr, flush=True)
            return model
        except Exception as error:
            print(f"Whisper : CUDA indisponible ({error})", file=sys.stderr, flush=True)

    print(f"Whisper {CPU_MODEL} : processeur", file=sys.stderr, flush=True)
    return WhisperModel(CPU_MODEL, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)


model = load_model()


# Vocabulaire de l'utilisateur (prénom, ville, jeux, applications), envoyé par l'appli :
# Whisper l'écrit plus volontiers (« Parsecs » au lieu de « par sec »)
vocabulary = {"hotwords": None, "words": set()}

# Son à analyser : (source, échantillons) ; source « pc » (ce micro) ou « phone »
# (le micro du téléphone, quand Robbie y est : le son arrive par l'appli)
audio = queue.Queue()
listening = {"source": "pc"}


def set_vocabulary(terms):
    # (les mots prioritaires prennent de la place dans l'amorce de Whisper : liste limitée)
    hotwords = ""
    for term in terms:
        if len(hotwords) + len(term) > 400:
            break
        hotwords += (", " if hotwords else "") + term

    vocabulary["hotwords"] = hotwords or None
    vocabulary["words"] = {word for term in terms for word in re.findall(r"\w+", term.lower())}
    print(f"Vocabulaire : {len(terms)} termes ({hotwords[:120]}...)", file=sys.stderr, flush=True)


# Messages de l'appli (une ligne JSON chacun) : vocabulaire, son du téléphone, source écoutée
def read_commands():
    for line in sys.stdin:
        try:
            message = json.loads(line)
        except ValueError:
            continue

        if "audio" in message:
            audio.put(("phone", base64.b64decode(message["audio"])))
        if "vocabulary" in message:
            set_vocabulary(message["vocabulary"])
        # (« aucun » : oreille coupée, par exemple pendant que Robbie parle)
        if message.get("listen") in ("pc", "phone", "aucun"):
            listening["source"] = message["listen"]


threading.Thread(target=read_commands, daemon=True).start()


# Mot du vocabulaire connu (« Parsec » compte pour « Parsecs »)
def known(word):
    return word in vocabulary["words"] or (len(word) >= 4 and any(
        len(term) >= 4 and (term.startswith(word) or word.startswith(term)) for term in vocabulary["words"]))


# Transcription d'une phrase complète
def transcribe(samples):
    audio_data = samples.astype(np.float32) / 32768

    segments, _ = model.transcribe(
        audio_data,
        language="fr",
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        word_timestamps=True,
        initial_prompt="Robbie, le petit robot de bureau.",  # aide à bien écrire « Robbie »
        hotwords=vocabulary["hotwords"]
    )

    segments = list(segments)
    text = " ".join(segment.text.strip() for segment in segments).strip()

    if not text or any(word in text.lower() for word in HALLUCINATIONS):
        return

    # Whisper répète parfois sa phrase d'amorce sur du bruit
    if "petit robot de bureau" in text.lower():
        return

    # Confiance : les mots du vocabulaire connu (noms de jeux...) ne comptent pas,
    # Whisper les écrit juste mais avec peu d'assurance ; la ponctuation non plus
    words = [(re.sub(r"\W", "", w.word.lower()), w.probability) for s in segments for w in (s.words or [])]
    scores = [probability for word, probability in words if word and not known(word)]
    sure = np.mean(scores) if scores else 1
    logprob = np.mean([s.avg_logprob for s in segments])

    # (un seul mot hors vocabulaire, comme « Lance » dans « Lance Parsecs », ne suffit pas à juger)
    if len(scores) >= 2 and sure < UNSURE_WORDS and logprob < UNSURE_LOGPROB:
        print("Incertain :", text, flush=True)
    else:
        print("Entendu :", text, flush=True)


# Découpage en phrases d'un flux de son : début au premier son, fin après un silence
# (un découpage par source : le micro du PC et celui du téléphone ne se mélangent pas)
class Segmenter:
    def __init__(self):
        self.pre_roll = deque(maxlen=3)  # environ 300 ms conservées avant le début de la voix
        self.speech = []
        self.silence = 0
        self.recording = False
        self.noise_floor = 0
        self.last_voice_signal = 0

    def feed(self, samples):
        seconds = len(samples) / SAMPLE_RATE

        # Analyse du volume sonore
        volume = np.sqrt(np.mean(samples.astype(np.float32) ** 2))

        # Bruit de fond mesuré en continu hors de la parole : le seuil s'y adapte
        if not self.recording:
            self.noise_floor = volume if self.noise_floor == 0 else self.noise_floor * 0.97 + volume * 0.03

        loud = volume > max(VOICE_THRESHOLD, self.noise_floor * NOISE_FACTOR)

        # Détection immédiate d'un son
        if loud and time.monotonic() - self.last_voice_signal > 0.3:
            print("VOICE_ACTIVE", flush=True)
            self.last_voice_signal = time.monotonic()

        if self.recording:
            self.speech.append(samples)
            self.silence = 0 if loud else self.silence + seconds
            duration = sum(len(part) for part in self.speech) / SAMPLE_RATE

            if self.silence >= SILENCE_END or duration >= MAX_SPEECH:
                self.recording = False

                if duration - self.silence >= MIN_SPEECH:
                    transcribe(np.concatenate(self.speech))

                self.speech = []

        elif loud:
            self.recording = True
            self.speech = list(self.pre_roll) + [samples]
            self.silence = 0

        self.pre_roll.append(samples)


# Capture du microphone du PC
def callback(indata, frames, time_info, status):
    audio.put(("pc", bytes(indata)))


# Démarrage du microphone
with sd.RawInputStream(
    samplerate=SAMPLE_RATE,
    blocksize=int(SAMPLE_RATE * BLOCK_SECONDS),
    dtype="int16",
    channels=1,
    callback=callback
):
    print("Microphone activé. Je t'écoute...", flush=True)

    segmenters = {"pc": Segmenter(), "phone": Segmenter()}

    while True:
        source, data = audio.get()

        # Seul le micro du corps actif de Robbie est écouté (sinon il t'entendrait deux fois)
        if source != listening["source"] or len(data) < 2:
            continue

        segmenters[source].feed(np.frombuffer(data[:len(data) // 2 * 2], dtype=np.int16))
