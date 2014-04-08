// Global kadrtc object
var kadrtc = {
    // Use the demo key to connecto to the peer.js server.
    peer: new Peer({ key: 'lwjd5qra8257b9', debug: 3 }),
    localhost: null,
    routes: []
};

kadrtc.receiveData = function(data, route){
    if(data.type === "routes"){
        // add this routes to the routing table
        for(var i = 0; i < data.routes.length; i ++){
            if(data.routes[i] === kadrtc.localhost.peerId)
                continue;
            kadrtc.routes.add(data.routes[i]);
        }
    } else if(data.type === "heartbeat"){
        // update the lastSeen attribute
        var now = new Date();
        console.log("heartbeat " + now.toISOString() + " from " + route.peerId);
    }
};

// Return the index of the peer with the given peer.js id.
kadrtc.routes.getRoute = function(peerId){
    for(var i = 0; i < kadrtc.routes.length; i ++){
        if(kadrtc.routes[i].peerId === peerId)
            return i;
    }
    return -1;
};
// Return the closest route given a binary key or id.
// The paremeter "from" is a BigInteger 16-bit long.
kadrtc.routes.getClosest = function(from){
    // Check if there are any routes.
    if(kadrtc.routes.length == 0){
        return null;
    }
    var distance; // Store the xor distance in a BigInteger 16-bit long.
    var route = kadrtc.routes[0]; // Extract the first route.
    var closest = route; // Assume the first route is the closest.
    var minimum = from.xor(route.hex); // Compute the xor distance between the given value and the first route.
    for(var i = 1; i < kadrtc.routes.length; i ++){ // Iterate.
        route = kadrtc.routes[i]; // Extract the i-route.
        distance = from.xor(route.hex); // Compute the distance from the given value to the i-route.
        if(minimum.compareTo(distance) > 0){ // Returns 1 if "distance" is smaller than "minimum".
            minimum = distance; // The minimum variable is updated.
            closest = route; // The closest variable is updated
        }
    }
    return closest;
};
// Return the closest route to store data for a given key.
// The paremeter "from" is a BigInteger 16-bit long.
kadrtc.routes.getClosestForStorage = function (from){
    var closest = kadrtc.routes.getClosest(from); // Assume the closest was returned.
    var distance = from.xor(kadrtc.localhost.hex); // Compute the distance to this peer "localhost".
    var minimum = from.xor(closest.hex); // Compute the xor distance peer that the function returned.
    if(minimum.compareTo(distance) > 0)
        return kadrtc.localhost; // Store locally.
    return closest; // Store remotely.
};
// Return only the peerId from the routing table.
kadrtc.routes.getPeerIds = function(){
    var routes = [];
    for(var i = 0; i < kadrtc.routes.length; i ++){
        routes.push(kadrtc.routes[i].peerId);
    }
    return routes;
};
// Add a route to the routing table.
// Received a data connection.
// Connections are kept open.
kadrtc.routes.add = function(peerId){
    var index = kadrtc.routes.getRoute(peerId);
    if(kadrtc.routes.getRoute(peerId) > -1)
        return void(0);
    var dataConnection = kadrtc.peer.connect(peerId);
    // Remove the route if there is an error in third dataConnection.
    dataConnection.on('error', function(error){
        console.log(error);
    });
    // Add this route to the routing table.
    kadrtc.routes.push({
        connection: dataConnection,
        peerId: peerId,
        kadId: new BigInteger(Sha1.hash(peerId), 16),
        lastSeen: new Date()
    });
    // Update the index of the new route.
    index = kadrtc.routes.getRoute(peerId);
    // Enable this connection to listen to data.
    dataConnection.on('data', function(data){
        kadrtc.receiveData(data, kadrtc.routes[index]);
    });
    dataConnection.on('open', function(data){
        // console.log("connection open in action");
    });
};
// Remove a route from the routing table.
kadrtc.routes.remove = function(peerId){
    var index = kadrtc.routes.getRoute(peerId);
    if(index > -1){
        kadrtc.routes.splice(index, 1);
        // Probably we should close the connection.
    }
};
// For debugging purposes we show the routing table.
kadrtc.routes.print = function(){
    console.log("localhost: " + kadrtc.peer.id);
    for(var i = 0; i < kadrtc.routes.length; i ++){
        console.log(kadrtc.routes[i].peerId + "|" + kadrtc.routes[i].lastSeen.toISOString());
    }
};
// Function to send to all your peers a copy of your routing table every x seconds.
kadrtc.routes.bcroutes = function(){
    // console.log("* Broadcasting routing table.");
    for(var i = 0; i < kadrtc.routes.length; i++){
        kadrtc.routes[i].connection.send({type: "routes", routes: kadrtc.routes.getPeerIds()});
    }
};



// Initialize the service
kadrtc.initialize = function(){
    // Set the timeout to broadcast the routing table.
    setInterval(function(){
        var timestamp = new Date();
        console.log("* routes " + timestamp.toISOString());
        kadrtc.routes.print();
        kadrtc.routes.bcroutes();
    },10000);
};
// Emitted when a connection to the PeerServer is established.
kadrtc.peer.on('open', function(id){
    console.log("This peer Id is: " + id);
    kadrtc.localhost = {peerId: id, hex: new BigInteger(Sha1.hash(id), 16)};
});
// Emitted when a new data connection is established from a remote peer.
kadrtc.peer.on('connection', function(dataConnection){
    // Check if the peer is already in the routing table.
    var route;
    var peerId = dataConnection.peer;
    var index = kadrtc.routes.getRoute(peerId);
    if(index === -1){
        //Add the route.
        kadrtc.routes.push({
            connection: dataConnection,
            peerId: peerId,
            kadId: new BigInteger(Sha1.hash(peerId), 16),
            lastSeen: new Date()
        });
        index = kadrtc.routes.getRoute(dataConnection.peer);
    } else {
        // Update the lastSeen property and update the connection object.
        kadrtc.routes[index].lastSeen = new Date();
        kadrtc.routes[index].connection = dataConnection;
    }
    kadrtc.routes[index].connection.on('data', function(data){
        kadrtc.receiveData(data, kadrtc.routes[index]);
    });
    kadrtc.routes[index].connection.on('open', function(data){
        kadrtc.routes[index].connection.send({type: "routes", routes: kadrtc.routes.getPeerIds()});
        console.log("connection open in listener");
    });
});
// Emitted when the peer is destroyed.
kadrtc.peer.on('close', function(){
    //
});
// Errors on the peer are almost always fatal and will destroy the peer.
kadrtc.peer.on('error', function(err){
    //
});