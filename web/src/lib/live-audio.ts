// Browser audio plumbing for the Gemini Live voice agent: the microphone goes
// out as 16 kHz PCM, the model's 24 kHz PCM is queued for gapless playback,
// and both sides expose a 0..1 loudness for the orb.

const OUTPUT_RATE = 24000;

export type LiveAudio = {
  levels: () => { input: number; output: number };
  play: (base64: string) => void;
  flush: () => void;
  close: () => void;
};

export async function openLiveAudio(onChunk: (base64: string) => void): Promise<LiveAudio> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const context = new AudioContext();
  try {
    await context.audioWorklet.addModule("/worklets/pcm-capture.js");
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
    throw error;
  }
  await context.resume();

  const mic = context.createMediaStreamSource(stream);
  const capture = new AudioWorkletNode(context, "pcm-capture");
  const mute = context.createGain();
  mute.gain.value = 0;
  mic.connect(capture).connect(mute).connect(context.destination);
  capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => onChunk(toBase64(event.data));

  const inputMeter = context.createAnalyser();
  inputMeter.fftSize = 512;
  mic.connect(inputMeter);

  const outputMeter = context.createAnalyser();
  outputMeter.fftSize = 512;
  outputMeter.connect(context.destination);

  const playing = new Set<AudioBufferSourceNode>();
  const scratch = new Float32Array(512);
  let cursor = 0;

  return {
    levels: () => ({ input: loudness(inputMeter, scratch), output: loudness(outputMeter, scratch) }),
    play(base64) {
      const pcm = new Int16Array(fromBase64(base64));
      if (!pcm.length) return;
      const buffer = context.createBuffer(1, pcm.length, OUTPUT_RATE);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < pcm.length; index += 1) samples[index] = pcm[index] / 0x8000;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(outputMeter);
      cursor = Math.max(cursor, context.currentTime + 0.03);
      source.start(cursor);
      cursor += buffer.duration;
      playing.add(source);
      source.onended = () => playing.delete(source);
    },
    flush() {
      playing.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* Already finished. */
        }
      });
      playing.clear();
      cursor = 0;
    },
    close() {
      capture.port.onmessage = null;
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
    },
  };
}

function loudness(meter: AnalyserNode, scratch: Float32Array<ArrayBuffer>) {
  meter.getFloatTimeDomainData(scratch);
  let energy = 0;
  for (let index = 0; index < scratch.length; index += 1) energy += scratch[index] * scratch[index];
  return Math.min(1, Math.sqrt(energy / scratch.length) * 4);
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length & ~1);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
