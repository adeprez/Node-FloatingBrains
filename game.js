var fs = require("fs");

//Lecture du fichier de constantes
var def = JSON.parse(fs.readFileSync("client/const.json"));

var DENSITY = .1;
var ALIEN_CHANCE = .025;
var ACTION_CHANCE = .5;
var MAX_ALIENS = 20;

/**
 * Classe pour la gestion du jeu.
 * Dans la carte :
 * - Un bloc est représenté par un objet {life: int}
 * - Un joueur est représenté par son identifiant
*/
var Game = function(map, bestScore) {

  //Pourcentage de densité de la carte en blocs
  DENSITY = map.density;
  
  //Pourcentage de chances de faire appaitre un alien à chaque mise à jour du jeu
  ALIEN_CHANCE = map.alienChance;
  
  //Pourcentage de chances d'effectuer une action pour un alien à chaque mise à jour du jeu
  ACTION_CHANCE = map.actionChance;
  
  //Nombre maximum d'aliens présents sur une carte
  MAX_ALIENS = map.maxAliens;
  
  //Intervale entre deux mises à jour du jeu
	this.interval = map.interval;
  this.bestScore = bestScore;
  
	this.map = [];
	this.players = {};
	this.aliens = [];
	this.fire = [];
	this.shots = [];
	this.blocks = [];
  
  //Création de la map
	for(var x = 0 ; x < map.width ; x++) {
		this.map[x] = [];
		for(var y = 0 ; y < map.height ; y++) {
			var isBlock = false;
      
      //Si la configuration de la map spécifie la position des blocs, on l'utilise
			if(map.blocks) {
				if(!isBlock) {
					for(var i = 0 ; i < map.blocks.length ; i++) {
						if(map.blocks[i] == (x + ";" + y)) {
							isBlock = true;
							break;
						}
					}
				}
			} else {
        //Sinon, génération aléatoire
				isBlock = Math.random() < DENSITY;
			}
      //Initialisation de l'emplacement avec faux (vide) ou la résistance du bloc
			this.map[x][y] = isBlock ? {life: def.blockLife} : false;
		}
	}
};

//Retourne vrai si les coordonnées sont contenues dans la map (entre 0 et la taille)
Game.prototype.inMap = function(x, y) {
	return x >= 0 && y >= 0 && x < this.map.length && y < this.map[x].length;
};

//Copie le joueur en position x,y. Retourne vrai si le déplacement est effectué, faux si l'emplacement est occupé. L'ancienne position n'est pas effacée
Game.prototype.setPos = function(player, x, y) {
	if(!this.inMap(x, y) || this.map[x][y]) {
		return false;
	}
	this.map[x][y] = player.id;
	player.x = x;
	player.y = y;
	return true;
};

//Retourne vrai si l'emplacement en position x,y est un bloc
Game.prototype.isBlock = function(x, y) {
	if(this.inMap(x, y)) {
		var e = this.map[x][y];
		return e && e.life && !e.x;
	}
	return false;
};

//Retourne vrai si l'emplacement en position x,y est un joueur
Game.prototype.isPlayer = function(x, y) {
	return this.inMap(x, y) && this.map[x][y] && this.players[this.map[x][y]];
};

//Déplace le joueur en position x,y. Retourne vrai si le déplacement est effectué, faux si l'emplacement est occupé, ou un bloc s'il est déplacé
Game.prototype.move = function(player, x, y) {
	var oldX = player.x;
	var oldY = player.y;
  
  //Si le déplacement fonctionne, on vide son ancienne position
	if(this.setPos(player, x, y)) {
		this.map[oldX][oldY] = false;
		return true;
    
	} else if(this.isBlock(x, y)) {
    //Si un bloc empêche le déplacement, on essaye de le pousser
		var w = player.wish;
		var x2 = w === def.LEFT ? x - 1 : (w === def.RIGHT ? x + 1 : x);
		var y2 = w === def.UP ? y - 1 : (w === def.DOWN ? y + 1 : y);
    
		if(this.inMap(x2, y2) && !this.map[x2][y2]) {
      //On ajoute le bloc déplacé à la liste de mise à jour pour les cliens
			this.map[x2][y2] = this.map[x][y];
			this.map[x][y] = false;
			var block = {x: x2, y: y2, ox: x, oy: y, w: w};
			this.blocks.push(block);
			return block;
		}
	}
	return false;
};

//Déplace le joueur selon son souhait de déplacement
Game.prototype.moveDir = function(player) {
	var x = player.x;
	var y = player.y;
	switch(player.wish) {
		case def.UP: return this.move(player, x, y - 1);
		case def.DOWN: return this.move(player, x, y + 1);
		case def.LEFT: return this.move(player, x - 1, y);
		case def.RIGHT: return this.move(player, x + 1, y);
		default: return false;
	}
};

//Fait apparaitre un nouvel alien à une position aléatoire sur les bords de la map
Game.prototype.spawnAlien = function() {

  //Choisit aléatoirement un bord de map sur lequel se placer
	var r = Math.random();
	var ax = -2;
	var ay = -2;
	if(r < .25) {
    //En haut
		ax = random(this.map.length - 1);
	} else if(r < .5) {
    //En bas
		ax = random(this.map.length - 1);
		ay = this.map[0].length + 1;
	} else if(r < .75) {
    //A gauche
		ay = random(this.map[0].length - 1);
	} else {
    //A droite
		ax = this.map.length + 1;
		ay = random(this.map[0].length - 1);
	}
  
  //Ajout à la liste des aliens
	this.aliens.push({x: ax, y: ay});
};

//Retourne la direction du plus proche joueur sur la ligne en fonction de la position sur le bord de map
Game.prototype.getCloserPlayerDirection = function(x, y) {

  //Recherche de joueur sur la verticale
	if(x === -2 || x === this.map.length + 1) {
		var dy = Number.MAX_VALUE;
		for(var ii in this.players) {
      //Pour chaque joueur, on regarde sa distance horizontale et on conserve la plus petite
			var py = this.players[ii].y - y;
			if(Math.abs(py) < Math.abs(dy)) {
				dy = py;
			}
		}
		return dy === 0 ? def.NONE : (dy < 0 ? def.UP : def.DOWN);
	}
  
  //Recherche de joueur sur l'horizontale
	var dx = Number.MAX_VALUE;
	for(var i in this.players) {
    //Pour chaque joueur, on regarde sa distance verticale et on conserve la plus petite
		var px = this.players[i].x - x;
		if(Math.abs(px) < Math.abs(dx)) {
			dx = px;
		}
	}
	return dx === 0 ? def.NONE : (dx < 0 ? def.LEFT : def.RIGHT);
};

//Retourne vrai s'il existe un alien en position x,y
Game.prototype.hasAlien = function(x, y) {
	for(var i in this.aliens) {
		var a = this.aliens[i];
		if(a.x === x && a.y === y) {
			return true;
		}
	}
	return false;
};

//Retourne une nouvelle position x,y dans la direction spécifiée par rapport aux coordonnées x,y spécifiées
Game.prototype.getPos = function(x, y, dir) {
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

//Effectue les actions pour chaque alien
Game.prototype.actionAliens = function() {
	for(var i in this.aliens) {
		var a = this.aliens[i];
		var pos = this.getPos(a.x, a.y, a.w);
		a.x = pos.x;
		a.y = pos.y;
    
		if(Math.random() < ACTION_CHANCE) {
      //Si l'alien réussi son test de chance, il effectue une action en recherchant le joueur le plus proche
			var w = this.getCloserPlayerDirection(a.x, a.y);
      
      //S'il est en face d'un joueur, il tire dans sa direction
			if(w === def.NONE) {
				a.w = def.NONE;
				var f = {};
				if(a.x === -2) {
					f.w = def.RIGHT;
					f.y = a.y;
				} else if(a.x === this.map.length + 1) {
					f.w = def.LEFT;
					f.y = a.y;
				} else if(a.y === -2) {
					f.w = def.DOWN;
					f.x = a.x;
				} else {
					f.w = def.UP;
					f.x = a.x;
				}
				this.fire.push(f);
			} else {
        //Sinon, il se déplace dans la direction du joueur le plus proche
				pos = this.getPos(a.x, a.y, w);
   
				if(this.hasAlien(pos.x, pos.y)) {
          //S'il y a déjà un alien à la nouvelle position, il annule son mouvement
					a.w = def.NONE;
				} else {
					a.w = w;
				}
			}
		} else {
			a.w = def.NONE;
		}
	}
};

//Effectue les actions pour tous les joueurs et retourne les changements de mouvement
Game.prototype.actionPlayers = function() {
	var mv = [];
	for(var id in this.players) {
		var player = this.players[id];
		var x = player.x;
		var y = player.y;
		var blockOrMove = this.moveDir(player, x, y);
		if(blockOrMove) {
			if(blockOrMove !== true) {
				player.wish = def.NONE;
			}
		} else {
			player.wish = def.NONE;
		}
		if(player.wish !== player.lastWish) {
      //Si l'action du joueur change, on l'ajoute à la liste des changements de mouvement
			player.lastWish = player.wish;
			mv.push({id:player.id, x: x, y: y, w: player.wish});
		}
	}
	return mv;
};

Game.prototype.shotDamage = function(shot, update) {
  if(this.isPlayer(shot.x, shot.y)) {
    //Si le missile est en contact avec un joueur
		var id = this.map[shot.x][shot.y];
		update.p.push(id);
		var p = this.players[id];
		p.life--;
		if(p.life <= 0) {
      //Si le joueur est mort
			this.map[p.x][p.y] = false;
			delete this.players[p.id];
		}
	} else if(this.isBlock(shot.x, shot.y)) {
    //Si le missile est en contact avec un bloc
		update.b.push({x: shot.x, y: shot.y});
		this.map[shot.x][shot.y].life--;
		if(this.map[shot.x][shot.y].life <= 0) {
      //Si le bloc est détruit
			this.map[shot.x][shot.y] = false;
		}
	} else {
    //Informe que le missile doit être supprimé s'il est en dehors des limites de la carte
		return !this.inMap(shot.x, shot.y);
	}
  //Informe que le missile doit être supprimé
	return true;
};

//Effectue l'action d'un missile, et ajoute les dégats à la liste de mises à jours s'il touche un élément. Retourne vrai si le tir doit être supprimé
Game.prototype.moveShot = function(shot, update) {
  if(this.inMap(shot.x, shot.y) && this.shotDamage(shot, update)) {
    return true;
  }
	var pos = this.getPos(shot.x, shot.y, shot.w);
	shot.x = pos.x;
	shot.y = pos.y;
	return this.shotDamage(shot, update);
};

//Effectue les actions des missiles et retourne un objet spécifiant les dégats infligés aux joueurs (p) et blocs (b)
Game.prototype.actionShots = function() {
	var d = {b: [], p: []};
  
  //Positionne les nouveaux tirs
	while(this.fire.length > 0) {
		var f = this.fire.pop();
		switch(f.w) {
		case def.UP:
			f.y = this.map[0].length;
			break;
		case def.DOWN:
			f.y = -1;
			break;
		case def.LEFT:
			f.x = this.map.length;
			break;
		case def.RIGHT:
			f.x = -1;
			break;
		}
		this.shots.push(f);
	}
  
  //Deplace chaque tir et effectue son action
	for(var i in this.shots) {
		var s = this.shots[i];
    if(def.shotSpeed == 1) {
      if(this.moveShot(s, d)) {
				delete this.shots[i];
      }
    } else for(var r = 0 ; r < def.shotSpeed ; r++) {
			if(this.moveShot(s, d)) {
				delete this.shots[i];
				break;
			}
		}
	}
	return d;
};

//Met à jour le jeu et retourne un objet composé des changements
Game.prototype.update = function(playersCount) {

  //Tirs
	var d = this.actionShots();

  //Joueurs
  var mv = this.actionPlayers();
  
  //Aliens
	this.actionAliens();
  
  //Apparition d'alien
	if(this.aliens.length < MAX_ALIENS && Math.random() > (1 - ALIEN_CHANCE)) {
		this.spawnAlien();
	}
  
  //Tri de la liste d'aliens afin que les aliens les plus hauts soient en premier
	this.aliens.sort(sorter);
  
  //Blocs en mouvement
	var b = this.blocks;
	this.blocks = [];
  
	return {mv: mv, b: b, a: this.aliens, f: this.fire, d: d};
};

//Place un joueur sur la map et initialise ses données
Game.prototype.spawn = function(player) {
	player.life = def.playerLife;
	while(!this.setPos(player, random(this.map.length - 1), random(this.map[0].length - 1)));
	return player;
};

//Ajoute un joueur avec l'identifiant spécifié et le retourne
Game.prototype.addPlayer = function(id) {
  if(this.players[id]) {
    return false;
  }  
	var player = {id: id, name: ""};
	this.spawn(player);
	this.players[player.id] = player;
	return player;
};

//Génère un nombre aléatoire allant de 0 à la valeur maximale passée en paramètre
function random(max) {
	return Math.round(Math.random() * max);
}

//Trie des éléments selon leur valeur y
function sorter(a1, a2) {
	return a1.y < a2.y ? -1 : (a1.y === a2.y ? 0 : 1);
}

//Mise à disposition de la classe Game et de ses fonctions
exports.Game = Game;