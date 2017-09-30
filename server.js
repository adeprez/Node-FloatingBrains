#!/bin/env game
var url = require("url");
var fs = require("fs");

//Fichier de configuration
var config = JSON.parse(fs.readFileSync("config.json"));

//Fichier lorsque la ressource demandée n'est pas trouvée
var error = fs.readFileSync(config["404"], config.encoding);

//Initialisation des ressources et mise en cache des contenus depuis le fichier de config
var resources = {};
for(var rKey in config.resources) try {
	var rw = config.resources[rKey];
	resources[rKey] = rw.force ? rw : {
		type: rw.type,
    val: rw.encoded ? fs.readFileSync(rw.val, config.encoding) : fs.readFileSync(rw.val)
	};
} catch(err) {
  resources[rKey] = {type: "text/html", val: err};
}

//Traitement de la demande client avec une ressource pour réponse
function response(req, res) {
  try {
    var path = url.parse(req.url).pathname;
    var doc;
    if(resources[path]) {
      doc = resources[path];
    } else {
      if(path === "/facebook/") {
        doc = resources["/facebook"];
      } else {
        doc = resources[path.replace("/facebook", "")];
      }
    }
    if(doc) {
      if(doc.force) {
        fs.readFile(doc.val, config.encoding, function(err, data) {
          if(err) {
            res.writeHead(500, {"Content-Type": "text/html"});
            res.end(err);
          } else {
            res.writeHead(200, {"Content-Type": doc.type});
            res.end(data);
          }
        });
      } else {
        res.writeHead(200, {"Content-Type": doc.type});
        res.end(doc.val);
      }
    } else {
      res.writeHead(404, {"Content-Type": "text/html"});
      res.end(error);
    }
  } catch(e) {
    res.writeHead(500, {"Content-Type": "text/html"});
    res.end(e);
  }
}

//Initialisation du serveur
var server = require('http').createServer(response);

//Initialisation du contrôleur
require("./controller").init(require('socket.io').listen(server));

//Lancement du serveur
var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';

server.listen(server_port, server_ip_address, function() {
	var addr = server.address();
  console.log("Server started at", addr.address + ":" + addr.port);
});