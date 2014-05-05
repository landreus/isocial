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
    // check that the number is valid
    if(bucketNumber < this.size && bucketNumber >= 0){
        if(!this.buckets[bucketNumber])
            this.buckets[bucketNumber] = new Array();
        this.buckets[bucketNumber].push(route);
    }
};

//Return the number of k-bucket given an xor distance
//and the number of bits in the key or id.
KWBuckets.prototype.getBucketNumber = function(kadId){
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

KWBuckets.prototype.findNode = function(peerId){
    var kadId = new BigInteger(Sha1.hash(peerId), 16);
    var bucketNumber = this.getBucketNumber(kadId);
    var bucket = this.getBucket(bucketNumber);
    if(bucket){
        var route;
        for(var i = 0; i < bucket.length; i ++){
            route = bucket[i];
            if(route.peerId === peerId)
                return route;
        }
    }
    else return null;
};

var KWRoute = function(dataConnection, peerId, kadId, lastSeen){
    this.dataConnection = dataConnection;
    this.peerId = peerId;
    this.kadId = kadId;
    this.lastSeen = lastSeen;
};

// Router logic here
var KWRouter = function(buckets, localhost){
    this.buckets = buckets;
    this.localhost = localhost;
};

//Return the closest route given a binary key or id.
//The parameter "from" is a BigInteger 16-bit long.
KWRouter.prototype.getNearestNode = function(kadId){
    
    var bucketNumber = this.buckets.getBucketNumber(kadId);
    var bucket = this.buckets.getBucket(bucketNumber);
    
    if(!bucket){
        return null;
    }
    
    if(bucket.length > 0){
        var distance; // Store the xor distance in a BigInteger 16-bit long.
        var node = bucket[0]; // Extract the first route.
        var nearest = node; // Assume the first route is the closest.
        // Compute the xor distance between the given value and the first route.
        var minimum = kadId.xor(node.kadId);
        for(var i = 1; i < bucket.length; i ++){ // Iterate.
            node = bucket[i]; // Extract the i-route.
            // Compute the distance from the given value to the i-route.
            distance = kadId.xor(node.kadId); 
            // Returns 1 if "distance" is smaller than "minimum".
            if(minimum.compareTo(distance) > 0){ 
                minimum = distance; // The minimum variable is updated.
                nearest = node; // The closest variable is updated
            }
        }
        return nearest;
    }
    
    return null;
};

//Return the closest route to store data for a given key.
//The parameter "from" is a BigInteger 16-bit long.
KWRouter.prototype.getNearestForStorage = function (kadId){
    var closest = this.getClosestForStorage(kadId); // Assume the closest was returned.
    var distance = kadId.xor(this.localhost.kadId); // Compute the distance to this peer "localhost".
    var minimum = kadId.xor(closest.hex); // Compute the xor distance peer that the function returned.
    if(minimum.compareTo(distance) > 0)
       return this.localhost; // Store locally.
    return closest; // Store remotely.
};


// Global communication object.
var KWComm = function(){
    this.peer = new Peer({ key: 'lwjd5qra8257b9', debug: 3 });
    this.localhost = null;
    this.buckets = null;
    this.initialized = false;
    this.router = null
    // Emitted when a connection to the PeerServer is established.
    var instance = this;
    this.peer.on('open', function(peerId){
        instance.localhost = new KWlocalhost(peerId);
        instance.buckets = new KWBuckets(160, instance.localhost.kadId);
        instance.router = new KWRouter(instance.buckets, instance.localhost);
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

KWComm.prototype.findNode = function(route){
    if(!this.buckets.findNode(route.peerId)){
        var bucketNumber = this.buckets.getBucketNumber(route.kadId);
        this.buckets.addToBucket(bucketNumber, route);
        return {
            message: 'RES find node',
            body: {
                node: route.peerId,
                found: false
            }
        };
    }
    return {
        message: 'RES find node',
        body : {
            node: route.peerId,
            found: true
        }
    };
};

KWComm.prototype.findKey = function(){};

KWComm.prototype.storeKey = function(){};

KWComm.prototype.ping = function(){};

KWComm.prototype.receiveMessage = function(data, route){
    //Receive data.
    var peerId = route.peerId;
    console.log('data received from ' + peerId);
    console.log(data);
    var message = data.message;
    var response;
    switch(message){
        case 'REQ find node':
            var node = data.body;
            response = this.findNode(route);
            break;
        case 'REQ find key':
            break;
        case 'REQ store key':
            break;
        case 'REQ ping':
            break;
    }
    route.dataConnection.send(response);
};

KWComm.prototype.connectToPeer = function(peerId){
    // we first check if this peer is already on the collection of known routes.
    
    // if not, then connect and send a 'find peer' message
    var dataConnection = this.peer.connect(peerId);
    var instance = this;
    dataConnection.on('open', function(){
        dataConnection.on('data', function(message){
            var body = message.body;
            if(body.found === true){
                // change id this one is taken
                console.log('This id is taken');
            }else{
                console.log('This id is fine');
            }
            dataConnection.close();
            
        });
        // on success create the route and add it to the corresponding bucket
        var route = new KWRoute(
            dataConnection,
            peerId,
            new BigInteger(Sha1.hash(peerId), 16),
            new Date()
        );
        // TODO: check if the peer is already in the bucket
        var bucketNumber = instance.buckets.getBucketNumber(route.kadId);
        instance.buckets.addToBucket(bucketNumber, route);
        // send a find peer message
        var ts = new Date();
        var timestamp = ts.toUTCString();
        dataConnection.send({
            message: 'REQ find node',
            body: instance.localhost.peerId,
            timestamp: timestamp
        });
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
*/