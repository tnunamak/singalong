navigator.getUserMedia  = navigator.getUserMedia ||
                          navigator.webkitGetUserMedia ||
                          navigator.mozGetUserMedia ||
                          navigator.msGetUserMedia;

window.AudioContext = window.AudioContext ||
                      window.webkitAudioContext;

var game = new Phaser.Game(window.innerWidth, window.innerHeight, Phaser.AUTO, 'game_div');
var game_state = {};
var circleRadius;
var redGreenInterpolator = d3.scale.linear()
                            .range(["red", "green"])
                            .interpolate(d3.interpolateHcl);
var label;

var LOWER_BOUND = 0;
var UPPER_BOUND = 3000;
//var UPPER_BOUND = 20000;
// var A_PITCH = 432;
var A_PITCH = 440;
var recorded = [];
var recordEvery = 50;

function clamp(min, max, num) {
  return Math.min(Math.max(num, min), max);
}

function noteData( frequency ) {
  var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var note = noteFromPitch(frequency);
  return { octave: Math.floor(note/12), note: noteStrings[note % 12], centsOff: centsOffFromPitch(frequency, note) };
}

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFromPitch( frequency ) {
  var noteNum = 12 * (Math.log( frequency / A_PITCH)/Math.log(2) );
  return Math.round( noteNum ) + 69;
}

function frequencyFromNoteNumber( note ) {
  return A_PITCH * Math.pow(2,(note-69)/12);
}

function centsOffFromPitch( frequency, note ) {
  return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}

// Creates a new 'main' state that wil contain the game
game_state.main = function() { };
game_state.main.prototype = {

    preload: function() {
	// Function called first to load all the assets
    },

    create: function() {
      circleRadius = this.game.height / 15;
    	// Fuction called after 'preload' to setup the game

        // add a new graphics object at the center of the world
	circles = this.game.add.graphics(game.world.centerX, 0);
        this.game.stage.backgroundColor = '#ffffff';

        this.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
        //this.scale.pageAlignHorizontally = true;
        this.scale.pageAlignVertically = true;
        this.scale.setScreenSize( true );

        circles.offsetX = 0.5 * circleRadius;
        circles.offsetY = 0.5 * circleRadius;

        label = game.add.text(this.game.width / 2 + 100, this.game.height / 2 - 60, '', { font: "60px Arial", fill: "#000000", align: "left" });
    },

    update: _.throttle(function() {
        var diameter = circleRadius * 2;
        function getNoteY(freq) {
          var data = noteData(freq);
          var position = clamp(0, 1, (freq - LOWER_BOUND) / (UPPER_BOUND - LOWER_BOUND));
          return clamp(circleRadius, this.game.height - circleRadius, this.game.height * (1 - position));
        }

        function getNoteColor(data) {
          // TODO choose a sensible value
          var acceptablePercentOff = 10;
          var color = redGreenInterpolator(1 - Math.min(Math.abs(data.centsOff), acceptablePercentOff)/acceptablePercentOff);
          return parseInt(color.replace("#", "0x"), 16);
        }

        var data = getData();

        var freqs = _.map(data, function(dBs, index) {
          return { freq: getFrequency(index, data.length), vol: dBs };
        });

        var maxFreq = _.max(freqs, function(freq) {
          return freq.vol;
        });

        circles.clear();

        //if(maxFreq.vol > -120) {
        if(maxFreq.vol > -60) {
          var data = noteData(maxFreq.freq); // todo use a better name

          label.text = Math.round(maxFreq.freq) + ' ♪ ' + data.note + ' err ' + data.centsOff;
          circles.beginFill(getNoteColor(data));
          circles.drawCircle(0, getNoteY(maxFreq.freq), diameter);

          recorded.unshift({ maxFreq: maxFreq, time: new Date().getTime()});
        }

        var now = new Date().getTime();

        function roundToNearest(num, step) {
          return Math.round(num/step)*step;
        }

        var toRemove = 0;
        _.each(_.rest(recorded), function(freq) {
          var d = diameter / 7;
          var offset = -((1.1 * d * (roundToNearest(now - freq.time, recordEvery)/recordEvery)) + circleRadius);

          if(circles.x + offset >= 0) {
            circles.beginFill(getNoteColor(noteData(freq.maxFreq.freq)));
            circles.drawCircle(offset, getNoteY(freq.maxFreq.freq), d);
          } else {
            toRemove++;
          }
        });

        recorded.splice(-toRemove, toRemove);

    }, recordEvery)

};

function getFrequency(index, length) {
  var nyquist = context.sampleRate / 2;
  return index * nyquist / length;
}

function getFrequencyValue(frequency) {
  var nyquist = context.sampleRate/2;
  var index = Math.round(frequency/nyquist * freqDomain.length);
  return freqDomain[index];
}

// Add and start the 'main' state to start the game
game.state.add('main', game_state.main);

var context = new AudioContext();

if(hasGetUserMedia) {
  navigator.getUserMedia({ audio: true}, function(stream) {
    var microphone = context.createMediaStreamSource(stream);
    var analyser = context.createAnalyser();
    var node;

    if(!context.createScriptProcessor){
     node = context.createJavaScriptNode(2048, 1, 1);
    } else {
     node = context.createScriptProcessor(2048, 1, 1);
    }

    node.onaudioprocess = function(e){
      console.log(e.inputBuffer.getChannelData(0));
    };

    start(function() {
      // It's really lame to recreate analyser every time but for some reason it seemed to be using stale data
      freqDomain = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(freqDomain);
      analyser = context.createAnalyser();
      microphone.connect(analyser);
      return freqDomain;
    });
  }, function(err) {
    alert('error capturing audio');
  });

} else {
  alert('getUserMedia() is not supported in your browser');
}

function start(getData) {
  window.getData = getData;
  game.state.start('main');
}

function hasGetUserMedia() {
  return !!(navigator.getUserMedia || navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia || navigator.msGetUserMedia);
}
