// Son de l'autre personne pour les sous-titres : mono, ramené à 16 kHz, en entiers 16 bits,
// par morceaux d'un quart de seconde
class CaptureSon extends AudioWorkletProcessor {
    constructor() {
        super();
        this.ratio = sampleRate / 16000;
        this.position = 0;
        this.buffer = new Int16Array(4000);
        this.length = 0;
    }

    process(inputs) {
        const channel = inputs[0]?.[0];
        if (!channel) return true;
        for (; this.position < channel.length; this.position += this.ratio) {
            const sample = Math.max(-1, Math.min(1, channel[Math.floor(this.position)]));
            this.buffer[this.length++] = sample * 0x7fff;
            if (this.length === this.buffer.length) {
                this.port.postMessage(this.buffer.slice().buffer);
                this.length = 0;
            }
        }
        this.position -= channel.length;
        return true;
    }
}

registerProcessor('capture-son', CaptureSon);
