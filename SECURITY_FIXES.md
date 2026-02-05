# CoffeeChat: Security Fixes Implementation Guide

This document provides actionable code fixes for critical vulnerabilities identified in the security audit.

---

## 1. CRITICAL: Fix Unencrypted WebSocket (wss:// instead of ws://)

### Server Setup with TLS

**Install dependencies:**
```bash
npm install --save https
```

**Updated [server/src/main.ts](server/src/main.ts):**

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import https from 'https';
import { readFileSync } from 'fs';
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

// Load TLS certificates
// For development: use self-signed certs
// For production: use certificates from Let's Encrypt or similar
const tlsOptions = {
    cert: readFileSync('./certs/cert.pem'),
    key: readFileSync('./certs/key.pem')
};

// Create HTTPS server
const httpsServer = https.createServer(tlsOptions);

// Attach WebSocket server to HTTPS
const wss = new WebSocketServer({ 
    server: httpsServer,
    perMessageDeflate: false,
    maxPayload: 64 * 1024 // Limit to 64KB
});

console.log(`CoffeeCHAT WebSocket server is running on wss://localhost:${WSS_PORT}`);

// Add security headers
httpsServer.on('request', (req, res) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
});

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
            console.error('Invalid message format');
            return;
        }
        if (!messageObj.type) {
            console.error('Message type is missing');
            return;
        }

        const messageType = messageObj.type;
        switch (messageType) {
            case 'publickey':
                if (typeof messageObj.publicKey === 'string') {
                    ws.publicKey = messageObj.publicKey;
                }
                break;

            case 'keyexchange':
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
                        cws.send(JSON.stringify({
                            type: 'publickey',
                            fromID: ws.userID,
                            publicKey: messageObj.publicKey
                        }));

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
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Recipient not found or not connected'
                    }));
                }
                break;

            case 'chatmessage':
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
                        cws.send(JSON.stringify({
                            type: 'chatmessage',
                            encrypted: messageObj.encrypted,
                            fromID: ws.userID
                        }));
                        recipientFound = true;
                    }
                });

                if (!recipientFound) {
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
        console.log('Client disconnected');
    });
});

httpsServer.listen(WSS_PORT);
```

**Client Update [client/src/main.ts](client/src/main.ts):**

Change:
```typescript
this.ws = new WebSocket('ws://localhost:8080');
```

To:
```typescript
// Use wss for secure WebSocket
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const port = process.env.WSS_PORT || '8080';
this.ws = new WebSocket(`${protocol}://localhost:${port}`);
```

**Generate Self-Signed Certificates (for development):**

```bash
# Generate private key
openssl genrsa -out certs/key.pem 2048

# Generate certificate (valid for 365 days)
openssl req -new -x509 -key certs/key.pem -out certs/cert.pem -days 365 \
  -subj "/C=US/ST=State/L=City/O=CoffeeChat/CN=localhost"
```

---

## 2. CRITICAL: Fix Weak User ID Generation

**Replace [server/src/utils.ts](server/src/utils.ts):**

```typescript
import { randomBytes } from 'crypto';

export class Utils {
    /**
     * Generate cryptographically random user ID
     * Format: 32 hex characters from 16 random bytes
     */
    public generateID(): string {
        const randomBuf = randomBytes(16);
        return randomBuf.toString('hex');
    }
}
```

Result:
```
Old: "Alice", "Bob", "Charlie" (enumerable, guessable)
New: "a7f3c2b1e4d8f9a2c5e7b1d3f4a6c8e0" (32 random hex chars)
```

---

## 3. HIGH: Add Message Signing for Authentication

**Update [client/src/crypto.ts](client/src/crypto.ts):**

```typescript
/**
 * Cryptography utility for end-to-end encrypted messaging
 * Uses ECDH (P-256) for key exchange, AES-GCM for encryption, and ECDSA for signing
 */

export class CryptoManager {
  private keyPair: CryptoKeyPair | null = null;
  private signingKeyPair: CryptoKeyPair | null = null;
  private publicKeyCache: Map<string, CryptoKey> = new Map();
  private sharedSecretCache: Map<string, CryptoKey> = new Map();

  /**
   * Initialize crypto by generating ECDH and ECDSA key pairs
   */
  async initialize(): Promise<string> {
    // Generate ECDH key pair for encryption
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    // Generate ECDSA key pair for signing
    this.signingKeyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign', 'verify']
    );

    const encryptionKey = await this.exportPublicKey(this.keyPair.publicKey);
    const signingKey = await this.exportPublicKey(this.signingKeyPair.publicKey);

    // Return both public keys as JSON
    return JSON.stringify({
      encryption: encryptionKey,
      signing: signingKey
    });
  }

  /**
   * Sign an encrypted message
   */
  async signMessage(encryptedMessage: string): Promise<string> {
    if (!this.signingKeyPair) {
      throw new Error('Signing key not initialized');
    }

    const signature = await window.crypto.subtle.sign(
      'ECDSA',
      this.signingKeyPair.privateKey,
      new TextEncoder().encode(encryptedMessage)
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * Encrypt a message AND sign it
   */
  async encryptAndSign(contactID: string, plaintext: string): Promise<{
    encrypted: string;
    signature: string;
  }> {
    const encrypted = await this.encryptMessage(contactID, plaintext);
    const signature = await this.signMessage(encrypted);

    return { encrypted, signature };
  }

  /**
   * Verify and decrypt a signed message
   */
  async verifyAndDecrypt(contactID: string, encrypted: string, signature: string): Promise<string> {
    const publicKey = this.publicKeyCache.get(contactID);
    if (!publicKey) {
      throw new Error(`No public key for contact: ${contactID}`);
    }

    // Verify signature
    const signatureBytes = new Uint8Array(
      atob(signature)
        .split('')
        .map((c) => c.charCodeAt(0))
    );

    const isValid = await window.crypto.subtle.verify(
      'ECDSA',
      publicKey,
      signatureBytes,
      new TextEncoder().encode(encrypted)
    );

    if (!isValid) {
      throw new Error('Message signature is invalid - message may have been tampered with');
    }

    return this.decryptMessage(contactID, encrypted);
  }

  // ... rest of the existing methods (exportPublicKey, importPublicKey, etc.) remain the same
}
```

**Update client [main.ts](client/src/main.ts) to use signed messages:**

```typescript
// In sendMessage():
const { encrypted, signature } = await this.crypto.encryptAndSign(
    this.currentContactID,
    content
);

const message: ChatMessage = {
    type: 'chatmessage',
    encrypted: encrypted,
    signature: signature,
    toID: this.currentContactID,
    timestamp: Date.now(),
    nonce: crypto.randomUUID()
};

this.ws.send(JSON.stringify(message));

// In handleMessage() for received messages:
case 'chatmessage':
    try {
        const decryptedContent = await this.crypto.verifyAndDecrypt(
            data.fromID,
            data.encrypted,
            data.signature
        );
        // ... rest of handling
    } catch (error) {
        if (error.message.includes('signature')) {
            this.addSystemMessage(`❌ Message signature invalid from ${data.fromID} - possible tampering`);
        } else {
            this.addSystemMessage(`Failed to decrypt message from ${data.fromID}`);
        }
    }
```

---

## 4. HIGH: Key Fingerprint Verification

**Add to [client/src/crypto.ts](client/src/crypto.ts):**

```typescript
/**
 * Get fingerprint of contact's public key for manual verification
 */
async getPublicKeyFingerprint(contactID: string): Promise<string> {
    const publicKey = this.publicKeyCache.get(contactID);
    if (!publicKey) {
        return 'No key received yet';
    }

    // Export key to get the raw bytes
    const exported = await window.crypto.subtle.exportKey('spki', publicKey);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', exported);
    
    // Convert to hex and take first 16 characters = 8 bytes = 64 bits
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fingerprint = hashArray
        .slice(0, 8)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();

    return fingerprint;
}
```

**Update client UI in [main.ts](client/src/main.ts):**

```typescript
private async updateChatHeader() {
    if (!this.currentContactID) {
        // ... existing code
    }

    const contact = this.contacts.get(this.currentContactID);
    const isEncrypted = this.crypto.hasPublicKey(this.currentContactID);

    if (isEncrypted) {
        const fingerprint = await this.crypto.getPublicKeyFingerprint(this.currentContactID);
        this.currentChatInfo.innerHTML = `
            <div>
                <div class="chat-title">${this.currentContactID}</div>
                <div class="chat-fingerprint">
                    🔐 Fingerprint: <code>${fingerprint}</code>
                    <span class="fingerprint-help" title="Verify this with your contact out-of-band">?</span>
                </div>
            </div>
        `;
    } else {
        this.currentChatInfo.innerHTML = `
            <div>
                <div class="chat-title">${this.currentContactID}</div>
                <div class="chat-fingerprint">Waiting for key exchange...</div>
            </div>
        `;
    }
}
```

---

## 5. HIGH: Input Validation

**Add validation functions to [server/src/main.ts](server/src/main.ts):**

```typescript
/**
 * Validate public key format
 */
const validatePublicKey = (key: any): boolean => {
    if (typeof key !== 'string') return false;
    // Base64 check
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(key)) return false;
    // P-256 public keys are ~88 characters when base64 encoded
    if (key.length < 80 || key.length > 200) return false;
    return true;
};

/**
 * Validate user ID format
 */
const validateUserID = (id: any): boolean => {
    if (typeof id !== 'string') return false;
    if (id.length < 4 || id.length > 64) return false;
    // Alphanumeric + dash only (matches our hex ID generation)
    if (!/^[a-f0-9-]+$/i.test(id)) return false;
    return true;
};

/**
 * Validate encrypted message
 */
const validateEncrypted = (encrypted: any): boolean => {
    if (typeof encrypted !== 'string') return false;
    // Base64 check
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encrypted)) return false;
    // Encrypted messages should be at least 28 bytes (12 IV + 16 auth tag)
    // Base64 encoded that's at least 38 characters
    if (encrypted.length < 38 || encrypted.length > 100000) return false;
    return true;
};

// Use in message handler:
case 'publickey':
    if (!validatePublicKey(messageObj.publicKey)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid public key format'
        }));
        return;
    }
    ws.publicKey = messageObj.publicKey;
    break;

case 'keyexchange':
    if (!validateUserID(messageObj.toID)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid recipient user ID'
        }));
        return;
    }
    if (!validatePublicKey(messageObj.publicKey)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid public key format'
        }));
        return;
    }
    // ... rest of handler

case 'chatmessage':
    if (!validateUserID(messageObj.toID)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid recipient user ID'
        }));
        return;
    }
    if (!validateEncrypted(messageObj.encrypted)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid encrypted message format'
        }));
        return;
    }
    // ... rest of handler
```

---

## 6. HIGH: Rate Limiting

**Install dependency:**
```bash
npm install limiter
npm install --save-dev @types/limiter
```

**Add to [server/src/main.ts](server/src/main.ts):**

```typescript
import { RateLimiter } from 'limiter';

const MAX_MESSAGES_PER_SECOND = 5;
const rateLimiters = new Map<string, RateLimiter>();

wss.on('connection', (ws: CustomWebSocket) => {
    const userID = utils.generateID();
    ws.userID = userID;
    
    // Create rate limiter for this user
    const limiter = new RateLimiter({
        tokensPerInterval: MAX_MESSAGES_PER_SECOND,
        interval: 'second'
    });
    rateLimiters.set(userID, limiter);

    ws.send(JSON.stringify({ type: 'welcome', userID: userID }));

    ws.on('message', async (messageStr) => {
        // Rate limit check
        const remaining = await limiter.removeTokens(1);
        if (remaining < 0) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Rate limited - too many messages'
            }));
            return;
        }

        // ... rest of message handling
    });

    ws.on('close', () => {
        rateLimiters.delete(userID);
    });
});
```

---

## 7. HIGH: Timestamp and Replay Protection

**Add to [client/src/main.ts](client/src/main.ts):**

```typescript
private recentNonces: Set<string> = new Set();
private readonly NONCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

private async sendMessage() {
    // ... existing validation ...

    try {
        const encrypted = await this.crypto.encryptMessage(this.currentContactID, content);

        const message: ChatMessage = {
            type: 'chatmessage',
            encrypted: encrypted,
            toID: this.currentContactID,
            timestamp: Date.now(),
            nonce: crypto.randomUUID()
        };

        this.ws.send(JSON.stringify(message));
        // ... rest of send logic
    }
}

private async handleChatMessage(data: ChatMessage) {
    // Validate timestamp
    const now = Date.now();
    if (!data.timestamp || (now - data.timestamp) > this.NONCE_WINDOW_MS) {
        this.addSystemMessage('⚠️ Message timestamp invalid - possible replay');
        return;
    }

    // Check for replay
    if (!data.nonce || this.recentNonces.has(data.nonce)) {
        this.addSystemMessage('⚠️ Duplicate message detected - possible replay attack');
        return;
    }

    this.recentNonces.add(data.nonce);

    // Auto-cleanup old nonces every ~100 messages
    if (this.recentNonces.size > 200) {
        this.cleanupNonces();
    }

    // Handle the message
    try {
        const decrypted = await this.crypto.verifyAndDecrypt(
            data.fromID,
            data.encrypted,
            data.signature
        );
        // ... rest of handling
    }
}

private cleanupNonces() {
    // In production, implement proper timestamp-based cleanup
    this.recentNonces.clear();
}
```

---

## 8. MEDIUM: Disable Console Logging in Production

**Create [server/src/logger.ts](server/src/logger.ts):**

```typescript
export class Logger {
    private isDev = process.env.NODE_ENV === 'development';

    log(msg: string) {
        if (this.isDev) {
            console.log(`[LOG] ${msg}`);
        }
    }

    warn(msg: string) {
        if (this.isDev) {
            console.warn(`[WARN] ${msg}`);
        }
        // In production, send to secure logging service
    }

    error(msg: string, shouldExpose: boolean = false) {
        if (this.isDev) {
            console.error(`[ERROR] ${msg}`);
        }
        // Never expose detailed errors in production
        if (shouldExpose) {
            // Send to monitoring service
        }
    }
}
```

Use in [server/src/main.ts](server/src/main.ts):

```typescript
import { Logger } from './logger.js';

const logger = new Logger();

// Instead of:
console.error('Invalid message format', e);

// Use:
logger.error('Invalid message format received', false);
```

---

## Implementation Checklist

- [ ] **TLS/WSS** - Update server to use HTTPS + WSS
- [ ] **User ID** - Generate random 32-char hex IDs
- [ ] **Message Signing** - Implement ECDSA signing
- [ ] **Fingerprints** - Display public key fingerprints for manual verification
- [ ] **Input Validation** - Validate all message fields
- [ ] **Rate Limiting** - Prevent DoS with message throttling
- [ ] **Timestamp/Replay** - Add timestamp and nonce validation
- [ ] **Logging** - Disable sensitive logging in production

---

## Testing the Fixes

```bash
# Test TLS
openssl s_client -connect localhost:8080 -tls1_2

# Test rate limiting (should reject after 5 messages/sec)
for i in {1..10}; do
  echo '{"type":"chatmessage","encrypted":"test","toID":"abc"}' | timeout 1 node client
done

# Test invalid input
echo '{"type":"publickey","publicKey":"invalid!!!"}' | websocat wss://localhost:8080
```

---

## Database Consideration (Future)

Currently, messages and keys are NOT persisted. For future versions:

```typescript
// Optional: Encrypted message history
interface StoredMessage {
    id: string;
    contactID: string;
    encrypted: string;
    signature: string;
    timestamp: number;
}

// Store encrypted in IndexedDB
async storeMessage(msg: StoredMessage) {
    const db = await this.openDB();
    const tx = db.transaction(['messages'], 'readwrite');
    await tx.objectStore('messages').add(msg);
}
```

Keys and sensitive data should NEVER be persisted unencrypted.
