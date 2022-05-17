const microevent = require('microevent');

// get audio context
const AudioContextType = window.AudioContext || window.webkitAudioContext;

// f_1 band for (most) human voice range
const LOW_FREQ_CUT = 85;
const HIGH_FREQ_CUT = 583;
// TODO - this should use the geometric mean, not arithmetic
// but it seems to be working for now and I don't want to make
// any changes without thoroughly testing them
const bandPassMiddleFrequency = ((HIGH_FREQ_CUT - LOW_FREQ_CUT) / 2) + LOW_FREQ_CUT;
const Q = bandPassMiddleFrequency / (HIGH_FREQ_CUT - LOW_FREQ_CUT);

function getMaxVolume (volumesByFrequency) {
  let maxVolume = -Infinity;

  // I have no idea why this loop starts at 4
  // I would guess it has something to do with the lower frequencies
  // being irrelevant or undesirable? But if so then we should tighten our bandpass
  // filter.
  // - jr 3.9.21
  for (let i=4; i < volumesByFrequency.length; i++) {
    // i'm assuming the < 0 check here is just for sanity
    // because to the best of my knowledge 0 is the maximum possible value
    // - jr
    if (volumesByFrequency[i] > maxVolume && volumesByFrequency[i] < 0) {
      maxVolume = volumesByFrequency[i];
    }
  };

  return maxVolume;
}

// bandpass filter from AudioContext
function bandPassFilterNode (audioContext) {
  const bandpass = audioContext.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = bandPassMiddleFrequency;
  bandpass.Q.value = Q;
  return bandpass;
}

function speakingDetectionNode (audioContext, analyser, threshold, emitter) {
  const javascriptNode = AudioWorkletNode(audioContext, 'processor-audio')
  let speakingStartTime = null;
  let lastSpeakingTime = null;
  let currentVolume = -Infinity;
  let volumes = [];

  // returns true if the user has not spoken in 250ms or more
  // no idea why this number was chosen
  const hasStoppedSpeaking = () => ((Date.now() - lastSpeakingTime) > 250);

  javascriptNode.onaudioprocess = function () {
    const fftBins = new Float32Array(analyser.frequencyBinCount);
    // the results of getFloatFrequencyData are placed into fftBins
    analyser.getFloatFrequencyData(fftBins);
    currentVolume = getMaxVolume(fftBins);

    emitter.trigger('volumeChange', currentVolume);
    if (currentVolume > threshold) {
      lastSpeakingTime = Date.now();
      if (speakingStartTime === null) {
        // this is the start of a new utterance
        speakingStartTime = lastSpeakingTime;
      }
      emitter.trigger('speaking');
      volumes.push({
        timestamp: (lastSpeakingTime - speakingStartTime),
        vol: currentVolume,
      });
    // the user is not speaking but we're currently in a speaking event
    } else if (speakingStartTime !== null) {
      if (hasStoppedSpeaking()) {
        emitter.trigger('stoppedSpeaking', {
          'start': new Date(speakingStartTime),
          'end': new Date(lastSpeakingTime),
          'volumes': volumes,
        });

        // utterance is officially ended,
        // reset all the variables and start again
        volumes = [];
        speakingStartTime = null;
        lastSpeakingTime = null;
      // the user is not speaking in this exact moment,
      // but we have not determined the speaking event to have fully stopped yet
      } else {
        volumes.push({timestamp: Date.now() - speakingStartTime, vol: currentVolume});
      }
    }
  };
  return javascriptNode;
}

var audioContext = null;

class Sibilant {
  constructor (stream, options) {
    options = options || {};
    this.fftSize = (options.fftSize || 512);
    this.threshold = (options.threshold || -40);
    this.smoothing = (options.smoothing || 0.2);
    this.passThrough = (options.passThrough || false);


    console.log("middle freq:", bandPassMiddleFrequency);
    console.log("range / Q:", Q);

    // Ensure that just a single AudioContext is internally created
    this.audioContext = options.audioContext || audioContext || new AudioContextType();

    this.sourceNode = null;
    this.analyser = null;

    this.getStream(stream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = this.smoothing;

    this.audioSource = this.sourceNode;

    const speakingNode = speakingDetectionNode(this.audioContext, this.analyser, this.threshold, this);
    const bandPassNode = bandPassFilterNode(this.audioContext);
    this.audioSource.connect(this.analyser);
    if (this.passThrough) {
      console.log('passing through', stream);
      this.analyser.connect(this.audioContext.destination);
    }
    this.analyser.connect(bandPassNode);
    bandPassNode.connect(speakingNode);
    // needed for chrome onprocessaudio compatibility
    speakingNode.connect(this.audioContext.destination);
  }

  getStream (stream) {
    // no idea what this does, can't find any documentation about it either
    if (stream.jquery) {
      stream = stream[0];
    }

    if (stream instanceof HTMLAudioElement || stream instanceof HTMLVideoElement) {
      //Audio Tag
      this.sourceNode = this.audioContext.createMediaElementSource(stream);
      // this.threshold already has a default value of -40
      // when initialized in the constructor
      // why are we doing this here with a different value?
      this.threshold = this.threshold || -50;
    } else {
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      // same as above
      this.threshold = this.threshold || -50;
    }
  }

  suspend () {
    this.audioContext.suspend();
  }

  resume () {
    this.audioContext.resume();
  }
}

microevent.mixin(Sibilant);

module.exports = Sibilant;
