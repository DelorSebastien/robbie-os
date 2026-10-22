import sys
import json
import base64
import asyncio
import threading

import edge_tts

# Serveur de synthèse vocale : lancé une seule fois, il reçoit les phrases
# (une requête JSON par ligne) et les synthétise en parallèle
sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")


async def synthesize(request):
    try:
        communicate = edge_tts.Communicate(
            request["text"],
            request["voice"],
            rate=request.get("rate", "+0%"),
            pitch=request.get("pitch", "+0Hz")
        )

        audio = bytearray()

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])

        reply = {"id": request["id"], "audio": base64.b64encode(audio).decode()}
    except Exception as error:
        reply = {"id": request["id"], "error": str(error)}

    print(json.dumps(reply), flush=True)


async def main():
    loop = asyncio.get_running_loop()
    requests = asyncio.Queue()

    # Lecture de l'entrée standard dans un fil séparé
    def read():
        for line in sys.stdin:
            loop.call_soon_threadsafe(requests.put_nowait, line)
        loop.call_soon_threadsafe(requests.put_nowait, None)

    threading.Thread(target=read, daemon=True).start()

    while True:
        line = await requests.get()
        if line is None:
            break

        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue

        asyncio.create_task(synthesize(request))


asyncio.run(main())
