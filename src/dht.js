// join the network
// instance of a peer
// configure the peer
// this module is not concerned about connections
// only events and actions
// the peer object will be passed to other modules
// for the storage it will provide
// put and get only
var DHT = function(){
  this.peer = null;
  this.callStack = [];
  this.ready = false;
  this._initialize();
};

DHT.prototype._protocols = {
  JOIN: 'JOIN',
  NEW: 'NEW',
  ROUTES: 'ROUTES',
  PING: 'PING',
  GET: 'GET',
  PUT: 'PUT',
  PASS: 'PASS',
};

DHT.prototype._initialize = function (){
  this.peer = new Peer({ key: 'lwjd5qra8257b9', debug: 2 });
  this.peer.on('open', this._onPeerCreated);
  this.peer.on('connection', this._onConnectionReceived);
};

/* High-level events */

// now the events
DHT.prototype._onPeerCreated = function(peerId) {
  // storage.initialize();
  this.ready = true;
};

DHT.prototype._onConnectionReceived = function (dataConnection){
  dataConnection.on('data', this._onDataReceived);
  // replication.redistributeKeys();
  dataConnection.on('close', function(){
    this._onDisconnect(dataConnection.peer);
  });
  this._multicastROUTES();
};

DHT.prototype._onDataReceived = function(data){
  var protocol = data.protocol ? data.protocol: 'none';
  console.log('message type ' + protocol);
  switch(protocol){
    case this._protocols.JOIN:
      // a new node wants to join the network
      this._onJoin(data);
      break;
    case this._protocols.NEW:
      // a new node has joined
    	this._onNew(data);
      break;
    case this._protocols.PING:
      break;
    case this._protocols.ROUTES:
      // dissemination of routes from neighbors
      break;
    case this._protocols.GET:
      // retrieve a key-value pair
      break;
    case this._protocols.PUT:
      // store a key-value pair
      break;
    case this._protocols.PASS:
      // route/pass a message across the network
      break;
  }
};

/* Protocol events */

DHT.prototype._onJoin = function(message){
  // I need to know if any of my neighbors are closer to the new node 
  // get my neighbors and remove the one that forwarded this message
  var connections = router.myConnections();
  // message.peer is a string that the arithmetic module transforms accordingly
  var nearest = arithmetic.findNearest(message.peer, connections.concat([this.peer.id]));
  if(this.peer.id === nearest && connections.indexOf(message.peer) === -1){
    // this node is the closest so connect to the peer if no previous connection exists
    this._connect(message.peer);
    this._unicastROUTES(message.peer, connections);
    this._multicastNEW(connections, message.peer);
  } else {
    this._send(nearest, message);
  }
};

DHT.prototype._onNew = function(message){
  var newPeer = message.newPeer;
  var sourcePeer = message.peer;
  router.updateRoutes(sourcePeer, newPeer); // update the router with the new connection
  // check if this peer should also connect to the new one
  if(
      (
        arithmetic.lessThan(this.peer.id, newPeer)
        &&
        arithmetic.lessThan(newPeer, sourcePeer)
      ) ||
      (
        arithmetic.lessThan(sourcePeer, newPeer)
        &&
        arithmetic.lessThan(newPeer, this.peer.id)
      )
    ){
    var routes = router.getRoutesOf(sourcePeer);
    // the routes of the neighbor if sourcePeer include this node
    var nearest = arithmetic.findNearest(message.newPeer, routes);
    var connections = router.myConnections();
    if(this.peer.id === nearest && connections.indexOf(message.peer) === -1){
      this._connect(message.newPeer);
      this._unicastROUTES(message.peer, connections);
    }
  }
};

DHT.prototype._onDisconnect = function(peer){
  // here we will reconnect to the closest peer connected to the lost one
  // following the direction always, either greater or lower than this peer's id
  var routes = router.getRoutesOf(peer);
  if(arithmetic.lessThan(this.peer.id, peer)){
    // check only routes that have an id lower that this peer
    routes = arithmetic.filterLowerThan(routes);
  } else if(arithmetic.greaterThan(this.peer.id, peer)){
    // check only routes that have an id greater that this peer
    routes = arithmetic.filterGreaterThan(routes);
  }
  var connections = router.myConnections();
  var nearest = arithmetic.findNearest(routes);
  if(connections.indexOf(nearest) === -1){
    this._connect(nearest);
    this._unicastROUTES(nearest, connections);
    this._multicastNEW(connections, nearest);
  }
};

/* Protocol transmission tasks */

DHT.prototype._multicastNEW = function (connections, newPeer){
  var message = {
    protocol: this._protocols.NEW,
    newPeer: newPeer,
    peer: this.peer.id
  };
  this._multicast(connections, message);
};

DHT.prototype._multicastROUTES = function (){
  var connections = router.myConnections();
  var message = {
    protocol: this._protocols.ROUTES,
    routes: connections,
    peer: this.peer.id
  };
  this._scheduleMulticast(connections, message, 2533);
};

DHT.prototype._unicastROUTES = function(peer, connections){
  var message = {
      protocol: this._protocols.ROUTES,
      routes: connections,
      peer: this.peer.id
  };
  this._scheduleUnicast(peer, message, 1777);
};

/* Transmission schedulers */

DHT.prototype._scheduleUnicast = function(peer, message, timeout){
  var instance = this;
  setTimeout(function(){
    instance._unicast(peer, message);
  }, timeout);
};

DHT.prototype._scheduleMulticast = function(connections, message, timeout){
  var instance = this;
  setTimeout(function(){
    instance._multicast(connections, message);
  }, timeout);
};

/* Transmission tasks */

DHT.prototype._multicast = function(connections, data){
  //
};

DHT.prototype._unicast = function(peer, message){
  this._send(peer, message);
};

/* Low-level transmission/communication tasks */

DHT.prototype._connect = function(peer){
  // check that the peer is not connected
  var dataConnection = this.peer.connect(peer);
  dataConnection.on('data', this._onDataReceived);
};

DHT.prototype._send = function(peer, message){
  //
};