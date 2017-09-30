const SHOT_TREMOR = 1.3;
const SHOT_DSIZE = 6;
const EXPLODE = 16;
const SHADOW = "rgb(15,15,15)";
var PADDING_V = 80;
var PADDING_H = 80;
var waiting = true;
var def;
var sounds;
var keys = [];
var ids = [];
var client;
var context;

var namespace = 'urn:x-cast:com.deprezal.floatingbrains';

function closeCast() {
  var e = document.getElementById("game");
  FX.fadeOut(e, {duration: 1500, complete: function() {
    e.remove();
    window.close();
  }});
}

window.castReceiverManager = cast.receiver.CastReceiverManager.getInstance();
window.castReceiverManager.onSenderDisconnected = function(event) {
  if(window.castReceiverManager.getSenders().length == 0) {
    closeCast();
  }
}
window.castReceiverManager = cast.receiver.CastReceiverManager.getInstance();       
window.messageBus = window.castReceiverManager.getCastMessageBus(namespace);
window.messageBus.onMessage = function(event) {
  if(event.data) {
    ids.push(event.data);
  }
  window.messageBus.send(event.senderId, event.data);
};
var appConfig = new cast.receiver.CastReceiverManager.Config();
appConfig.statusText = 'Ready to play';
window.castReceiverManager.start(appConfig);


if(typeof AudioContext !== "undefined") {
    context = new AudioContext();
} else if(typeof webkitAudioContext !== "undefined") {
    context = new webkitAudioContext();
}

(function() {
    var FX = {
        easing: {
            linear: function(progress) {
                return progress;
            },
            quadratic: function(progress) {
                return Math.pow(progress, 2);
            },
            swing: function(progress) {
                return 0.5 - Math.cos(progress * Math.PI) / 2;
            },
            circ: function(progress) {
                return 1 - Math.sin(Math.acos(progress));
            },
            back: function(progress, x) {
                return Math.pow(progress, 2) * ((x + 1) * progress - x);
            },
            bounce: function(progress) {
                for (var a = 0, b = 1, result; 1; a += b, b /= 2) {
                    if (progress >= (7 - 4 * a) / 11) {
                        return -Math.pow((11 - 6 * a - 11 * progress) / 4, 2) + Math.pow(b, 2);
                    }
                }
            },
            elastic: function(progress, x) {
                return Math.pow(2, 10 * (progress - 1)) * Math.cos(20 * Math.PI * x / 3 * progress);
            }
        },
        animate: function(options) {
            var start = new Date;
            var id = setInterval(function() {
                var timePassed = new Date - start;
                var progress = timePassed / options.duration;
                if (progress > 1) {
                    progress = 1;
                }
                options.progress = progress;
                var delta = options.delta(progress);
                options.step(delta);
                if (progress == 1) {
                    clearInterval(id);
                    options.complete();
                }
            }, options.delay || 10);
        },
        fadeOut: function(element, options) {
            var to = 1;
            this.animate({
                duration: options.duration,
                delta: function(progress) {
                    progress = this.progress;
                    return FX.easing.swing(progress);
                },
                complete: options.complete,
                step: function(delta) {
                    element.style.opacity = to - delta;
                }
            });
        },
        fadeIn: function(element, options) {
            var to = 0;
            this.animate({
                duration: options.duration,
                delta: function(progress) {
                    progress = this.progress;
                    return FX.easing.swing(progress);
                },
                complete: options.complete,
                step: function(delta) {
                    element.style.opacity = to + delta;
                }
            });
        }
    };
    window.FX = FX;
})()


function Client(socket, listener) {
	this.socket = socket;
	this.listener = listener;
	this.activeBlocks = [];
	this.explosions = [];
	socket.on(def.game, this.setGame.bind(this));
	socket.on(def.newPlayer, this.addPlayer.bind(this));
	socket.on(def.update, this.update.bind(this));
	socket.on(def.deconnection, this.deconnection.bind(this));
	socket.on(def.updatePlayer, this.updatePlayer.bind(this));
	socket.on(def.updateBlock, this.updateBlock.bind(this));
}

Client.prototype.setGame = function(game) {
	this.game = game;
	document.getElementById("score").innerHTML = game.bestScore;
  if(waiting) {
    waiting = false;
    this.listener.onReady();
  }
};

Client.prototype.updatePlayer = function(entry) {
	this.game.players[entry.id][entry.field] = entry.value;
};

Client.prototype.updateBlock = function(entry) {
	this.game.map[entry.x][entry.y].life = entry.value;
};

Client.prototype.deconnection = function(id) {
	var p = this.game.players[id];
	if(p && this.game.map[p.x][p.y] === id) {
		this.game.map[p.x][p.y] = false;
	}
	delete this.game.players[id];
};
	
Client.prototype.addPlayer = function(player) {
	this.game.players[player.id] = player;
	this.game.map[player.x][player.y] = player.id;
};
	
Client.prototype.move = function(pos, x, y, update, oldX, oldY) {
	var ox = pos.x | oldX;
	var oy = pos.y | oldY;
	if(x != ox || y != oy) {
		this.game.map[x][y] = this.game.map[ox][oy];
		this.game.map[ox][oy] = false;
		if(update) {
			pos.x = x;
			pos.y = y;
		}
		return true;
	}
	return false;
};
	
Client.prototype.moveDir = function(player) {
	var x = player.x;
	var y = player.y;
	switch(player.wish) {
		case def.UP: return this.move(player, x, y - 1, true);
		case def.DOWN: return this.move(player, x, y + 1, true);
		case def.LEFT: return this.move(player, x - 1, y, true);
		case def.RIGHT: return this.move(player, x + 1, y, true);
		default: return false;
	}
};

Client.prototype.moveAll = function() {
	for(var id in this.game.players) {
		this.moveDir(this.game.players[id]);
	}
};

Client.prototype.getPos = function(x, y, dir) {
	var pos = {x: x, y: y};
	switch(dir) {
		case def.UP:
			pos.y--;
			break;
		case def.DOWN:
			pos.y++;
			break;
		case def.LEFT:
			pos.x--;
			break;
		case def.RIGHT:
			pos.x++;
			break;
	}
	return pos;
};

Client.prototype.inMap = function(x, y) {
	return x >= 0 && y >= 0 && x < this.game.map.length && y < this.game.map[x].length;
};

Client.prototype.isBlock = function(x, y) {
	var e = client.game.map[x][y];
	return e && (e.life || e.life == 0) && !e.x;
};

Client.prototype.isPlayer = function(x, y) {
	return client.game.map[x][y] && client.game.players[client.game.map[x][y]];
};

Client.prototype.moveShot = function(shot) {
  if(this.inMap(shot.x, shot.y) && (this.isPlayer(shot.x, shot.y) || this.isBlock(shot.x, shot.y))) {
    return true;
  }
	var pos = this.getPos(shot.x, shot.y, shot.w);
	shot.x = pos.x;
	shot.y = pos.y;
	return !this.inMap(shot.x, shot.y) || this.isPlayer(shot.x, shot.y) || this.isBlock(shot.x, shot.y);
};
	
Client.prototype.update = function(data) {
	try {
		this.explosions = [];
		for(var is in this.game.shots) {
			for(var i=0 ; i < def.shotSpeed ; i++) {
				if(this.moveShot(this.game.shots[is])) {
					delete this.game.shots[is];
					break;
				}
			}
		}
		for(var ixf in data.f) {
			var f = data.f[ixf];
			switch(f.w) {
				case def.UP:
					f.y = this.game.map[0].length;
					break;
				case def.DOWN:
					f.y = -1;
					break;
				case def.LEFT:
					f.x = this.game.map.length;
					break;
				case def.RIGHT:
					f.x = -1;
					break;
			}
			this.game.shots.push(f);
			sounds.laser.play();
		}
		this.aliens = data.a;
		while(this.activeBlocks.length > 0) {
			this.activeBlocks.pop().w = def.NONE;
		}
		for(var idmv in data.mv) {
			var changem = data.mv[idmv];
			var player = this.game.players[changem.id];
			this.move(player, changem.x, changem.y, true);
			player.wish = changem.w;
		}
		for(var idb in data.b) {
			var changeb = data.b[idb];
			var block = this.game.map[changeb.ox][changeb.oy];
			block.w = changeb.w;
			if(changeb.w !== def.NONE) {
				this.move(block, changeb.x, changeb.y, false, changeb.ox, changeb.oy);
				this.activeBlocks.push(block);
        sounds.bump.play();
			}
		}
		this.moveAll();
		for(var ib in data.d.b) {
			var b = data.d.b[ib];
			this.game.map[b.x][b.y].life--;
			if(this.game.map[b.x][b.y].life <= 0) {
				this.game.map[b.x][b.y] = false;
				this.explosions.push({x: b.x, y: b.y, big: true});
				sounds.explode.play();
			} else {
				this.explosions.push({x: b.x, y: b.y});
				sounds.pop.play();
			}
		}
		for(var ip in data.d.p) {
			var p = this.game.players[data.d.p[ip]];
			p.life--;
			if(p.life <= 0) {
				this.game.map[p.x][p.y] = false;
				delete this.game.players[p.id];
				this.explosions.push({x: p.x, y: p.y, big: true});
				sounds.explode.play();
			} else {
				this.explosions.push({x: p.x, y: p.y});
				sounds.pop.play();
			}
		}
		if(data.t) {
			document.getElementById("time").innerHTML = data.t;
		}
	} catch(e) {
    if(def.debug) {
      throw e;
    }
  }
  this.listener.update();
};
	

function Drawer(canvas) {
	this.canvas = canvas;
	this.g = canvas.getContext("2d");
  this.g.font="20px Arial";
	this.frame = 0;
	this.max_frame = 2;
	this.unit = {
		dx: PADDING_H,
		dy: PADDING_V
	};
	this.loadImages();
}

Drawer.prototype.onReady = function() {
  this.unit.w = (this.canvas.width - this.unit.dx * 2)/client.game.map.length;
  this.unit.h = (this.canvas.height - this.unit.dy * 2)/client.game.map[0].length;
  this.unit.dh = this.unit.h/3;
  var e = document.getElementById("load");
  FX.fadeOut(e, {duration: 333, complete: function() {
    e.remove();
  }});
	this.drawMap();
};

Drawer.prototype.drawAlien = function(alien) {
	var x = alien.x * this.unit.w + this.unit.dx;
	var y = alien.y * this.unit.h - this.unit.dh + this.unit.dy;
	switch(alien.w) {
	case def.UP:
		y -= this.unit.h * this.prct;
		break;
	case def.DOWN:
		y += this.unit.h * this.prct;
		break;
	case def.RIGHT:
		x += this.unit.w * this.prct;
		break;
	case def.LEFT:
		x -= this.unit.w * this.prct;
		break;
	}
	y -= this.prct < .5 ? this.unit.dh * this.prct : this.unit.dh - this.unit.dh * this.prct;
	this.g.drawImage(this.prct < .5 ? this.alien1 : this.alien2, x - this.unit.w * .15, y, this.unit.w * 1.3, this.unit.h + this.unit.dh);
};


Drawer.prototype.drawPlayer = function(player) {
	var isMe = false;
  for(iid in ids) {
    if(player.id == ids[iid]) {
      isMe = true;
      break;
    }
  }
	var x = player.x * this.unit.w + this.unit.dx;
	var y = player.y * this.unit.h - this.unit.dh + this.unit.dy;
	switch(player.wish) {
	case def.UP:
		y -= this.unit.h * this.prct - this.unit.h;
		break;
	case def.DOWN:
		y += this.unit.h * this.prct - this.unit.h;
		break;
	case def.RIGHT:
		x += this.unit.w * this.prct - this.unit.w;
		break;
	case def.LEFT:
		x -= this.unit.w * this.prct - this.unit.w;
		break;
	}
	this.g.fillStyle = SHADOW;
	this.ellipse(x, y + this.unit.h, this.unit.w, this.unit.h/2);
	y -= this.prct > .5 ? this.unit.dh * this.prct : this.unit.dh - this.unit.dh * this.prct;
	var img = isMe ? this.me : this.bad;
	this.g.drawImage(img[Math.max(0, img.length - player.life)], x, y, this.unit.w, this.unit.h + this.unit.dh);
	this.g.fillStyle = isMe ? "rgb(0,255,50)" : "rgb(225,20,50)";
	var ny = y - 5;
	if(isMe) {
		this.g.beginPath();
		this.g.moveTo(x + this.unit.w/2, ny + 3);
		this.g.lineTo(x + this.unit.w/2 - 5, ny - 5);
		this.g.lineTo(x + this.unit.w/2 + 5, ny - 5);
		this.g.fill();
		ny -= 8;
	}
  var w = Math.min(this.unit.w * 2, this.g.measureText(player.name).width);
	this.g.fillText(player.name, x + (this.unit.w - w)/2, ny, w);
};

Drawer.prototype.drawBlock = function(x, y) {
	var px = x * this.unit.w + this.unit.dx;
	var py = y * this.unit.h + this.unit.dy;
	var w = client.game.map[x][y].w;
	if(w) {
		switch(w) {
		case def.UP:
			py -= this.unit.h * this.prct - this.unit.h;
			break;
		case def.DOWN:
			py += this.unit.h * this.prct - this.unit.h;
			break;
		case def.RIGHT:
			px += this.unit.w * this.prct - this.unit.w;
			break;
		case def.LEFT:
			px -= this.unit.w * this.prct - this.unit.w;
			break;
		}
	}
	this.drawBlockShadow(x, y, px, py);
	this.g.drawImage(this.block[Math.max(0, this.block.length - client.game.map[x][y].life)], px, py - this.unit.dh, this.unit.w, this.unit.h + this.unit.dh);
};

Drawer.prototype.drawShot = function(shot) {
	var x = shot.x * this.unit.w + this.unit.dx;
	var y = shot.y * this.unit.h + this.unit.dy;
	var w;
	var h;
	switch(shot.w) {
	case def.UP:
		y -= this.unit.h * this.prct * def.shotSpeed;
		w = this.unit.w/SHOT_DSIZE * (1 - Math.random()/SHOT_TREMOR);
		h = this.unit.h * (1 - Math.random()/SHOT_TREMOR);
		x+= (this.unit.w - w)/2; 
		break;
	case def.DOWN:
		w = this.unit.w/SHOT_DSIZE * (1 - Math.random()/SHOT_TREMOR);
		h = this.unit.h * (1 - Math.random()/SHOT_TREMOR);
		y += this.unit.h * this.prct * def.shotSpeed + this.unit.h - h;
		x+= (this.unit.w - w)/2; 
		break;
	case def.RIGHT:
		w = this.unit.w * (1 - Math.random()/SHOT_TREMOR);
		h = this.unit.h/SHOT_DSIZE * (1 - Math.random()/SHOT_TREMOR);
		x += this.unit.w * this.prct* def.shotSpeed + this.unit.w - w;
		break;
	case def.LEFT:
		x -= this.unit.w * this.prct * def.shotSpeed;
		w = this.unit.w * (1 - Math.random()/SHOT_TREMOR);
		h = this.unit.h/SHOT_DSIZE * (1 - Math.random()/SHOT_TREMOR);
		break;
	}
	this.g.fillStyle = SHADOW;
	this.ellipse(x, y + this.unit.dh, w, h);
	this.g.fillStyle = "rgb(255,255," + Math.round(Math.random() * 255) + ")";
	this.ellipse(x, y, w, h);
};

Drawer.prototype.ellipse = function(x, y, w, h){
    this.g.save();
    this.g.beginPath();
    this.g.translate(x, y);
    this.g.scale(w/2, h/2);
    this.g.arc(1, 1, 1, 0, 2 * Math.PI, false);
    this.g.restore();
    this.g.fill();
};

Drawer.prototype.drawCell = function(x, y) {
	if(client.game.map[x][y]) {
		if(client.isPlayer(x, y)) {
			this.drawPlayer(client.game.players[client.game.map[x][y]]);
		} else {
      this.drawBlock(x, y);
    }
	}
};

Drawer.prototype.drawExplosion = function(e) {
	var x = e.x * this.unit.w + this.unit.dx;
	var y = e.y * this.unit.h + this.unit.dy;
	if(e.big) {
		if(!e.i) {
			e.i = 0;
		}
		this.g.drawImage(this.explode[e.i], x - this.unit.w/2, y - this.unit.h, this.unit.w * 2, this.unit.h * 2);
		e.i++;
		return e.i >= EXPLODE;
	} else {
		var w = this.prct * this.unit.w * (1 - Math.random()/2);
		var h = this.prct * this.unit.h * (1 - Math.random()/2);
		this.g.fillStyle = "rgb(255," + (155 + Math.round(Math.random() * 100)) + "," + Math.round(Math.random() * 255) + ")";
		this.ellipse(x + (this.unit.w - w)/2, y + (this.unit.h - h)/2 - this.unit.dh, w, h);
	}
};

Drawer.prototype.drawBlockShadow = function(x, y, px, py) {
	this.g.fillStyle = SHADOW;
	this.g.beginPath();
	this.g.moveTo(px + this.unit.w, py + this.unit.dh/5);
	this.g.lineTo(px + this.unit.w * 1.5, py + this.unit.dh + this.unit.dh/5);
	this.g.lineTo(px + this.unit.w * 1.5, py + this.unit.h + this.unit.dh);
	this.g.lineTo(px + this.unit.w/2, py + this.unit.h + this.unit.dh);
	this.g.lineTo(px, py + this.unit.h);
	this.g.fill();
};

Drawer.prototype.drawMap = function() {
  try {
    this.frame++;
    this.prct = Math.min(1, this.frame/this.max_frame);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for(var i in client.aliens) {
      this.drawAlien(client.aliens[i]);
    }
    for(var y = 0 ; y < client.game.map[0].length ; y++) {
      for(var x = 0 ; x < client.game.map.length ; x++) {
        this.drawCell(x, y);
      }
    }
    for(var ii in client.game.shots) {
      var s = client.game.shots[ii];
      if(s) {
        this.drawShot(s);
      } else {
        delete client.game.shots[ii];
      }
    }
    for(var ic in client.explosions) {
      if(this.drawExplosion(client.explosions[ic])) {
        delete client.explosions[ic];
      }
    }
  } catch(e) {
    if(def.debug) {
      throw e;
    }
  }
  window.requestAnimFrame(this.drawMap.bind(this));
};

Drawer.prototype.loadImages = function() {
	this.alien1 = new Image();
	this.alien2 = new Image();
	this.explode = [];
	this.block = [];
	this.bad = [];
	this.me = [];
	for(var m=0 ; m < 4 ; m++) {
		var i1 = new Image();
		var i2 = new Image();
		var i3 = new Image();
		i1.src = "bad" + m;
		i2.src = "me" + m;
		i3.src = "block" + m;
		this.bad.push(i1);
		this.me.push(i2);
		this.block.push(i3);
	}
	for(var i=0 ; i<EXPLODE ; i++) {
		var img = new Image();
		img.src = "e" + i;
		this.explode.push(img);
	}
	this.alien1.src = "alien1";
	this.alien2.src = "alien2";
};

Drawer.prototype.update = function() {
	if(this.frame > 1) {
		this.max_frame = this.frame;
	}
	this.frame = 0;
};

window.requestAnimFrame = (function() {
    return window.requestAnimationFrame       || // La forme standardisée
           window.webkitRequestAnimationFrame || // Pour Chrome et Safari
           window.mozRequestAnimationFrame    || // Pour Firefox
           window.oRequestAnimationFrame      || // Pour Opera
           window.msRequestAnimationFrame     || // Pour Internet Explorer
           function(callback){                   // Pour les élèves du dernier rang
               window.setTimeout(callback, 1000/60);
    };
})();

function newMessage(message) {
  var msg = document.getElementById("messages");
  msg.innerHTML = "<div><span>" + unescape(message.author) + "</span>" + unescape(message.message) + "</div>" + msg.innerHTML;
}

function init(socket) {
	socket.on(def.message, newMessage);
}

function Sound(loop) {
  this.loop = loop;
}

Sound.prototype.init = function(buffer) {
  this.buffer = buffer;
}

Sound.prototype.play = function() {
  if(this.buffer) {
    var s = context.createBufferSource();
    if(this.loop) {
      s.loop = true;
    }
    s.buffer = this.buffer;
    s.connect(context.destination);
    s.start(0);
  }
}

//Forward-declare AudioContext for Safari and older Google Chrome.
window.AudioContext = window.AudioContext || window.webkitAudioContext;

function AudioSampleLoader() {
  "use strict";
  this.loaded = 0;
}

AudioSampleLoader.prototype.send = function () {
  "use strict";
  var console = window.console,
    i;
  if (!this.hasOwnProperty('ctx')) {
    this.ctx = new window.AudioContext();
  } else if (!(this.ctx instanceof window.AudioContext)) {
    console.error('AudioSampleLoader: ctx not an instance of AudioContext');
    return;
  } 
  if (!this.hasOwnProperty('onload')) {
    console.error('AudioSampleLoader: Callback onload does not exist');
    return;
  } else if (typeof this.onload !== 'function') {
    console.error('AudioSampleLoader: Callback onload not a function');
    return;
  }
  if (!this.hasOwnProperty('onerror') || typeof this.onerror !== 'function') {
    this.onerror = function () {};
  }  
  if (Array.isArray(this.src)) {
    for (i = 0; i < this.src.length; i += 1) {
      if (typeof this.src[i] !== 'string') {
        console.error('AudioSampleLoader: src[' + i + '] is not a string');
        this.onerror();
        return;
      }
    }
    this.response = new Array(this.src.length);
    for (i = 0; i < this.src.length; i += 1) {
      this.loadOneOfBuffers(this.src[i], i);
    }
  } else if (typeof this.src === 'string') {
    this.loadOneBuffer(this.src);
  } else {
    console.error('AudioSampleLoader: src not string or list of strings');
    this.onerror();
    return;
  }
};

AudioSampleLoader.prototype.loadOneBuffer = function (url) {
  "use strict";
  var console = window.console,
    loader = this,
    XHR = new XMLHttpRequest();
  XHR.open('GET', url, true);
  XHR.responseType = 'arraybuffer';
  
  XHR.onload = function () {
    loader.ctx.decodeAudioData(
      XHR.response,
      function (buffer) {
        loader.response = buffer;
        loader.onload();
      },
      function () {
        console.error('AudioSampleLoader: ctx.decodeAudioData() called onerror');
        loader.onerror();
      }
    );
  };
  
  XHR.onerror = function () {
    console.error('AudioSampleLoader: XMLHttpRequest called onerror');
    loader.onerror();
  };
  XHR.send();
};

AudioSampleLoader.prototype.loadOneOfBuffers = function (url, index) {
  "use strict";
  var console = window.console,
    loader = this,
    XHR = new XMLHttpRequest();
  XHR.open('GET', url, true);
  XHR.responseType = 'arraybuffer';
  
  XHR.onload = function () {
    loader.ctx.decodeAudioData(
      XHR.response,
      function (buffer) {
        loader.response[index] = buffer;
        loader.loaded += 1;
        if (loader.loaded === loader.src.length) {
          loader.loaded = 0;
          loader.onload();
        }
      },
      function () {
        console.error('AudioSampleLoader: ctx.decodeAudioData() called onerror');
        loader.onerror();
      }
    );
  };
  
  XHR.onerror = function () {
    console.error('AudioSampleLoader: XMLHttpRequest called onerror');
    loader.onerror();
  };
  XHR.send();
};

window.onload = function() {
	var canvas = document.getElementById("game");
	var h = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
	canvas.width = Math.round(1.34 * h);
	canvas.height = h;
  PADDING_V = canvas.height/10;
  PADDING_H = canvas.width/10;
	sounds = {
		explode: new Sound(false),
		laser: new Sound(false),
		pop: new Sound(false),
		bump: new Sound(false),
		song: new Sound(true)
	};
  var loader = new AudioSampleLoader();
  loader.ctx = context;
  loader.src = ["explode", "laser", "pop", "bump", "song"];
  loader.onload = function () {
    var buffers = loader.response;
    sounds.explode.init(buffers[0]);
    sounds.laser.init(buffers[1]);
    sounds.pop.init(buffers[2]);
    sounds.bump.init(buffers[3]);
    sounds.song.init(buffers[4]);
    sounds.loop = true;
    var request = new XMLHttpRequest();
    request.onload = function() {
      def = JSON.parse(request.response);
      var port = 8000;
      if(location.protocol === "https:") {
        port = 8443;
      }
      var drawer = new Drawer(canvas);
      var socket = io.connect(location.protocol + "//" + location.hostname + ":" + port);
      client = new Client(socket, drawer);
      init(socket);
      sounds.song.play();
    };
    request.open("get", "const", true);
    request.send();
  };
  loader.send();
};