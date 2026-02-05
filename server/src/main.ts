import { WebSocketServer, WebSocket } from 'ws';
import { Utils } from './utils.js';

interface CustomWebSocket extends WebSocket {
    userID?: string;
    publicKey?: string;
}

interface ServerMessage {
    type: string;
    content?: string;
    encrypted?: string;
    fromID?: string;
    toID?: string;
    publicKey?: string;
    userID?: string;
}

let utils: Utils = new Utils();

const WSS_PORT = 8080;

const wss = new WebSocketServer({ port: WSS_PORT });

console.log(`CoffeeCHAT WebSocket server is running on ws://localhost:${WSS_PORT}`);


wss.on('connection', (ws: CustomWebSocket) => {
    console.log('New connection');

    const userID = utils.generateID();
    ws.send(JSON.stringify({ type: 'welcome', userID: userID }));
    ws.userID = userID;

    ws.on('message', (messageStr) => {
        let messageObj: ServerMessage;
        try {
            messageObj = JSON.parse(messageStr.toString());
        } catch (e) {
            console.error('Invalid message format', e);
            return;
        }
        if (!messageObj.type) {
            console.error('Message type is missing');
            return;
        }

        const messageType = messageObj.type;
        switch (messageType) {
            case 'publickey':
                // Store user's public key
                if (typeof messageObj.publicKey === 'string') {
                    ws.publicKey = messageObj.publicKey;
                }
                break;

            case 'keyexchange':
                // Relay public key exchange between users
                if (typeof messageObj.toID !== 'string' || typeof messageObj.publicKey !== 'string') {
                    console.error('Invalid keyexchange structure');
                    return;
                }
                if (!ws.userID) {
                    console.error('Sender userID is missing');
                    return;
                }

                let keyExchangeComplete = false;
                wss.clients.forEach((client) => {
                    const cws = client as CustomWebSocket;
                    if (cws.readyState === WebSocket.OPEN && cws.userID === messageObj.toID) {
                        // Send requester's public key to recipient
                        cws.send(JSON.stringify({
                            type: 'publickey',
                            fromID: ws.userID,
                            publicKey: messageObj.publicKey
                        }));

                        // If recipient has a public key, send it back
                        if (cws.publicKey) {
                            ws.send(JSON.stringify({
                                type: 'publickey',
                                fromID: cws.userID,
                                publicKey: cws.publicKey
                            }));
                        }
                        keyExchangeComplete = true;
                    }
                });

                if (!keyExchangeComplete) {
                    console.error('Key exchange recipient not found');
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Recipient not found or not connected'
                    }));
                }
                break;

            case 'chatmessage':
                // Relay encrypted messages (server cannot read them)
                if (typeof messageObj.encrypted !== 'string' || typeof messageObj.toID !== 'string') {
                    console.error('Invalid encrypted message structure');
                    return;
                }
                if (!ws.userID) {
                    console.error('Sender userID is missing');
                    return;
                }

                let recipientFound = false;
                wss.clients.forEach((client) => {
                    const cws = client as CustomWebSocket;
                    if (cws.readyState === WebSocket.OPEN && cws.userID === messageObj.toID) {
                        // Relay encrypted message without decrypting
                        cws.send(JSON.stringify({
                            type: 'chatmessage',
                            encrypted: messageObj.encrypted,
                            fromID: ws.userID
                        }));
                        recipientFound = true;
                    }
                });

                if (!recipientFound) {
                    console.error('Recipient not found');
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Recipient not found or not connected'
                    }));
                }
                break;

            default:
                console.error('Unknown message type:', messageType);
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected`);
    });
});

