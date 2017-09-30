//Facteur de tremblement des tirs aliens
const SHOT_TREMOR = 1.3;

//Largeur des tirs aliens 
const SHOT_DSIZE = 6;

//Nombre d'images du sprite d'explosion
const EXPLODE = 16;

//Couleur des ombres
const SHADOW = "rgb(15,15,15)";

//Padding vertical par défaut
var PADDING_V = 80;

//Padding horizontal par défaut
var PADDING_H = 80;

var def;
var sounds;
var keys = [];
var client;


//Classe englobant les fonctions client du jeu
function Client(socket, listener) {
	this.socket = socket;
	this.listener = listener;
	this.activeBlocks = [];
	this.explosions = [];
  
  //Enregistrement des fonctions en réponse aux messages serveur
	socket.on(def.game, this.setGame.bind(this));
	socket.on(def.mainPlayer, this.mainPlayer.bind(this));
	socket.on(def.newPlayer, this.addPlayer.bind(this));
	socket.on(def.update, this.update.bind(this));
	socket.on(def.deconnection, this.deconnection.bind(this));
	socket.on(def.updatePlayer, this.updatePlayer.bind(this));
	socket.on(def.updateBlock, this.updateBlock.bind(this));
}

//Initialisation du jeu
Client.prototype.setGame = function(game) {
	this.game = game;
	$("#score").html(game.bestScore);
	this.listener.onReady();
  this.socket.emit(def.join);
};

//Mise à jour d'un champ du joueur
Client.prototype.updatePlayer = function(entry) {
	this.game.players[entry.id][entry.field] = entry.value;
};

//Mise à jour de la résistance d'un bloc
Client.prototype.updateBlock = function(entry) {
	this.game.map[entry.x][entry.y].life = entry.value;
};

//Déconnexion d'un joueur
Client.prototype.deconnection = function(id) {
  if(this.game) {
    var p = this.game.players[id];
    if(p && this.game.map[p.x][p.y] === id) {
      this.game.map[p.x][p.y] = false;
    }
    delete this.game.players[id];
  }
};

//Assignation du joueur principal
Client.prototype.mainPlayer = function(p) {
	this.player = p;
  this.addPlayer(this.player);
	setName();
};
	
//Ajout d'un joueur
Client.prototype.addPlayer = function(player) {
	this.game.players[player.id] = player;
	this.game.map[player.x][player.y] = player.id;
};
	
//Déplacement d'un élément pos en coordonnées x,y depuis ses anciennes coordonnées
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
	
//Déplacement d'un joueur dans une direction selon son souhait
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

//Déplace tous les joueurs
Client.prototype.moveAll = function() {
	for(var id in this.game.players) {
		this.moveDir(this.game.players[id]);
	}
};

//Retourne la position x,y dans la direction des coordonnées spécifiées
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

//Retourne vrai si les coordonnées sont contenues dans la map (entre 0 et la taille)
Client.prototype.inMap = function(x, y) {
	return x >= 0 && y >= 0 && x < this.game.map.length && y < this.game.map[x].length;
};

//Retourne vrai si l'emplacement en position x,y est un bloc
Client.prototype.isBlock = function(x, y) {
	var e = client.game.map[x][y];
	return e && (e.life || e.life == 0) && !e.x;
};

//Retourne vrai si l'emplacement en position x,y est un joueur
Client.prototype.isPlayer = function(x, y) {
	return client.game.map[x][y] && client.game.players[client.game.map[x][y]];
};

//Déplace un missile, et retourne vrai si le missile peut être supprimé
Client.prototype.moveShot = function(shot) {
  if(this.inMap(shot.x, shot.y) && (this.isPlayer(shot.x, shot.y) || this.isBlock(shot.x, shot.y))) {
    return true;
  }
	var pos = this.getPos(shot.x, shot.y, shot.w);
	shot.x = pos.x;
	shot.y = pos.y;
	return !this.inMap(shot.x, shot.y) || this.isPlayer(shot.x, shot.y) || this.isBlock(shot.x, shot.y);
};

//Met à jour le jeu à partir des informations reçues du serveur
Client.prototype.update = function(data) {
	try {
		this.explosions = [];
    
    //Déplacement des missiles
		for(var is in this.game.shots) {
			for(var i=0 ; i < def.shotSpeed ; i++) {
				if(this.moveShot(this.game.shots[is])) {
					delete this.game.shots[is];
					break;
				}
			}
		}
    
    //Ajout des nouveaux tirs aliens
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
    
    //Mise à jour de la liste des aliens
		this.aliens = data.a;
    
    //Arrêt des blocs précédement en mouvement
		while(this.activeBlocks.length > 0) {
			this.activeBlocks.pop().w = def.NONE;
		}
    
    //Enregistrement du souhait de déplacement des joueurs et mise à jour de la position
		for(var idmv in data.mv) {
			var changem = data.mv[idmv];
			var player = this.game.players[changem.id];
			this.move(player, changem.x, changem.y, true);
			player.wish = changem.w;
		}
    
    //Déplacement des blocs
		for(var idb in data.b) {
			var changeb = data.b[idb];
			var block = this.game.map[changeb.ox][changeb.oy];
			block.w = changeb.w;
      
			if(changeb.w !== def.NONE) {
        //Si le bloc entre en mouvement
				this.move(block, changeb.x, changeb.y, false, changeb.ox, changeb.oy);
				this.activeBlocks.push(block);
        sounds.bump.play();
			}
		}
    
    //Déplacement des joueurs
		this.moveAll();
    
    //Mise à jour de la résistance des blocs
		for(var ib in data.d.b) {
			var b = data.d.b[ib];
			this.game.map[b.x][b.y].life--;
			if(this.game.map[b.x][b.y].life <= 0) {
        //Si le bloc est détruit
				this.game.map[b.x][b.y] = false;
				this.explosions.push({x: b.x, y: b.y, big: true});
				sounds.explode.play();
			} else {
				this.explosions.push({x: b.x, y: b.y});
				sounds.pop.play();
			}
		}
    
    //Mise à jour de la vie des joueurs
		for(var ip in data.d.p) {
			var p = this.game.players[data.d.p[ip]];
			p.life--;
			if(p.life <= 0) {
        //Si le joueur est mort
				this.game.map[p.x][p.y] = false;
				delete this.game.players[p.id];
				this.explosions.push({x: p.x, y: p.y, big: true});
				sounds.explode.play();
			} else {
				this.explosions.push({x: p.x, y: p.y});
				sounds.pop.play();
			}
		}
    
    //Si le joueur stoppe son déplacement
		if(this.player && this.player.wish === def.NONE) {
			sendMove();
		}
    
		if(data.t) {
      //Mise à jour du compteur de temps
			$("#time").html(data.t);
		}
    
    //Notifie l'écouteur de mise à jour
		this.listener.update();
    
	} catch(e) {
		if(def.debug) {
			throw e;
		}
	}
};
	

//Classe pour le dessin du jeu client
function Drawer(canvas) {
	this.canvas = canvas;
	this.g = canvas.getContext("2d");
	this.frame = 0;
	this.max_frame = 19;
	this.unit = {
		dx: PADDING_H,
		dy: PADDING_V
	};
	this.loadImages();
}

//Ecouteur déclanché lorsque le jeu est prêt à être dessiné
Drawer.prototype.onReady = function() {
  
  //Calcul des proportions pour les objets
	this.unit.w = (this.canvas.width - this.unit.dx * 2)/client.game.map.length;
	this.unit.h = (this.canvas.height - this.unit.dy * 2)/client.game.map[0].length;
	this.unit.dh = this.unit.h/3;
  
	this.drawMap();
	sounds.song.loop = true;
	sounds.song.play();
};

//Dessine un alien
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
  
  //Oscillation de la coordonnée y en fonction du temps pour simuler un flottement
	y -= this.prct < .5 ? this.unit.dh * this.prct : this.unit.dh - this.unit.dh * this.prct;
  
	this.g.drawImage(this.prct < .5 ? this.alien1 : this.alien2, x - this.unit.w * .15, y, this.unit.w * 1.3, this.unit.h + this.unit.dh);
};

//Dessine un joueur
Drawer.prototype.drawPlayer = function(player) {
	var isMe = client.player && client.player.id === player.id;
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
  
  //Dessin de l'ombre
	this.g.fillStyle = SHADOW;
	this.ellipse(x, y + this.unit.h, this.unit.w, this.unit.h/2);
  
  //Oscillation de la coordonnée y en fonction du temps pour simuler un flottement
	y -= this.prct > .5 ? this.unit.dh * this.prct : this.unit.dh - this.unit.dh * this.prct;
  
	var img = isMe ? this.me : this.bad;
	this.g.drawImage(img[Math.max(0, img.length - player.life)], x, y, this.unit.w, this.unit.h + this.unit.dh); 
  
	this.g.fillStyle = isMe ? "rgb(0,255,50)" : "rgb(255,0,50)";
	var ny = y - 5;
  
  //Dessin du triangle indiquant le joueur principal
	if(isMe) {
		this.g.beginPath();
		this.g.moveTo(x + this.unit.w/2, ny + 3);
		this.g.lineTo(x + this.unit.w/2 - 5, ny - 5);
		this.g.lineTo(x + this.unit.w/2 + 5, ny - 5);
		this.g.fill();
		ny -= 8;
	}
  
  //Dessin du pseudo
  var w = Math.min(this.unit.w * 2, this.g.measureText(player.name).width);
	this.g.fillText(player.name, x + (this.unit.w - w)/2, ny, w);
};

//Dessine un bloc
Drawer.prototype.drawBlock = function(x, y) {
	var px = x * this.unit.w + this.unit.dx;
	var py = y * this.unit.h + this.unit.dy;
	var w = client.game.map[x][y].w;
  
	if(w) {
    //Si le bloc est en mouvement
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

//Dessine un missile
Drawer.prototype.drawShot = function(shot) {
	var x = shot.x * this.unit.w + this.unit.dx;
	var y = shot.y * this.unit.h + this.unit.dy;
	var w;
	var h;
  
  //Calcul la disposition en fonction de l'orientation, et génération de tremblements
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
  
  //Dessine l'ombre
	this.g.fillStyle = SHADOW;
	this.ellipse(x, y + this.unit.dh, w, h);
  
  //Dessine le missile avec une composante de couleur bleue aléatoire (0-255)
	this.g.fillStyle = "rgb(255,255," + Math.round(Math.random() * 255) + ")";
	this.ellipse(x, y, w, h);
};

//Dessine une ellipse
Drawer.prototype.ellipse = function(x, y, w, h){
    this.g.save();
    this.g.beginPath();
    this.g.translate(x, y);
    this.g.scale(w/2, h/2);
    this.g.arc(1, 1, 1, 0, 2 * Math.PI, false);
    this.g.restore();
    this.g.fill();
};

//Dessine une cellule selon son contenu
Drawer.prototype.drawCell = function(x, y) {
	if(client.game.map[x][y]) {
		if(client.isBlock(x, y)) {
			this.drawBlock(x, y);
		} else if(client.isPlayer(x, y)) {
			this.drawPlayer(client.game.players[client.game.map[x][y]]);
		} else if(def.debug) {
			console.error(client.game.map[x][y]);
		}
	}
};

//Dessine une explosion, et retourne vrai si elle est terminée
Drawer.prototype.drawExplosion = function(e) {
	var x = e.x * this.unit.w + this.unit.dx;
	var y = e.y * this.unit.h + this.unit.dy;
  
	if(e.big) {
    //S'il s'agit d'une explosion large
		if(!e.i) {
			e.i = 0;
		}
		this.g.drawImage(this.explode[e.i], x - this.unit.w/2, y - this.unit.h, this.unit.w * 2, this.unit.h * 2);
		e.i++;
		return e.i >= EXPLODE;
    
	} else {
    //S'il s'agit d'une explosion moyenne et fluctuante
		var w = this.prct * this.unit.w * (1 - Math.random()/2);
		var h = this.prct * this.unit.h * (1 - Math.random()/2);
    
    //Dessine l'explosion avec des composantes de couleur vertes et bleues aléatoires (respectivement 155-255 et 0-255)
		this.g.fillStyle = "rgb(255," + (155 + Math.round(Math.random() * 100)) + "," + Math.round(Math.random() * 255) + ")";
		this.ellipse(x + (this.unit.w - w)/2, y + (this.unit.h - h)/2 - this.unit.dh, w, h);
	}
};

//Dessine l'ombre d'un bloc
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

//Dessine la map et ses contenus
Drawer.prototype.drawMap = function() {
	this.frame++;
	this.prct = Math.min(1, this.frame/this.max_frame);
  
  //Efface la frame précédente
	this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  
  try {
    //Dessine les aliens
    for(var i in client.aliens) {
      this.drawAlien(client.aliens[i]);
    }
    
    //Dessine les cellules
    for(var y = 0 ; y < client.game.map[0].length ; y++) {
      for(var x = 0 ; x < client.game.map.length ; x++) {
        this.drawCell(x, y);
      }
    }
    
    //Dessine les missiles
    for(var ii in client.game.shots) {
      var s = client.game.shots[ii];
      if(s) {
        this.drawShot(s);
      } else {
        delete client.game.shots[ii];
      }
    }
    
    //Dessine les explosions
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
  
  //Demande un redessinement dès que possible
	window.requestAnimFrame(this.drawMap.bind(this));
};

//Charge les images utilisées dans le jeu
Drawer.prototype.loadImages = function() {

	this.alien1 = new Image();
	this.alien2 = new Image();
  
	this.explode = [];
	this.block = [];
	this.bad = [];
	this.me = [];
  
  //Chargement des vaisseaux et blocs selon leurs états
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
  
  //Chargement du sprite d'explosion
	for(var i=0 ; i<EXPLODE ; i++) {
		var img = new Image();
		img.src = "e" + i;
		this.explode.push(img);
	}
  
	this.alien1.src = "alien1";
	this.alien2.src = "alien2";
};

//Ecouteur lorsque le client reçoit une mise à jour du jeu
Drawer.prototype.update = function() {
	if(this.frame > 5) {
		this.max_frame = this.frame;
	}
	this.frame = 0;
};

//Retourne l'action correspondant à un évènement clavier
function getDir(e) {
	switch(e.keyCode ? e.keyCode : e.which) {
	case 38:
	case 90:
		return def.UP;
	case 40:
	case 83:
		return def.DOWN;
	case 37:
	case 81:
		return def.LEFT;
	case 39:
	case 68:
		return def.RIGHT;
	default:
		return false;
	}
}

//Fonction d'écoute des évènements de relâche clavier
function keyup(e) {
	var dir = getDir(e);
	if(dir) {
		keys.splice(keys.indexOf(dir), 1);
		sendMove();
	}
}

//Fonction d'écoute des évènements d'appui clavier
function keydown(e) {
	var dir = getDir(e);
	if(dir && keys.indexOf(dir) === -1) {
		keys.push(dir);
		sendMove();
	}
}

//Envoie un paquet informant du choix de mouvement du client
function sendMove() {
	client.socket.emit(def.movement, keys.length > 0 ? keys[keys.length - 1] : def.NONE);
}

//Fonction de redessinement, avec compatibilités
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

//Envoie un message, si "Enter" est appuyé
function sendMessage(e) {
	if(e.keyCode == 13) {
		var msg = $("#message");
		var text = msg.val();
		if(text.length > 0) {
			client.socket.emit(def.message, text);
			msg.val("");
		}
	}
}

//Envoie le nom du joueur
function setName() {
	var text = $("#name").val();
	if(text.length > 0) {
		client.socket.emit(def.updatePlayer, text);
	}
}

//Ajoute un message à l'interface graphique
function newMessage(message) {
	$("#messages").prepend("<div><span>" + unescape(message.author) + "</span>" + unescape(message.message) + "</div>");
}

//Initialise l'interface graphique d'après un socket
function init(socket) {
	$("#name").on("keyup", setName);
	$("#message").on("keyup", sendMessage);
	
	socket.on(def.message, newMessage);
}

//Lorsque l'application est prête
window.onload = function() {
	var canvas = document.getElementById("game");
  
  //Définition de la taille du canvas de jeu
	var h = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
	canvas.width = Math.round(1.34 * h);
	canvas.height = h;
  
  //Changement du padding
  PADDING_V = canvas.height/10;
  PADDING_H = canvas.width/10;
  
  //Préparation des sons
	sounds = {
		explode: new Audio('explode'),
		laser: new Audio('laser'),
		song: new Audio('song'),
		bump: new Audio('bump'),
		pop: new Audio('pop')
	};
  
	//Chargement du fichier JSON de définitions
	jQuery.getJSON("const", {}, function(json) {
		def = json;
		
	  //Connexion au serveur distant
	  var socket = io.connect(location.protocol + "//" + location.hostname + ":" + (location.protocol === "https:" ? 8443 : 8000));
	    
    //Création d'un client pour le jeu
		client = new Client(socket, new Drawer(canvas));
		
    //Initialisation de l'interface graphique
		init(socket);
	    
    //Enregistrement des écouteurs clavier
		window.onkeydown = keydown;
		window.onkeyup = keyup;
	});
};