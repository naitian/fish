pd = require('pitch-detector');
window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = null;
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var mediaStreamSource = null;
var prevNote = null;
var noteElem,
    foremanElem;

window.onload = function() {
  audioContext = new AudioContext();
  noteElem = document.querySelector('.pitch');
  foremanElem = document.querySelector('.foreman');
  MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000)); // 5kHz
  toggleLiveInput();
};

function error() {
  alert('Stream generation failed.');
}

function gotStream(stream) {
  // Create an AudioNode from the stream.
  mediaStreamSource = audioContext.createMediaStreamSource(stream);

  // Connect it to the destination.
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  mediaStreamSource.connect( analyser );
  updatePitch();
}

function toggleLiveInput() {
  if (isPlaying) {
    //stop playing and return
    sourceNode.stop( 0 );
    sourceNode = null;
    analyser = null;
    isPlaying = false;
    if (!window.cancelAnimationFrame)
      window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
    window.cancelAnimationFrame( rafID );
  }
  getUserMedia(
    {
      "audio": {
        "mandatory": {
          "googEchoCancellation": "false",
          "googAutoGainControl": "false",
          "googNoiseSuppression": "false",
          "googHighpassFilter": "false"
        },
        "optional": []
      },
    }, gotStream);
}

function getUserMedia(dictionary, callback) {
  try {
    navigator.getUserMedia =
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia;
    navigator.getUserMedia(dictionary, callback, error);
  } catch (e) {
    alert('getUserMedia threw exception :' + e);
  }
}

function togglePlayback() {
  if (isPlaying) {
    //stop playing and return
    sourceNode.stop( 0 );
    sourceNode = null;
    analyser = null;
    isPlaying = false;
    if (!window.cancelAnimationFrame)
      window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
    window.cancelAnimationFrame( rafID );
    return "start";
  }

  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = theBuffer;
  sourceNode.loop = true;

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  sourceNode.connect( analyser );
  analyser.connect( audioContext.destination );
  sourceNode.start( 0 );
  isPlaying = true;
  isLiveInput = false;
  updatePitch();

  return "stop";
}

var rafID = null;
var buflen = 4096;
var buf = new Float32Array( buflen );

var noteStrings = ['C',
                  'C#',
                  'D',
                  'D#',
                  'E',
                  'F',
                  'F#',
                  'G',
                  'G#',
                  'A',
                  'A#',
                  'B'];

function noteFromPitch( frequency ) {
  var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
  return Math.round( noteNum ) + 69;
}

function frequencyFromNoteNumber( note ) {
  return 440 * Math.pow(2,(note-69)/12);
}

function centsOffFromPitch( frequency, note ) {
  return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}

var MIN_SAMPLES = 4;  // will be initialized when AudioContext is created.
var GOOD_ENOUGH_CORRELATION = 0.9; // how close a correlation needs to be

function autoCorrelate( buf, sampleRate ) {
  var SIZE = buf.length;
  var MAX_SAMPLES = Math.floor(SIZE/2);
  var bestOffset = -1;
  var bestCorrelation = 0;
  var rms = 0;
  var foundGoodCorrelation = false;
  var correlations = new Array(MAX_SAMPLES);

  for (let i = 0; i < SIZE; i++) {
    var val = buf[i];
    rms += val*val;
  }
  rms = Math.sqrt(rms/SIZE);
  if (rms < 0.01) {
    // not enough signal
    return -1;
  }

  var lastCorrelation=1;
  for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
    var correlation = 0;

    for (var i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs((buf[i])-(buf[i+offset]));
    }
    correlation = 1 - (correlation/MAX_SAMPLES);
    correlations[offset] = correlation;

    if ((correlation>GOOD_ENOUGH_CORRELATION) &&
        (correlation > lastCorrelation)) {
      foundGoodCorrelation = true;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    } else if (foundGoodCorrelation) {
      // short-circuit - we found a good correlation, then a bad one,
      // so we'd just be seeing copies from here.
      // Now we need to tweak the offset - by interpolating between the
      // values to the left and right of the best offset, and shifting it a bit.
      // This is complex, and HACKY in this code (happy to take PRs!) -
      // we need to do a curve fit on correlations[] around bestOffset
      // in order to better determine precise (anti-aliased) offset.

      // we know bestOffset >=1, since foundGoodCorrelation cannot go to
      // true until the second pass (offset=1), and we can't drop into this
      // clause until the following pass (else if).

      var shift = (correlations[bestOffset+1] -
                  correlations[bestOffset-1])/correlations[bestOffset];
      return sampleRate/(bestOffset+(8*shift));
    }
    lastCorrelation = correlation;
  }
  if (bestCorrelation > 0.01) {
    return sampleRate/bestOffset;
  }
  return -1;
}

function updatePitch( time ) {
  // var cycles = new Array;
  analyser.getFloatTimeDomainData( buf );
  // var ac = autoCorrelate( buf, audioContext.sampleRate );

  // return;
  const hz = pd.Pitcher.pitch(buf, audioContext.sampleRate);
  const note = new pd.Note(hz);

  // console.log(hz, note.name());

  if (hz === -1) {
    // Not confident
    // noteElem.innerHTML = `${noteStrings[note%12]} (${detune}) grey`;
  } else {
    // Confident
    var n =  noteFromPitch( hz );
    var detune = centsOffFromPitch( hz, n );
    noteElem.innerHTML = `${note.name()} (${detune})`;
    if (Math.abs(detune) < 10 ) {
      // In tune
      foremanElem.src = ['./img/happy.jpg'];
      document.body.classList = 'in-tune';
    } else {
      // Out of tune
      foremanElem.src = './img/sad.png';
      document.body.classList =[ 'out-of-tune'];
      if (detune < 0) {

      } else {

      }
      // detuneAmount.innerHTML = Math.abs( detune );
    }
  }

  if (!window.requestAnimationFrame)
    window.requestAnimationFrame = window.webkitRequestAnimationFrame;
  rafID = window.requestAnimationFrame( updatePitch );
}
