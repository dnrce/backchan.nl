var should = require('should'),
    server = require('../lib/server.js'),
    client = require('../static/js/client.js'),
    model = require('../lib/server-model.js');
   

var curServer, curClient;

describe('client-server communication', function(){

    describe('client', function(done){
        beforeEach(function(done) {
            curServer = new server.BackchannlServer();
            curServer.bind("started", done);
            curServer.start("localhost", 8181);
        });
        afterEach(function(done) {
            curServer.bind("stopped", done);
            curServer.stop();
        });


        it('should handle identify commands', function(done) {
            
            var cm = new client.ConnectionManager();
            
            cm.bind("state.CONNECTED", function() {
                cm.identify("Test User", "Test Affiliation");
            });
            
            cm.bind("state.IDENTIFIED", function() {
                
                should.exist(cm.user);
                cm.user.get("name").should.equal("Test User");
                cm.user.get("affiliation").should
                     .equal("Test Affiliation");
                
                cm.disconnect();
                setTimeout(done, 0);
            });
            cm.connect("localhost", 8181);
        });
        
        
        it('should connect properly', function(done){
                // Once the server has started, make a client.
                var cm = new client.ConnectionManager();
                
                cm.bind("state.CONNECTED", function() {
                    cm.disconnect();
                    done();
                });
                cm.connect("localhost", 8181);
        });
    });
    
    describe('server', function(){
        describe('connect process', function(){
            beforeEach(function(done) {
                curServer = new server.BackchannlServer();
                curServer.bind("started", done);
                curServer.start("localhost", 8181);
            });
            afterEach(function(done) {
                curServer.bind("stopped", done);
                curServer.stop();
            });
            
           it('should count connected users properly', function(done){
                var c = new client.ConnectionManager();

                curServer.allUsers.numConnectedUsers().should.equal(0);

                c.bind("state.IDENTIFIED", function() {
                    curServer.allUsers.numConnectedUsers().should.equal(1);

                    curServer.bind("client.disconnected", function() {
                        curServer.allUsers.numConnectedUsers().should.equal(0);
                        setTimeout(done(), 50);
                    });
                    c.disconnect();
                });

                c.connect("localhost", 8181, {"auto-identify":true});
            });
        });
        
        
        describe('join process', function(){
            beforeEach(function(done) {
                curServer = new server.BackchannlServer({"test-event":true});
                curServer.bind("started", function() {
                    curClient = new client.ConnectionManager();
                    curClient.bind("state.CONNECTED", done);
                    curClient.connect("localhost", 8181);
                });
                curServer.start("localhost", 8181);
            });
            afterEach(function(done) {
                curServer.bind("stopped", done);
                curServer.stop();
            });

            it('should reject joins from users who haven\'t identified yet',
                function(done) {
                    curClient.bind("message.join-err", function() {
                        done();
                    });

                    curClient.bind("message.join-ok", function() {
                        should.fail("Received a join-ok message for a client that joined before identifying.");
                    });

                    curClient.join(0);
            });
            
            it('should reject malformed join requests (string)', function(done) {
                curClient.bind("state.IDENTIFIED", function() {
                    // send some bad join requests
                    curClient.join("foo");
                });
                
                curClient.bind("message.join-err", function() {
                    done();
                });
                
                curClient.bind("message.join-ok", function() {
                   should.fail("Received a join-ok message when it should fail.") ;
                });
                
                curClient.identify("Test", "Test");
            });

            it('should reject malformed join requests (bad id)', function(done) {
                curClient.bind("state.IDENTIFIED", function() {
                    // send some bad join requests
                    curClient.join(7);
                });
                
                curClient.bind("message.join-err", function() {
                    done();
                });
                
                curClient.bind("message.join-ok", function() {
                   should.fail("Received a join-ok message when it should fail.") ;
                });
                
                curClient.identify("Test", "Test");
            });
            
            it('should accept proper join requests', function(done) {
                curClient.bind("state.IDENTIFIED", function() {
                    curClient.join(0);
                });
                
                curClient.bind("message.join-err", function() {
                    should.fail("Shouldn't get a join-err message.");
                });
                
                curClient.bind("message.join-ok", function() {
                    curServer.events.get(0).get("users").length.should.equal(1);
                    curServer.allUsers.get(0).get("inEvent").should.equal(0);
                    curServer.allUsers.get(0).isInEvent().should.be.true;
                    done();
                });
                
                curClient.identify("Test", "Test");
            });
            
            it('should receive messages on the right channel', function(done){
                curClient.bind("state.IDENTIFIED", function() {
                    curClient.join(0);
                });
                
                curClient.bind("message.join-err", function() {
                    should.fail("Shouldn't get a join-err message.");
                });
                
                curClient.bind("message.join-ok", function() {
                    // Now have the server send a message to that channel.
                    curServer.io.sockets.in(
                        curServer.events.get(0).getChannel())
                        .emit("test");
                });
                
                curClient.bind("message.test", function() {
                    done();
                })
                
                curClient.identify("Test", "Test");
            });
            
            
            it('should not receive messages on other channels', function(done) {
                curClient.bind("state.IDENTIFIED", function() {
                    curClient.join(0);
                });
                
                curClient.bind("message.join-err", function() {
                    should.fail("Shouldn't get a join-err message.");
                });
                
                curClient.bind("message.join-ok", function() {
                    // Send a message to some other channel. We shouldn't
                    // receive anything.
                    curServer.io.sockets.in("foo").emit("test");
                    
                    // Wait 100ms and then pass the test - if the server
                    // was going to actually send us the wrong thing, it would
                    // have done it by then.
                    setTimeout(done, 100);
                });
                
                curClient.bind("messages.test", function() {
                    should.fail("Should not have received this message");
                })
                
                curClient.identify("Test", "Test");
                
            });
            
            it('should remove users from the event when they disconnect', 
                function(done) {
                    curClient.bind("state.IDENTIFIED", function() {
                        curClient.join(0);
                    });
                    
                    curClient.bind("message.join-err", function() {
                        should.fail("Shouldn't get a join-err message.");
                    });
                    
                    curClient.bind("message.join-ok", function() {
                        // Now disconnect.
                        curClient.disconnect();
                        
                        setTimeout(function() {
                            curServer.events.get(0).get("users")
                                .length.should.equal(0);
                            
                            curServer.allUsers.get(0).isInEvent().should.be.false;
                            done();
                        }, 200);
                        // After disconnecting, poke at the server to see if
                        // the user was removed from the event properly.
                    });

                    curClient.identify("Test", "Test");
            });

            it('should remove users when they send a \'leave\' command');
            it('should properly move users from one event to another if they try to join a new event', 
                function(done) {
                    curClient.bind("state.IDENTIFIED", function() {
                        curClient.join(0);
                    });
                    
                    curClient.bind("message.join-err", function() {
                        should.fail("Shouldn't get a join-err message.");
                    });
                    
                    var secondJoin = false;
                    
                    curClient.bind("message.join-ok", function() {
                        
                        if(!secondJoin) {
                            // Now create a new event, and have the client join
                            // that one.
                        
                            curClient.join(1);
                            secondJoin = true;
                        } else {
                            
                            // Make sure we left one and joined the other.
                            curServer.events.get(0).get("users").length.should.equal(0);
                            curServer.events.get(1).get("users").length.should.equal(1);
                            
                            curServer.allUsers.get(0).get("inEvent").should.equal(1);
                            done();
                        }
                    });
                    
                    curServer.events.add(new model.ServerEvent());

                    curClient.identify("Test", "Test");
                });
        });
    });
});