var Wrtc = function(){
  this.peer = new Peer({ key: 'lwjd5qra8257b9', debug: 2 });
  this.callStack = [];

  this.peer.on('open', function(peerId){
    console.log("The id of this peer is : " + peerId);
  });

  var instance = this;

  this.peer.on('connection', function(dataConnection){
    console.log('---> incoming connection from ' + dataConnection.peer);
    instance._configureDataConnection(dataConnection);

  });

};

Wrtc.protocols = {
  NEW_CONNECTION: 'new connection',
  CONNECT_TO: 'connect to',
  PING: 'ping',
  STORE: 'store',
  FIND_KEY_REQ: 'find key request',
  FIND_KEY_RES: 'find key response',
  FIND_NODE: 'find node'
};

Wrtc.prototype.createConnection = function(peerId, active){
  var dataConnection = this.peer.connect(peerId);    
  this._configureDataConnection(dataConnection);

  dataConnection.on('open', function(){
    console.log('connectig to ' + this.peer + ' ---> ');
    this.send({
      protocol: Wrtc.protocols.NEW_CONNECTION,
      peer: this.provider.id
    });
  });

};

Wrtc.prototype._forwardStoreRequest = function(key, value){
  return this._forwardRequest(key, Object.keys(this.peer.connections), {
    protocol: Wrtc.protocols.STORE,
    key: key,
    value: value
  });
};

Wrtc.prototype._forwardConnectionRequest = function(newPeerId){
  return this._forwardRequest(Sha1.hash(newPeerId), Object.keys(this.peer.connections), {
    protocol: Wrtc.protocols.NEW_CONNECTION,
    peer: newPeerId
  });
};

Wrtc.prototype._forwardRequest = function(shaId, listOfOpenConnections, data){
  if(listOfOpenConnections.length > 0){
    var nearestPeerId = this._findNearest(shaId, listOfOpenConnections.concat([this.peer.id]));
    if(this.peer.id !== nearestPeerId){
      this._send(nearestPeerId, data);
      return true;
    }
    // no need to forward
    // this peer is the closest one
  }
  // no request forwarding
  return false;
};

Wrtc.prototype._forwardFindKeyRequest = function(key, peer){
  return this._forwardRequest(key, Object.keys(this.peer.connections), {
    protocol: Wrtc.protocols.FIND_KEY_REQ,
    key: key,
    peer: peer
  });
};

Wrtc.prototype.get = function(key, callback){
  // high level function that checks first in the local storage 
  // and if the data is not here then issues a request to the other nodes
  var value = this._getLocally(key);
  if(value){
    var data = {
      key: key,
      value: value
    };
    callback(data);
  } else{
    this.callStack[key] = callback;
    if(!this._forwardFindKeyRequest(key, this.peer.id)){
      console.log('data not found with key ' + key);
    }
  }
};

Wrtc.prototype._connect = function(newPeerId, onConnectFunction){
  if(!this.peer.connections.hasOwnProperty(newPeerId)){
    var newDataConnection = this.peer.connect(newPeerId);
    // here we can redistribute the keys of this peer with the new one
    newDataConnection.on('open', onConnectFunction);
    this._configureDataConnection(newDataConnection);
  }
};

Wrtc.prototype._forwardConnectionToPeerRequest = function(newPeerId){
  var listOfOpenConnections = Object.keys(this.peer.connections);
  if(listOfOpenConnections.length > 1){
    // we need to know if the new peer is between this one and another one
    var nearestPeerId = this._findNearest(Sha1.hash(newPeerId), listOfOpenConnections); // exclude the peer id of this node
    var isAnEnd = 
      (this._compareTo(this.peer.id, newPeerId) < 0 && this._compareTo(nearestPeerId, newPeerId) < 0) || 
      (this._compareTo(this.peer.id, newPeerId) > 0 && this._compareTo(nearestPeerId, newPeerId) > 0);
    // the new peer might be the last one in the network
    // nearestPeer ------> thisPeer
    // nearestPeer ------> thisPeer ------> newPeer
    // if it is not then we need to proceed accordingly
    if(!isAnEnd){
      console.log('notify another peer to connect to the new one');
      // then the nearestPeerId needs to connect to the new node as well.
      // thisPeer ---------------> nearestPeer
      // thisPeer --->newPeer<---- nearestPeer
      this._send(nearestPeerId, {
        protocol: Wrtc.protocols.CONNECT_TO,
        peer: newPeerId
      });
      return true;
    }
  }
  return false;
};

Wrtc.prototype._deliverRequest = function(key, value, peerId){
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
      peer: peerId
    };
    // try to send the data to the peerId if it is connected directly to this peer
    if(!this._send(peerId, message)){
      // this peer is not connected to peerId 
      // keep forwarding the response to the closest node
      this._forwardRequest(peerId, Object.keys(this.peer.connections), message);
    }
  }
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
          if(!instance._forwardConnectionRequest(message.peer)){
            // here we know that this peer is the closest to the new one
            // check if a connection to this peer already exists
            // if not, then connect to the peer
            instance._connect(message.peer, function(){
              // TODO
              // redistribute the keys here
            });
            instance._forwardConnectionToPeerRequest(message.peer);
          }
          break;
        case Wrtc.protocols.CONNECT_TO:

          instance._connect(message.peer, function(){
            // TODO
            // redistribute the keys here
          });
          break;
        case Wrtc.protocols.PING:
          console.log('ping from ' + message.peer);
          break;
        case Wrtc.protocols.STORE:
          instance.store(message.key, message.value);
          break;
        case Wrtc.protocols.FIND_KEY_REQ:
          // check if this node has the key
          // if it does then send a response message
          var value = instance._getLocally(message.key);
          if(value){
            // then send this to the message.peer
            instance._deliverRequest(message.key, value, message.peer);
          } else{
            // forward the request to the open connections of this peer
            instance._forwardFindKeyRequest(message.key, message.peer)
          }
          break;
        case Wrtc.protocols.FIND_KEY_RES:
          instance._deliverRequest(message.key, message.value, message.peer);
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

    console.log('connection closed');
  });

};

// exposed function
// well... everything is exposed but if it starts with an '_'
// it means you should not use it outside the class :)
Wrtc.prototype.store = function(key, value){
  // We are here because a peer forwarded a store key value pair here.
  // Check if we are the closest peer and forward the request if this is not the case.
  if(!this._forwardStoreRequest(key, value)){
    // if we reach this point it means that we have to store the key value pair in this peer
    this._storeLocally(key, value);
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

Wrtc.prototype._storeLocally = function(key, value){
  console.log('this node is storing key ' + key);
  console.log(value);
  localStorage.setItem(key, JSON.stringify(value));
};

Wrtc.prototype._getLocally = function(key){
  return JSON.parse(localStorage.getItem(key));
};