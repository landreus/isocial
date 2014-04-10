// Global communication object.
var kwcomm = {
		messages: [],
		exploring: false
};
// Routing table.
var kwroutes = [];
// "localhost" in the Kademlia DHT.
kwroutes.localhost = null;
// Use the demo key to connect to to the peer.js server.
var kwpeer = new Peer({ key: 'lwjd5qra8257b9', debug: 3 });

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
    kwroutes.push(kwroutes.create(dataConnection));
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
    setInterval(function(){
        var timestamp = new Date();
        console.log("* routes " + timestamp.toISOString());
        kwroutes.print();
        kwcomm.broadcastRoutes();
    },10000);
};
//Function to send to all your peers a copy of your routing table every x seconds.
kwcomm.broadcastRoutes = function(){
    // console.log("* Broadcasting routing table.");
    for(var i = 0; i < kwroutes.length; i++){
        kwroutes[i].connection.send({type: "routes", routes: kwroutes.getRoutes()});
    }
};
// Receive data.
kwcomm.receiveData = function(data, route){
    if(data.type === "routes"){
        kwcomm.messages = kwcomm.messages.concat(data.routes);
        kwcomm.explore();
    } else if(data.type === "heartbeat"){
        // update the lastSeen attribute
        var now = new Date();
        console.log("heartbeat " + now.toISOString() + " from " + route.peerId);
    }
};
// Explore for additional peers using the message stack.
kwcomm.explore = function(){
	// Empty the message queue.
	var peerId;
	while(kwcomm.messages.length > 0){
		peerId = kwcomm.messages.pop();
		kwroutes.add(peerId);
	}
};


// kwpeer

// Emitted when a connection to the PeerServer is established.
kwpeer.on('open', function(id){
    console.log("This peer Id is: " + id);
    kwroutes.localhost = {peerId: id, hex: new BigInteger(Sha1.hash(id), 16)};
});
// Emitted when a new data connection is established from a remote peer.
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
        // kwroutes[index].connection.send({type: "routes", routes: kwroutes.getRoutes()});
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