var fs = require("fs");
var game_lib = require("./game");

//Lecture du fichier de contantes
var def = JSON.parse(fs.readFileSync("client/const.json"));

var stats = JSON.parse(fs.readFileSync("stats.json"));

var mapFile = JSON.parse(fs.readFileSync("map.json"));

//Temps (en itérations) avant de redémarrer une partie
const RESTART_GAME = 25;

var game;
var thread;
var sockets;
var clientsCount;
var startTime;
var gameTime;
var waiting = 0;


function saveStats() {
  fs.writeFile("stats.json", JSON.stringify(stats, null, 4));
}

//Lorsqu'un client se connecte
function onConnect(socket) {
  stats.connections++;

  var playerName = "";

  //Démarre une partie s'il s'agit du premier client
	if(clientsCount === 0) {
		newGame(stats.bestScore);
    //Enregistrement du thread de mise à jour du jeu via la fonction update
    thread = setInterval(update, game.interval);
	}
	clientsCount++;
  
  //Envoi des informations pour ce client
  socket.emit(def.game, game);
  
  //Déconnexion du client
	socket.once(def.deconnection, function() {
    if(game.players[socket.id]) {
      game.map[game.players[socket.id].x][game.players[socket.id].y] = false;
      delete game.players[socket.id];
    }
		sockets.emit(def.deconnection, socket.id);
		clientsCount--;
    if(clientsCount === 0) {
      //Termine le thread précédent
      if(thread) {
        clearInterval(thread);
        waiting = 0;
        game = undefined;
      }
    }
	});
  
  //Le client veut rejoindre la partie
	socket.on(def.join, function() {
		join(socket);
	});
  
  //Le client envoie son souhait de mouvement
	socket.on(def.movement, function(mv) {
		if(game.players[socket.id]) {
			game.players[socket.id].wish = mv;
		}
	});
  
  //Le client change son pseudo
	socket.on(def.updatePlayer, function(name) {
    playerName = name;
		if(game.players[socket.id]) {
			game.players[socket.id].name = name;
			sockets.emit(def.updatePlayer, {id: socket.id, field: "name", value: game.players[socket.id].name});
		}
	});
  
  //Le client envoie un message pour le chat
	socket.on(def.message, function(message) {
		var name;
		try {
			name = escape(game.players[socket.id].name);
		} catch(e) {
			name = escape(playerName);
		}
		sockets.emit(def.message, {author: name, message: escape(message)});
	});
}

//Création d'un joueur avec l'id du socket client
function join(socket) {
  var p = game.addPlayer(socket.id);
  if(p) {
    socket.emit(def.mainPlayer, p);
    socket.broadcast.emit(def.newPlayer, p);
    stats.players++;
  }
}

//Retourne le temps passé depuis le lancement de la partie
function getElapsedTime() {
	return Math.round((new Date().getTime() - startTime)/1000);
}

//Met à jour le jeu et envoie un paquet de mise à jour à tous les clients
function update() {
  var time = getElapsedTime();
  //Fait apparaitre un alien s'il n'y en a aucun au-delà de 6 secondes
	if(time > 6 && game.aliens.length === 0) {
		game.spawnAlien();
	}
  
  //Mise à jour de jeu
	var u = game.update(clientsCount);
  
  //Si tous les joueurs sont morts, envoie les informations de fin de partie puis redémarre après 10 secondes
	if(time > 7 && Object.keys(game.players).length === 0) {
    waiting++;
    //Si les 10 secondes sont écoulées
    if(waiting > RESTART_GAME) {
      newGame(Math.max(game.bestScore, gameTime));
    }
	} else {
    gameTime = time;
		u.t = gameTime;
	}
  
  //Envoi des informations du jeu à jour vers les clients
	sockets.emit(def.update, u);
}

//Start a new game
function newGame(bestScore) {
  stats.bestScore = bestScore;
  stats.games++;
  
	startTime = new Date().getTime();
  
  //Création d'un nouveau jeu
	game = new game_lib.Game(mapFile, bestScore);
  
  //S'il s'agit d'une nouvelle partie avec des clients déjà présents, on les ajoute
	if(gameTime > 0) {
		waiting = 0;
		sockets.emit(def.game, game);
	}
  
  saveStats();
}

//Exporte la fonction d'initialisation de ce contrôleur
exports.init = function(io) {
	clientsCount = 0;
	sockets = io.sockets;
	sockets.on(def.connection, onConnect);
};