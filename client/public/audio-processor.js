// AudioWorklet processor for capturing and downsampling audio to 16kHz LINEAR16 PCM
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleBuffer = [];
    this.targetSampleRate = 16000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (input.length > 0) {
      const inputData = input[0]; // Mono channel
      
      // Downsample from 48kHz (or native rate) to 16kHz
      const downsampleRatio = sampleRate / this.targetSampleRate;
      
      for (let i = 0; i < inputData.length; i += downsampleRatio) {
        const index = Math.floor(i);
        if (index < inputData.length) {
          this.sampleBuffer.push(inputData[index]);
        }
      }

      // Send chunks of ~4096 samples (0.25 seconds at 16kHz)
      if (this.sampleBuffer.length >= 4096) {
        const chunk = this.sampleBuffer.slice(0, 4096);
        this.sampleBuffer = this.sampleBuffer.slice(4096);
        
        // Convert Float32 to Int16
        const pcm16 = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          const s = Math.max(-1, Math.min(1, chunk[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send to main thread
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
