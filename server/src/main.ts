/**
 * CoffeeChat Server - WebSocket Relay with TLS
 * Refactored with service-oriented architecture for scalability
 */

import https from 'https';
import { readFileSync } from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Utils } from './utils.js';
import { ConnectionManager } from './services/ConnectionManager.js';
import { KeyExchangeService } from './services/KeyExchangeService.js';
import { MessageRouter } from './services/MessageRouter.js';
import { GroupRouter } from './services/GroupRouter.js';
import { MessageValidator } from './validators/MessageValidator.js';
import type { CustomWebSocket, ServerMessage } from './types/index.js';

const WSS_PORT = parseInt(process.env.WSS_PORT ?? '8080', 10);

// Load TLS certificates
const tlsOptions = {
    cert: readFileSync('./certs/cert.pem'),
    key: readFileSync('./certs/key.pem')
};

// Create HTTPS server with TLS
const httpsServer = https.createServer(tlsOptions);

// Create WebSocket server with security options
const wss = new WebSocketServer({
    server: httpsServer,
    perMessageDeflate: false, // Disable compression bombs
    maxPayload: 16 * 1024 * 1024,  // Limit message size to 16MB (for encrypted images with base64 overhead)
});

// Initialize services
const utils = new Utils();
const connectionManager = new ConnectionManager();
const keyExchangeService = new KeyExchangeService(connectionManager);
const messageRouter = new MessageRouter(connectionManager);
const groupRouter = new GroupRouter(connectionManager);

console.log(`CoffeeCHAT WebSocket server is running on wss://localhost:${WSS_PORT}`);

// Basic rate limiting (token bucket)
const RATE_LIMIT_TOKENS = 10;
const RATE_LIMIT_INTERVAL_MS = 10_000;
const rateLimiters = new WeakMap<CustomWebSocket, { tokens: number; lastRefill: number }>();

function checkRateLimit(ws: CustomWebSocket): boolean {
    const now = Date.now();
    const state = rateLimiters.get(ws);
    if (!state) {
        rateLimiters.set(ws, { tokens: RATE_LIMIT_TOKENS - 1, lastRefill: now });
        return true;
    }

    const elapsed = now - state.lastRefill;
    if (elapsed >= RATE_LIMIT_INTERVAL_MS) {
        state.tokens = RATE_LIMIT_TOKENS;
        state.lastRefill = now;
    }

    if (state.tokens <= 0) {
        return false;
    }

    state.tokens -= 1;
    return true;
}

/**
 * Handle new WebSocket connection
 */
wss.on('connection', (ws: CustomWebSocket) => {
    // Generate unique ID for this user
    const userID = utils.generateUniqueID((id) => connectionManager.isUserConnected(id));
    
    // Register connection
    connectionManager.registerConnection(ws, userID);
    rateLimiters.set(ws, { tokens: RATE_LIMIT_TOKENS, lastRefill: Date.now() });
    
    // Send welcome message
    ws.send(JSON.stringify({ type: 'welcome', userID }));

    // Connection timeout handling (heartbeat)
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    const pingInterval = setInterval(() => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    }, 30_000);

    /**
     * Handle incoming messages
     */
    ws.on('message', (messageStr: any) => {
        if (!checkRateLimit(ws)) {
            sendError(ws, 'Rate limited');
            return;
        }

        let messageObj: ServerMessage;
        
        // Parse message
        try {
            messageObj = JSON.parse(messageStr.toString());
        } catch (e) {
            return; // Silently ignore malformed messages
        }
        
        if (!messageObj.type) {
            return; // Silently ignore messages without type
        }

        const messageType = messageObj.type;
          // Route message to appropriate handler
        switch (messageType) {
            case 'publickey':
                handlePublicKey(ws, messageObj);
                break;

            case 'keyexchange':
                handleKeyExchange(ws, messageObj);
                break;

            case 'chatmessage':
                handleChatMessage(ws, messageObj);
                break;

            case 'setusername':
                handleSetUsername(ws, messageObj);
                break;            case 'finduser':
                handleFindUser(ws, messageObj);
                break;

            case 'creategroup':
                handleCreateGroup(ws, messageObj);
                break;

            case 'groupmessage':
                handleGroupMessage(ws, messageObj);
                break;

            default:
                // Unknown message type - silently ignore
                break;
        }
    });    /**
     * Handle connection close
     */
    ws.on('close', () => {
        clearInterval(pingInterval);
        if (ws.userID) {
            connectionManager.unregisterConnection(ws.userID);
        }
    });

    /**
     * Handle WebSocket errors (e.g., payload too large)
     */
    ws.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') {
            sendError(ws, 'Message too large. Max size is 10MB.');
        } else {
            console.error(`WebSocket error for ${ws.userID}:`, error.message);
        }
        // Don't crash - let the close handler clean up
    });
});

/**
 * Handle public key storage
 */
function handlePublicKey(ws: CustomWebSocket, message: ServerMessage): void {
    if (!ws.userID) {
        sendError(ws, 'Sender user ID is missing');
        return;
    }

    if (!MessageValidator.validatePublicKey(message.publicKey)) {
        sendError(ws, 'Invalid public key format');
        return;
    }

    keyExchangeService.storePublicKey(ws.userID, message.publicKey);
}

/**
 * Handle key exchange request
 */
function handleKeyExchange(ws: CustomWebSocket, message: ServerMessage): void {
    // Validate inputs
    if (!MessageValidator.validateUserID(message.toID)) {
        sendError(ws, 'Invalid recipient ID');
        return;
    }
    
    if (!MessageValidator.validatePublicKey(message.publicKey)) {
        sendError(ws, 'Invalid public key format');
        return;
    }
    
    if (!ws.userID) {
        sendError(ws, 'Sender user ID is missing');
        return;
    }

    // Process key exchange
    keyExchangeService.handleKeyExchange(ws, message.toID, message.publicKey);
}

/**
 * Handle encrypted chat message
 */
function handleChatMessage(ws: CustomWebSocket, message: ServerMessage): void {
    // Validate inputs
    if (!MessageValidator.validateUserID(message.toID)) {
        sendError(ws, 'Invalid recipient ID');
        return;
    }
    
    if (!MessageValidator.validateEncryptedMessage(message.encrypted)) {
        sendError(ws, 'Invalid message format');
        return;
    }
    
    if (message.signature && !MessageValidator.validateSignature(message.signature)) {
        sendError(ws, 'Invalid signature format');
        return;
    }
    
    if (!ws.userID) {
        sendError(ws, 'Sender user ID is missing');
        return;
    }

    // Route message to recipient
    messageRouter.routeMessage(ws, message.toID, message.encrypted!, message.signature);
}

/**
 * Send error message to client
 */
function sendError(ws: CustomWebSocket, message: string): void {
    ws.send(JSON.stringify({
        type: 'error',
        message
    }));
}

/**
 * Handle setting username hash (privacy-preserving - server never sees actual username)
 */
function handleSetUsername(ws: CustomWebSocket, message: ServerMessage): void {
    if (!ws.userID) {
        sendError(ws, 'User ID is missing');
        return;
    }

    if (!MessageValidator.validateUsernameHash(message.usernameHash)) {
        sendError(ws, 'Invalid username hash format');
        return;
    }

    connectionManager.storeUsernameHash(ws.userID, message.usernameHash);
    
    // Confirm username hash was set
    ws.send(JSON.stringify({
        type: 'usernameSet',
        usernameHash: message.usernameHash
    }));
}

/**
 * Handle finding user by username hash
 */
function handleFindUser(ws: CustomWebSocket, message: ServerMessage): void {
    if (!MessageValidator.validateUsernameHash(message.usernameHash)) {
        sendError(ws, 'Invalid username hash format');
        return;
    }

    const userID = connectionManager.findUserByUsernameHash(message.usernameHash);
    
    ws.send(JSON.stringify({
        type: 'userFound',
        usernameHash: message.usernameHash,
        userID: userID || null  // null if not found
    }));
}

/**
 * Handle group creation - route to all members
 */
function handleCreateGroup(ws: CustomWebSocket, message: ServerMessage): void {
    if (!ws.userID) {
        sendError(ws, 'User ID is missing');
        return;
    }

    if (!message.groupID || typeof message.groupID !== 'string' || message.groupID.length < 10) {
        sendError(ws, 'Invalid group ID');
        return;
    }

    if (!message.groupName || typeof message.groupName !== 'string' || message.groupName.length < 1) {
        sendError(ws, 'Invalid group name');
        return;
    }

    if (!Array.isArray(message.memberIDs) || message.memberIDs.length < 2) {
        sendError(ws, 'Group must have at least 2 members');
        return;
    }

    // Validate all member IDs
    for (const memberID of message.memberIDs) {
        if (!MessageValidator.validateUserID(memberID)) {
            sendError(ws, 'Invalid member ID');
            return;
        }
    }

    // Route group creation to all members
    groupRouter.routeGroupCreation(
        ws,
        message.groupID,
        message.groupName,
        message.memberIDs,
        ws.userID
    );
}

/**
 * Handle group message - route encrypted payloads to recipients
 */
function handleGroupMessage(ws: CustomWebSocket, message: ServerMessage): void {
    if (!ws.userID) {
        sendError(ws, 'User ID is missing');
        return;
    }

    if (!message.groupID || typeof message.groupID !== 'string') {
        sendError(ws, 'Invalid group ID');
        return;
    }

    if (!Array.isArray(message.encryptedPayloads) || message.encryptedPayloads.length === 0) {
        sendError(ws, 'Invalid encrypted payloads');
        return;
    }

    // Validate each payload
    for (const payload of message.encryptedPayloads) {
        if (!MessageValidator.validateUserID(payload.toID)) {
            sendError(ws, 'Invalid recipient ID in payload');
            return;
        }
        if (!MessageValidator.validateEncryptedMessage(payload.encrypted)) {
            sendError(ws, 'Invalid encrypted message in payload');
            return;
        }
        if (!MessageValidator.validateSignature(payload.signature)) {
            sendError(ws, 'Invalid signature in payload');
            return;
        }
    }

    // Route to all recipients
    groupRouter.routeGroupMessage(ws, message.groupID, message.encryptedPayloads);
}

// Start server
httpsServer.listen(WSS_PORT);
