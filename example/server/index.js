var http = require('http');
var fs = require("fs");
var WebSocketServer = require('ws').Server;

var uuid = require('uuid');

var wsPort = 5000;
var masterId;
var listeners = {};

var httpServer = http.createServer(function (req, res) {
  //console.log(req.url);

  if(req.url == "/webaudio/"){
	var index = fs.readFileSync('index.html');
	
  	res.writeHead(200, {'Content-Type': 'text/html'});
  	res.end(index);

  } else if(req.url == "/webaudio/scripts/ws-audio-api.min.js"){
	var audiojs = fs.readFileSync('ws-audio-api.min.js');

	res.writeHead(200, {'Content-Type': 'application/javascript'});
  	res.end(audiojs);

  }

}).listen(wsPort);

/*var httpsServer = https.createServer({
    key: fs.readFileSync('key.pem', 'utf8'),
    cert: fs.readFileSync('cert.pem', 'utf8')
}).listen(wsPort);*/


var wss = new WebSocketServer({ server: httpServer });

wss.on('connection', function (ws) {
    var connectionId = uuid.v4();//ws.upgradeReq.headers['sec-websocket-key'];
    
    ws.id = connectionId;
    var isMaster = false;

    if (!masterId) {
        masterId = connectionId;
        isMaster = true;
        ws.on('message', function (message) {
            for (var cid in listeners) {
                listeners[cid].send(message, {
                    binary: true
                }, function (err) {
                    if (err) {
                        console.log('Error: ', err);
                    }
                });
            }
        });
        console.log('Speaker connected');
    } else {
        listeners[connectionId] = ws;
        isMaster = false;
        console.log('Listener connected');
    }

    ws.on('close', function () {
       if (isMaster) {
           masterId = null;
           console.log('Speaker disconnected');
       } else {
           delete listeners[connectionId];
           console.log('Listener disconnected');
       }
    });
});

console.log('Listening on port:', wsPort);
