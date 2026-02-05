import { WebSocketServer, WebSocket } from 'ws';
import https from 'https';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Utils } from './utils.js';
import type { VerifyClientCallbackAsync } from 'ws';

interface CustomWebSocket extends WebSocket {
    userID?: string;
    publicKey?: string;
}

interface ServerMessage {
    type: string;
    content?: string;
    encrypted?: string;
    signature?: string;
    fromID?: string;
    toID?: string;
    publicKey?: string;
    userID?: string;
}

let utils: Utils = new Utils();

const WSS_PORT = Number(process.env.WSS_PORT ?? 8080);
const ALLOWED_ORIGINS = new Set(
    (process.env.WS_ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map((origin) => origin.trim())
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const certDir = join(__dirname, '../../certs');

const tlsOptions = {
    cert: readFileSync(join(certDir, 'cert.pem')),
    key: readFileSync(join(certDir, 'key.pem'))
};

const httpsServer = https.createServer(tlsOptions);

const wss = new WebSocketServer({
    server: httpsServer,
    perMessageDeflate: false,
    maxPayload: 64 * 1024,
    verifyClient: (info: Parameters<VerifyClientCallbackAsync>[0]) => {
        const origin = info.req.headers.origin;
        if (!origin) {
            return true;
        }
        return ALLOWED_ORIGINS.has(origin);
    }
});

console.log(`CoffeeCHAT WebSocket server is running on wss://localhost:${WSS_PORT}`);


wss.on('connection', (ws: CustomWebSocket) => {
    // Generate unique ID for this user
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
                const relayKey = messageObj.publicKey as string;
                wss.clients.forEach((client) => {
                    const cws = client as CustomWebSocket;
                    if (cws.readyState === WebSocket.OPEN && cws.userID === messageObj.toID) {
                        // Send requester's public key to recipient
                        cws.send(JSON.stringify({
                            type: 'publickey',
                            fromID: ws.userID,
                            publicKey: relayKey
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
                        // Relay encrypted message with signature (if present) without decrypting
                        const relayMessage: any = {
                            type: 'chatmessage',
                            encrypted: messageObj.encrypted,
                            fromID: ws.userID
                        };
                        if (messageObj.signature) {
                            relayMessage.signature = messageObj.signature;
                        }
                        cws.send(JSON.stringify(relayMessage));
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
                // Unknown message type - silently ignore
                break;
        }
    });

    ws.on('close', () => {
        // Client disconnected - no logging for privacy
    });
});

httpsServer.listen(WSS_PORT);

