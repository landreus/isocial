isocial
=======

This project is an implementation of a Distributed Hash Table (DHT) using WebRTC and HTML 5 storage capabilities. So make sure your browser supports both!

The initial idea was to implement Kademlia, a famous DHT known to perform well in a set of unreliable hosts. However, the limitations of WebRTC, mainly the memory management of closed connections, made it difficult (if not impossible) to follow the specification of the algorithms and data structures.

Instead, this DHT uses the XOR distance metric to compute proximity between the peerss (or nodes for that matter) between themselves and the keys. Browser (peers or nodes, any of these terms are suitable in this document) connect to any other browser already in the network by providing its identifier (ID).

The libraries you need to user are :
* peer.js (handle the peer-to-peer communication, more at http://peerjs.com/)
* jsbn.js and jsbn2.js (incredible libraries for binary manipulation, credit goes to Tom Wu at http://www-cs-students.stanford.edu/~tjw/jsbn/)
* sha1.js (for obtaining 160-bit keys, credit goes to Chris Veness at http://www.movable-type.co.uk)

Additional recommended libraries:
* jquery (not totally needed but it helps developers attach events easily to DOM elements)
* mustache.js (for client-side templete engine, more at https://github.com/janl/mustache.js)

This is working progress and it whereas it is possible to use store and get operations, the final version is far from being finished.

Please note that the example (test.html) is using the public key to test the signaling server from peer.js.

Credit goes to Andres Ledesma and Mikael Hogqvist.

Read the licence for furhter information.
