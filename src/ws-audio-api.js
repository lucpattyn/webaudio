//    WebSockets Audio API
//
//    Opus Quality Settings
//    =====================
//    App: 2048=voip, 2049=audio, 2051=low-delay
//    Sample Rate: 8000, 12000, 16000, 24000, or 48000
//    Frame Duration: 2.5, 5, 10, 20, 40, 60
//    Buffer Size = sample rate/6000 * 1024

//(

function startWSAudioAPI(global) {
	var defaultConfig = {
		codec: {
			sampleRate: 24000,
			channels: 1,
			app: 2048,
			frameDuration: 20,
			bufferSize: 4096
		},
		server: {
			host: window.location.hostname + "/webaudio/",
			port: 443
		}
	};

	//alert('start ws audio api');

	var audioContext = new(window.AudioContext || window.webkitAudioContext)();

	var WSAudioAPI = global.WSAudioAPI = {
		Player: function(config, socket) {
			this.config = {};
			this.config.codec = this.config.codec || defaultConfig.codec;
			this.config.server = this.config.server || defaultConfig.server;
			this.sampler = new Resampler(this.config.codec.sampleRate, 44100, 1, this.config.codec.bufferSize);
			this.parentSocket = socket;
			this.decoder = new OpusDecoder(this.config.codec.sampleRate, this.config.codec.channels);
			this.silence = new Float32Array(this.config.codec.bufferSize);
		},
		Streamer: function(config, socket) {
			navigator.getUserMedia = (navigator.getUserMedia ||
				navigator.webkitGetUserMedia ||
				navigator.mozGetUserMedia ||
				navigator.msGetUserMedia);

			this.config = {};
			this.config.codec = this.config.codec || defaultConfig.codec;
			this.config.server = this.config.server || defaultConfig.server;
			this.sampler = new Resampler(44100, this.config.codec.sampleRate, 1, this.config.codec.bufferSize);
			this.parentSocket = socket;
			this.encoder = new OpusEncoder(this.config.codec.sampleRate, this.config.codec.channels, this.config.codec.app, this.config.codec.frameDuration);
			var _this = this;
			
			// LUC: 20200705

			var canvas = document.getElementById("preview");
            		var context = canvas.getContext('2d');
        
            		canvas.width = 320;
            		canvas.height = 120;
        
            		context.width = canvas.width;
            		context.height = canvas.height;
        
            		var video = document.getElementById("video");

			var w = 640;
			var h = 480;

			var printed = false;
			var Draw = function(vdo, context){
 				context.drawImage(vdo, 0, 0, w, h/2, 0, 0, context.width, context.height);
				
				var image = {"demo" : {
                        		"type"  : "device1",
                        		"image" : canvas.toDataURL("image/webp", 0.8)
                    		}};
                    		
				if (_this.socket.readyState == 1) _this.socket.send( JSON.stringify( image ) );

				context.drawImage(vdo, 0, h/2, w, h/2, 0, 0, context.width, context.height);
				
				image = {"demo" : {
                        		"type"  : "device2",
                        		"image" : canvas.toDataURL("image/webp", 0.8)
                    		}};
                    		
				if (_this.socket.readyState == 1) _this.socket.send( JSON.stringify( image ) );


				//if (_this.socket.readyState == 1) _this.socket.send(pixels);
				//if(!printed){
				//	console.log(pixels[0]);
				//	printed = true;
				//}
				
			};
	
			this._makeStream = function(onError) {

				navigator.getUserMedia({ video:true, audio: true }, function(mediaStream) {

					var stream = new MediaStream(mediaStream.getAudioTracks());
					var videoStream = new MediaStream(mediaStream.getVideoTracks());

					try {
                  				video.srcObject = videoStream;
              				} 
              
              				catch (error) {
               					video.src = URL.createObjectURL(videoStream);
              				}

					console.log('camera connected');


					 setInterval(function(){
                    				Draw(video, context);
                			 }, 30);


					_this.stream = stream;
					_this.audioInput = audioContext.createMediaStreamSource(stream);
					_this.gainNode = audioContext.createGain();
					_this.recorder = audioContext.createScriptProcessor(_this.config.codec.bufferSize, 1, 1);
					_this.recorder.onaudioprocess = function(e) {
						var resampled = _this.sampler.resampler(e.inputBuffer.getChannelData(0));
						var packets = _this.encoder.encode_float(resampled);
						for (var i = 0; i < packets.length; i++) {
							if (_this.socket.readyState == 1) _this.socket.send(packets[i]);
						}
					};
					_this.audioInput.connect(_this.gainNode);
					_this.gainNode.connect(_this.recorder);
					_this.recorder.connect(audioContext.destination);
				}, onError || _this.onError);
			}
		}
	};

	WSAudioAPI.Streamer.prototype.start = function(onError) {
		var _this = this;

		if (!this.parentSocket) {
			this.socket = new WebSocket('wss://' + this.config.server.host + ':' + this.config.server.port);
		} else {
			this.socket = this.parentSocket;
		}

		// LUC: 20200706
		//this.socket.binaryType = 'arraybuffer';

		if (this.socket.readyState == WebSocket.OPEN) {
			this._makeStream(onError);
		} else if (this.socket.readyState == WebSocket.CONNECTING) {
			var _onopen = this.socket.onopen;
			this.socket.onopen = function() {
				if (_onopen) {
					_onopen();
				}
				_this._makeStream(onError);
			}
		} else {
			console.error('Socket is in CLOSED state');
		}

		var _onclose = this.socket.onclose;
		this.socket.onclose = function() {
			if (_onclose) {
				_onclose();
			}
			if (_this.audioInput) {
				_this.audioInput.disconnect();
				_this.audioInput = null;
			}
			if (_this.gainNode) {
				_this.gainNode.disconnect();
				_this.gainNode = null;
			}
			if (_this.recorder) {
				_this.recorder.disconnect();
				_this.recorder = null;
			}
			_this.stream.getTracks()[0].stop();
			console.log('Disconnected from server');
		};
	};

	WSAudioAPI.Streamer.prototype.mute = function() {
		this.gainNode.gain.value = 0;
		console.log('Mic muted');
	};

	WSAudioAPI.Streamer.prototype.unMute = function() {
		this.gainNode.gain.value = 1;
		console.log('Mic unmuted');
	};

	WSAudioAPI.Streamer.prototype.onError = function(e) {
		var error = new Error(e.name);
		error.name = 'NavigatorUserMediaError';
		throw error;
	};

	WSAudioAPI.Streamer.prototype.stop = function() {
		if (this.audioInput) {
			this.audioInput.disconnect();
			this.audioInput = null;
		}
		if (this.gainNode) {
			this.gainNode.disconnect();
			this.gainNode = null;
		}
		if (this.recorder) {
			this.recorder.disconnect();
			this.recorder = null;
		}
		this.stream.getTracks()[0].stop()

		if (!this.parentSocket) {
			this.socket.close();
		}
	};

	WSAudioAPI.Player.prototype.start = function() {
		var _this = this;

		this.audioQueue = {
			buffer: new Float32Array(0),

			write: function(newAudio) {
				var currentQLength = this.buffer.length;
				newAudio = _this.sampler.resampler(newAudio);
				var newBuffer = new Float32Array(currentQLength + newAudio.length);
				newBuffer.set(this.buffer, 0);
				newBuffer.set(newAudio, currentQLength);
				this.buffer = newBuffer;
			},

			read: function(nSamples) {
				var samplesToPlay = this.buffer.subarray(0, nSamples);
				this.buffer = this.buffer.subarray(nSamples, this.buffer.length);
				return samplesToPlay;
			},

			length: function() {
				return this.buffer.length;
			}
		};

		this.scriptNode = audioContext.createScriptProcessor(this.config.codec.bufferSize, 1, 1);
		this.scriptNode.onaudioprocess = function(e) {
			if (_this.audioQueue.length()) {
				e.outputBuffer.getChannelData(0).set(_this.audioQueue.read(_this.config.codec.bufferSize));
			} else {
				e.outputBuffer.getChannelData(0).set(_this.silence);
			}
		};
		this.gainNode = audioContext.createGain();
		this.scriptNode.connect(this.gainNode);
		this.gainNode.connect(audioContext.destination);

		if (!this.parentSocket) {
			this.socket = new WebSocket('wss://' + this.config.server.host + ':' + this.config.server.port);
		} else {
			this.socket = this.parentSocket;
		}
        //this.socket.onopen = function () {
        //    console.log('Connected to server ' + _this.config.server.host + ' as listener');
        //};

	// LUC: 20200705

		var canvas = document.getElementById("preview");
            	var context = canvas.getContext('2d');
                canvas.width = 320;
            	canvas.height = 240;
        
            	context.width = canvas.width;
            	context.height = canvas.height;
        
            		
		var printed = false;
		var Render = function(ctx, imageData){
 			ctx.putImageData(imageData, 320, 240);
			if(!printed){
				//console.log(pixels);
				printed = true;
			}
				
		};
	

	
        var _onmessage = this.parentOnmessage = this.socket.onmessage;
        this.socket.onmessage = function(message) {
        	if (_onmessage) {
        		_onmessage(message);
        	}
		
		//console.log("rendering:" + message.data);

		//Render(context, message.data);

		// LUC: 20200705
		if ( typeof message.data !== 'object' ) {

                    var dataObj = JSON.parse(message.data);

                    if ( dataObj.demo.type === "device1" ) {
                        var img = document.getElementById('play1');
                        img.src = dataObj.demo.image;
                        //console.log("playing1 ..");

                    }else if ( dataObj.demo.type === "device2" ){
 			var img = document.getElementById('play2');
                        img.src = dataObj.demo.image;
                        //console.log("playing2 ..");


		    }

                }else if (message.data instanceof Blob) {
        		var reader = new FileReader();
        		reader.onload = function() {
				try{
        				_this.audioQueue.write(_this.decoder.decode_float(reader.result));
				} catch (err){
					console.log('audio queue error');
					

				}
        		};
        		reader.readAsArrayBuffer(message.data);
			//console.log('reading as array buffer')
        	}
        };
        //this.socket.onclose = function () {
        //    console.log('Connection to server closed');
        //};
        //this.socket.onerror = function (err) {
        //    console.log('Getting audio data error:', err);
        //};
      };

      WSAudioAPI.Player.prototype.getVolume = function() {
      	return this.gainNode ? this.gainNode.gain.value : 'Stream not started yet';
      };

      WSAudioAPI.Player.prototype.setVolume = function(value) {
      	if (this.gainNode) this.gainNode.gain.value = value;
      };

      WSAudioAPI.Player.prototype.stop = function() {
      	this.audioQueue = null;
      	this.scriptNode.disconnect();
      	this.scriptNode = null;
      	this.gainNode.disconnect();
      	this.gainNode = null;

      	if (!this.parentSocket) {
      		this.socket.close();
      	} else {
      		this.socket.onmessage = this.parentOnmessage;
      	}
      };
    };//)(window);
