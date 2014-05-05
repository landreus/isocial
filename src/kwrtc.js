var KWlocalhost = function(peerId){
    this.peerId = peerId;
    this.kadId = new BigInteger(Sha1.hash(this.peerId), 16);
};

//K-buckets are stored in this variable.
var KWBuckets = function(size, kadId){
    this.size = size;
    this.buckets = new Array(size);
    this.kadIdOfThisPeer = kadId;
};

KWBuckets.prototype.getBucket = function(bucketNumber){
    return this.buckets[bucketNumber];
};

KWBuckets.prototype.addToBucket = function(bucketNumber, route){
    if(bucketNumber < this.size && bucketNumber >= 0){
        
        if(!this.buckets[bucketNumber])
            this.buckets[bucketNumber] = new Array();
        this.buckets[bucketNumber].push(route);
    }
};

//Return the number of k-bucket given an xor distance
//and the number of bits in the key or id.
KWBuckets.prototype.getBucketNumberForRoute = function(kadId){
    var xor = this.kadIdOfThisPeer.xor(kadId);
    var length = this.size;
    for(var i = length - 1; i >= 0; i --){
        if(xor.testBit(i))
            return i;
 }
    // none of the bits matched so
    // this bucket contains only one element
    // that is the last bucket
    return 0;
};

var KWRoute = function(dataConnection, peerId, kadId, lastSeen){
    this.dataConnection = dataConnection;
    this.peerId = peerId;
    this.kadId = kadId;
    this.lastSeen = lastSeen;
};

// Global communication object.
var KWComm = function(){
    this.peer = new Peer({ key: 'lwjd5qra8257b9', debug: 3 });
    this.localhost = null;
    this.buckets = null;
    this.initialized = false;
    // Emitted when a connection to the PeerServer is established.
    var instance = this;
    this.peer.on('open', function(peerId){
        instance.localhost = new KWlocalhost(peerId);
        instance.buckets = new KWBuckets(160, instance.localhost.kadId);
        console.log("This peer Id is: " + instance.localhost.peerId);
        instance.initialized = true;
    });

    // Emitted when a new data connection is established from a remote peer to this one.
    this.peer.on('connection', function(dataConnection){
        instance.receiveConnection(dataConnection);
    });
    // Emitted when the peer is destroyed.
    this.peer.on('close', function(){
        //
    });
    // Errors on the peer are almost always fatal and will destroy the peer.
    this.peer.on('error', function(err){
        //
    });
};

KWComm.prototype.receiveMessage = function(data, route){
    //Receive data.
    console.log('data received from ' + route.peerId);
    console.log(data);
};

KWComm.prototype.sendMessageFindPeer = function(dataConnection, route){
    var ts = new Date();
    var timestamp = ts.toUTCString();
    
    dataConnection.send({
        message: 'find peer',
        data:  this.localhost.peerId,
        timestamp: timestamp
    });
};

KWComm.prototype.connectToPeer = function(peerId){
    // we first check if this peer is already on the collection of known routes.
    
    // if not, then connect and send a 'find peer' message
    var dataConnection = this.peer.connect(peerId);
    var instance = this;
    dataConnection.on('open', function(){
        // on success create the route and add it to the corresponding bucket
        var route = new KWRoute(
            dataConnection,
            peerId,
            new BigInteger(Sha1.hash(peerId), 16),
            new Date()
        );
        
        var bucketNumber = instance.buckets.getBucketNumberForRoute(route.kadId);
        instance.buckets.addToBucket(bucketNumber, route);
        // send a find peer message
        instance.sendMessageFindPeer(dataConnection, route);
    });
    // if it exists, do nothing.
    
};

KWComm.prototype.receiveConnection = function(dataConnection){
    // we add a listener to this dataConnection
    var instance = this;
    dataConnection.on('data', function(data){
        // listen to the data received and act accordingly
        var peerId = dataConnection.peer;
        var route = new KWRoute(
            dataConnection,
            peerId,
            new BigInteger(Sha1.hash(peerId), 16),
            new Date()
        );
        instance.receiveMessage(data, route);
    });
};



// kwbuckets.size = 160; // Defined by Kademlia.

/*
kwbuckets.is = function(type, obj) {
    var clas = Object.prototype.toString.call(obj).slice(8, -1);
    return obj !== undefined && obj !== null && clas === type;
};

// Add a route to the corresponding k-bucket (wrapper function).

kwbuckets.add = function(peer){
    var dataConnection;
    var route;
    var sentConnectionRequest = kwbuckets.is('String', peer);
    // If it is a string, connect to the peer.
    // Otherwise it is a dataConnection object.
    sentConnectionRequest?
        dataConnection = kwpeer.connect(peer):
        dataConnection = peer;
    var peerId = dataConnection.peer;
    var route = {
        connection: dataConnection,
        peerId: peerId,
        kadId: new BigInteger(Sha1.hash(peerId), 16),
        lastSeen: new Date()
    };
    dataConnection.on('error', function(error){
        console.log("Error.....");
    });
    dataConnection.on('data', function(data){
        // the peer that received the connection listens to the data
        // and then closes the connection.
        kwcomm.receiveMessage(data, route);
    });
    dataConnection.on('open', function(){
        console.log("connection open...");
        if(sentConnectionRequest){
            // since this peer started the connection it has to send a 
            // 'find peer' message with its new Id.
            kwcomm.sendFindPeerMessage(dataConnection, route);
        }
    });
    var bucketNumber = kwbuckets.getBucketNumber(route.kadId);
    kwbuckets.addToBucket(route, bucketNumber);
};
*/


/*
// Routing table.
var kwroutes = [];
// "localhost" in the Kademlia DHT.
// kwroutes.localhost = null;

// kwroutes

// Return the index of the peer with the given peer.js id.
kwroutes.getRoute = function(peerId){
    for(var i = 0; i < kwroutes.length; i ++){
        if(kwroutes[i].peerId === peerId)
            return i;
    }
    return -1;
};
// Return the closest route given a binary key or id.
// The parameter "from" is a BigInteger 16-bit long.
kwroutes.getClosest = function(from){
    // Check if there are any routes.
    if(kwroutes.length == 0){
        return null;
    }
    var distance; // Store the xor distance in a BigInteger 16-bit long.
    var route = kwroutes[0]; // Extract the first route.
    var closest = route; // Assume the first route is the closest.
    var minimum = from.xor(route.hex); // Compute the xor distance between the given value and the first route.
    for(var i = 1; i < kwroutes.length; i ++){ // Iterate.
        route = kwroutes[i]; // Extract the i-route.
        distance = from.xor(route.hex); // Compute the distance from the given value to the i-route.
        if(minimum.compareTo(distance) > 0){ // Returns 1 if "distance" is smaller than "minimum".
            minimum = distance; // The minimum variable is updated.
            closest = route; // The closest variable is updated
        }
    }
    return closest;
};
// Return the closest route to store data for a given key.
// The parameter "from" is a BigInteger 16-bit long.

kwroutes.getClosestForStorage = function (from){
    var closest = kwroutes.getClosest(from); // Assume the closest was returned.
    var distance = from.xor(kwroutes.localhost.hex); // Compute the distance to this peer "localhost".
    var minimum = from.xor(closest.hex); // Compute the xor distance peer that the function returned.
    if(minimum.compareTo(distance) > 0)
        return kwroutes.localhost; // Store locally.
    return closest; // Store remotely.
};
// Returns an array of peer identifiers.
kwroutes.getRoutes = function(){
    var routes = [];
    for(var i = 0; i < kwroutes.length; i ++){
        routes.push(kwroutes[i].peerId);
    }
    return routes;
};
// Create a route object.
kwroutes.create = function(dataConnection){
	var peerId = dataConnection.peer;
	return {
        connection: dataConnection,
        peerId: peerId,
        kadId: new BigInteger(Sha1.hash(peerId), 16),
        lastSeen: new Date()
    };
};
// Update a route.
kwroutes.update = function(index, dataConnection) {
    kwroutes[index].lastSeen = new Date();
    kwroutes[index].connection = dataConnection;
};
// Add a route to the routing table given a peer identifier.
kwroutes.add = function(peerId){
    var index = kwroutes.getRoute(peerId);
    if(kwroutes.getRoute(peerId) > -1 || peerId === kwroutes.localhost.peerId)
        return void(0);
    var dataConnection = kwpeer.connect(peerId);
    // Remove the route if there is an error in third dataConnection.
    dataConnection.on('error', function(error){
        console.log("Error.....");
    });
    // Add this route to the routing table.
    var route = kwroutes.create(dataConnection);
    // Determine the k-bucket to store this route.
    console.log(route.kadId.toString());
    
    kwroutes.push();
    // Update the index of the new route.
    index = kwroutes.getRoute(peerId);
    // Enable this connection to listen to data.
    dataConnection.on('data', function(data){
        kwcomm.receiveData(data, kwroutes[index]);
    });
    dataConnection.on('open', function(data){
        // console.log("connection open in action");
    });
};
// Remove a route from the routing table.
kwroutes.remove = function(peerId){
    var index = kwroutes.getRoute(peerId);
    if(index > -1){
        kwroutes.splice(index, 1);
        // Probably we should close the connection.
    }
};
// For debugging purposes we show the routing table.
kwroutes.print = function(){
    console.log("localhost: " + kwpeer.id);
    for(var i = 0; i < kwroutes.length; i ++){
        console.log(kwroutes[i].peerId + "|" + kwroutes[i].lastSeen.toISOString());
    }
};


// kwcomm

// Initialize the service

kwcomm.initialize = function(){
    // Set the timeout to broadcast the routing table.
};
//Function to send to all your peers a copy of your routing table every x seconds.
kwcomm.broadcastRoutes = function(){
    // console.log("* Broadcasting routing table.");
    for(var i = 0; i < kwroutes.length; i++){
        kwroutes[i].connection.send({type: "routes", routes: kwroutes.getRoutes()});
    }
};

// kwpeer

//Use the demo key to connect to to the peer.js server.
var kwpeer = new Peer({ key: 'lwjd5qra8257b9', debug: 3 });

// Emitted when a connection to the PeerServer is established.
kwpeer.on('open', function(id){
    console.log("This peer Id is: " + id);
    kwbuckets.localhost.peerId = id;
    kwbuckets.localhost.kadId = new BigInteger(Sha1.hash(id), 16);
});

// Emitted when a new data connection is established from a remote peer.
kwpeer.on('connection', function(dataConnection){
    kwbuckets.add(dataConnection);
});


kwpeer.on('connection', function(dataConnection){
    // Check if the peer is already in the routing table.
    var route;
    var peerId = dataConnection.peer;
    var index = kwroutes.getRoute(peerId);
    index === -1 ? kwroutes.push(kwroutes.create(dataConnection)):
			kwroutes.update(index, dataConnection);
    // Update the index.
    index = kwroutes.getRoute(dataConnection.peer);
    // Listen for data.
    kwroutes[index].connection.on('data', function(data){
        kwcomm.receiveData(data, kwroutes[index]);
    });
    // Send routes to the peer.
    kwroutes[index].connection.on('open', function(data){
        kwroutes[index].connection.send({type: "routes", routes: kwroutes.getRoutes()});
    });
});


// Emitted when the peer is destroyed.
kwpeer.on('close', function(){
    //
});
// Errors on the peer are almost always fatal and will destroy the peer.
kwpeer.on('error', function(err){
    //
});
*/