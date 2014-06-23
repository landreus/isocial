var Wrtc = function(){
  this.peer = new Peer({ key: 'lwjd5qra8257b9', debug: 2 });
  this.callStack = [];
  this.ready = false;
  
  this.peer.on('open', function(peerId){
    console.log("The id of this peer is : " + peerId);
    localStorage.setItem( peerId, JSON.stringify( { } ) );
    this.ready = true;
  });

  var instance = this;

  this.peer.on('connection', function(dataConnection){
    console.log('---> incoming connection from ' + dataConnection.peer);
	var connections = instance._getActiveConnections();
    // we forgot to check here if this new connection is generating a bridge
    //    ---------- xn-1
    //    |            |
    //    |            |
    //    x0<--xn<------
    instance._configureDataConnection(dataConnection);
    instance._createBridge(connections, dataConnection.peer);
	// send to this new peer the ids of the neighbors after two seconds
    instance._scheduleSendActiveConnections(dataConnection.peer, 2000);
    instance._redistributeKeys(this.peer);
  });

};
Wrtc.prototype._scheduleSendActiveConnections = function(peerId, timeout){
  var instance = this;
  setTimeout(function(){
    instance._sendActiveConnections(peerId);
  }, timeout);
};
/*
 * Send the id of every node connected to this peer
 * except for the node connected to this one
 */
Wrtc.prototype._sendActiveConnections = function(peerId){
  var routes = this._getActiveConnections();
  // remove the peerId (the node receiving the routing table)
  // from the list of identifiers
  var index = routes.indexOf(peerId);
  if(index > -1){
    routes.splice(index, 1);
  }
  // Build the message
  var message = {
    protocol: this.protocol.ROUTING_TABLE,
    peer: this.peer.id,
    routes: routes
  };
  // Send the message
  this._send(peerId, message);
};

Wrtc.prototype._parseStorage = function(){
  return JSON.parse(localStorage.getItem(this.peer.id));
};

Wrtc.prototype._getKeys = function(){
  return Object.getOwnPropertyNames(this._parseStorage());
};

Wrtc.prototype._getValue = function(key){
  var entries = this._parseStorage();
  return entries[key];
};

Wrtc.prototype._storeKey = function(key, value){
  var entries = this._parseStorage();
  entries[key] = value;
  this._saveStorage(entries);
  console.log('this node is storing key ' + key);
  console.log(value);
};

Wrtc.prototype._saveStorage = function(entries){
  localStorage.setItem(this.peer.id, JSON.stringify(entries));
};

Wrtc.prototype._removeKey = function(key){
  var entries = this._parseStorage();
  delete entries[key];
  this._saveStorage(entries);
};

Wrtc.prototype._redistributeKeys = function(peerId){
  // check if this is done poperly 
  // replicate with neighbors
  var keys = this._getKeys();
  var message = {
    protocol: Wrtc.protocols.STORE,
    key: '',
    value: ''
  };
  var listOfOpenConnections = [peerId];
  for(var i = 0; i < keys.length; i ++){
    message.key = keys[i];
    message.value = this._getValue(keys[i]);
    if(this._forwardStoreRequest(keys[i], listOfOpenConnections, message)){
      this._removeKey(keys[i]);
    }
  }
};

Wrtc.protocols = {
  NEW_CONNECTION: 'new connection',
  CONNECT_TO: 'connect to',
  PING: 'ping',
  STORE: 'store',
  FIND_KEY_REQ: 'find key request',
  FIND_KEY_RES: 'find key response',
  FIND_NODE: 'find node',
  ROUTING_TABLE: 'routing table'
};

Wrtc.prototype.createConnection = function(peerId, active){
  var dataConnection = this.peer.connect(peerId);    
  this._configureDataConnection(dataConnection);
  dataConnection.on('open', function(){
    console.log('connectig to ' + this.peer + ' ---> ');
    // only when a peer deliverately connects to another one
    // then the process of finding through routing the closest
    // one begins...
    this.send({
      protocol: Wrtc.protocols.NEW_CONNECTION,
      peer: this.provider.id
    });
  });

};

/*
 * TODO
 * We might need to check here the trace as well...
 * But for now we will just check the active connections
 */
Wrtc.prototype._forwardStoreRequest = function(key, value){
  return this._forwardRequest(key, 
    this._getActiveConnections().concat([this.peer.id]), {
      protocol: Wrtc.protocols.STORE,
      key: key,
      value: value
  });
};

Wrtc.prototype._forwardRequest = function(shaId, listOfOpenConnections, data){
  if(listOfOpenConnections.length > 0){
    var nearestPeerId = this._findNearest(shaId, listOfOpenConnections);
    if(this.peer.id !== nearestPeerId){
      this._send(nearestPeerId, data);
      return true;
    }
    // no forwarding
  }
  // there was no forwarding
  return false;
};

Wrtc.prototype._forwardFindKeyRequest = function(key, peer, trace){
  return this._forwardRequest(key, this._getUnvisitedConnections(trace), {
    protocol: Wrtc.protocols.FIND_KEY_REQ,
    key: key,
    peer: peer,
    trace: trace
  });
};

Wrtc.prototype.get = function(key, callback){
  // high level function that checks first in the local storage 
  // and if the data is not here then issues a request to the other nodes
  var value = this._getValue(key);
  if(value){
    var data = {
      key: key,
      value: value
    };
    callback(data);
  } else{
    this.callStack[key] = callback;
    if(!this._forwardFindKeyRequest(key, this.peer.id, [this.peer.id])){
      console.log('no data found with key ' + key);
    }
  }
};

Wrtc.prototype._connect = function(newPeerId, onConnectFunction){
  var activeConnections = this._getActiveConnections();
  if(activeConnections.indexOf(newPeerId) > -1)
    return false;
  var newDataConnection = this.peer.connect(newPeerId);
  newDataConnection.on('open', onConnectFunction);
  this._configureDataConnection(newDataConnection);
  return true;
};

Wrtc.prototype._deliverRequest = function(key, value, peerId, trace){
  var data;
  var message;
  if(this.peer.id === peerId){
    // this is the peer that requested the key
    data = {
      key: key,
      value: value
    };
    // take the function from the stack and call it with the data oject
    this.callStack[key](data);
    delete this.callStack[key];
  } else {
    // build the message
    message = {
      protocol: Wrtc.protocols.FIND_KEY_RES,
      key: key,
      value: value,
      peer: peerId,
      trace: trace
    };
    // try to send the data to the peerId if it is connected directly to this peer
    var sent = this._send(peerId, message);
    if(sent)
      return true;
    // this peer is not connected to peerId 
    // keep forwarding the response to the closest node
    // exclude the id of this peer
    // obviously if this peer is the closest but has no connection
    // we have to forward the response to another peer, the second closest you could say
    // OK so the problem is that the message bounces back and forth since this peer is the closest...
    // so here we remove the connections to those peers that are already in the trace array
    this._forwardRequest(peerId, this._getUnvisitedConnections(message.trace), message)?
      console.log("request forwarded for key " + key):
      console.log("no more peers found to forward the request for key " + key);
  }
};

Wrtc.prototype._getUnvisitedConnections = function (trace){
  var connectionsToCheck = this._getActiveConnections();
  connectionsToCheck = connectionsToCheck.filter(function(element){
    return this.indexOf(element) < 0;
  }, trace);
  return connectionsToCheck;
};

Wrtc.prototype._configureDataConnection = function(dataConnection){
  var instance = this;
  dataConnection.on('data', function(message){
    //
    console.log('message type ' + message.protocol);
    switch(message.protocol){
        case Wrtc.protocols.NEW_CONNECTION:
          console.log(message.protocol);
          // we need to return the closest id in the network
          // so that this new peer can that has just connected
          // to us can then connect to it and give us a
          // notion of proximity in the dht
          // some sense of order
          // problem: issue a nested request and keep track of it
          // so that we can return the correct result
          var targetPeerIdSha = Sha1.hash(message.peer);
          var activeConnections = instance._getActiveConnections();
          var wasForwarded = instance._forwardRequest(targetPeerIdSha,
            activeConnections.concat([this.provider.id]), {
              protocol: Wrtc.protocols.NEW_CONNECTION,
              peer: message.peer
          });
          
          if(wasForwarded)
            break;
          // here we know that this peer is the closest to the new one
          // check if a connection to this peer already exists
          // if not, then connect to the peer
          instance._connect(message.peer, function(){
            // redistribute the keys here
            instance._redistributeKeys(message.peer);
          });
          // now that we are connected to this new peer,
          // we want to see if it is also closer to an existing
          // connection and if this is the case,
          // then we connect them
          instance._createBridge(activeConnections, message.peer);
          break;
        case Wrtc.protocols.CONNECT_TO:
          instance._connect(message.peer, function(){
            // redistribute the keys here
            instance._redistributeKeys(message.peer);
          });
          break;
        case Wrtc.protocols.PING:
          console.log('ping from ' + message.peer);
          break;
        case Wrtc.protocols.STORE:
          instance.put(message.key, message.value);
          break;
        case Wrtc.protocols.FIND_KEY_REQ:
          // check if this node has the key
          // if it does then send a response message
          var value = instance._getValue(message.key);
          if(value){
            // then send this to the message.peer
            instance._deliverRequest(
              message.key, 
              value, 
              message.peer,
              [instance.peer.id]
            );
          } else{
            // forward the request to the open connections of this peer
            var wasForwarded = instance._forwardFindKeyRequest(
              message.key, 
              message.peer, 
              message.trace.concat([instance.peer.id])
            );
            if(!wasForwarded){
              console.log("this peer does not have the key and is not conencted to any other peers that might have it...");
              console.log("we drop the request from peer " + message.peer + " to find the key " + message.key);
            }
          }
          break;
        case Wrtc.protocols.FIND_KEY_RES:
          instance._deliverRequest(
            message.key, 
            message.value, 
            message.peer, 
            message.trace.concat([instance.peer.id])
          );
          break;
    }
  });

  dataConnection.on('error', function(){
    //
  });

  dataConnection.on('close', function(){
    // try to clean as much memory as possible
    var peerId = this.peer;
    if(this.provider.connections.hasOwnProperty(peerId)){
      this.removeAllListeners();
      var index = this.provider.connections[peerId].indexOf(this);
      if (index > -1) {
        this.provider.connections[peerId][index].socket = null;
        this.provider.connections[peerId][index]._dc = null;
        this.provider.connections[peerId].splice(index, 1);
        this.provider = null;
      }
    }
    console.log('connection closed with peer ' + peerId);
  });

};

/*
 * Determine if a peer is already connected
 * and a new one is insterted in between
 * if this is the case, a new connection between
 * them should be established.
 */
Wrtc.prototype._createBridge = function(activeConnections, targetPeerId){
  if(activeConnections.length < 2)
    return false;
  // we need to know if the new peer is between this one and another one
  // exclude the peer id of this node
  var nearestPeerId = this._findNearest(Sha1.hash(targetPeerId), activeConnections);
  var isAnEnd = (
    this._compareTo(this.peer.id, targetPeerId) < 0
    &&
    this._compareTo(nearestPeerId, targetPeerId) < 0
  ) || (
    this._compareTo(this.peer.id, targetPeerId) > 0
    &&
    this._compareTo(nearestPeerId, targetPeerId) > 0
  );
  if(isAnEnd)
    return false;
  console.log('the peer ' + targetPeerId + ' is between ' + this.peer.id + ' and ' + nearestPeerId);
  // then the nearestPeerId needs to connect to the new node as well.
  // thisPeer ---------------> nearestPeer
  // thisPeer --->newPeer<---- nearestPeer
  this._send(nearestPeerId, {
    protocol: Wrtc.protocols.CONNECT_TO,
    peer: targetPeerId
  });
  return true;
};

// exposed function
// well... everything is exposed but if it starts with an '_'
// it means you should not use it outside the class :)
Wrtc.prototype.put = function(key, value){
  // We are here because a peer forwarded a store key value pair here.
  // Check if we are the closest peer and forward the request if this is not the case.
  if(!this._forwardStoreRequest(key, value)){
    // if we reach this point it means that we have to store the key value pair in this peer
    this._storeKey(key, value);
  }
};

Wrtc.prototype.ping = function(){
  var data = {
    protocol: 'ping',
    peer: this.peer.id
  };
  for(var peerId in this.peer.connections){
    this._send(peerId, data);
  }
};

Wrtc.prototype._getActiveConnections = function(){
  var peerId, connection;
  var activeConnections = [];
  for(peerId in this.peer.connections){
    for(connection in this.peer.connections[peerId]){
      if(this.peer.connections[peerId][connection].open){
        activeConnections.push(peerId);
        break;
      }
    }
  }
  return activeConnections;
};

Wrtc.prototype._getActiveConnection = function(peerId){
  var dataConnection;
  if(this.peer.connections[peerId] && 
     this.peer.connections[peerId].length > 0){
    for(var con in this.peer.connections[peerId]){
      if(this.peer.connections[peerId][con].open){
        dataConnection = this.peer.connections[peerId][con];
        break;
      }
    }
  }
  return dataConnection;
};

Wrtc.prototype._send = function(peerId, data){
  var conn = this._getActiveConnection(peerId);
  if(conn){
    conn.send(data);
    return true;
  }
  return false;
};

Wrtc.prototype._findNearest = function(sha0, connections){
  var nearestPeerId;
  var peerId;
  var kad0 = new BigInteger(sha0, 16);
  var sha1;
  var kad1, distance, min;
  var initial = true;

  for(var i in connections){
    peerId = connections[i];
    sha1 = Sha1.hash(peerId);
    if(sha0 === sha1){
      // exclude distance from itself
      continue;
    }
    kad1 = new BigInteger(sha1, 16);
    distance = kad0.xor(kad1);
    if(initial){
      initial = false;
      // if we have not computed a probable min do so
      min = kad0.xor(kad1);
      // and assume this first one to be the nearest so far
      nearestPeerId = peerId;
      // fetch the next one
      continue;
    }
    // return a positive number if "min" is bigger than "distance"
    if(min.compareTo(distance) > 0){
      min = distance;
      nearestPeerId = peerId;
    }
    // fetch the next
  }

  return nearestPeerId;
};

Wrtc.prototype._compareTo = function(peerId0, peerId1){
  /*
   * Compare peerId0 to peerId1
   * Return + if peerId0 > than peerId1
   * Return - if peerId0 < than peerId1
   * Return 0 if they are equal
   */
  var kad0 = new BigInteger(Sha1.hash(peerId0), 16);
  var kad1 = new BigInteger(Sha1.hash(peerId1), 16);

  return kad0.compareTo(kad1);
};

Wrtc.prototype.generateKey = function(obj){
  var strObj = JSON.stringify(obj);
  var salt = this.peer.id;
  var str = salt + strObj;
  var key = Sha1.hash(str);
  return key;
};
