# CoffeeChat Security Audit Report
**Date:** February 5, 2026  
**Application:** CoffeeChat - End-to-End Encrypted Messaging  
**Audit Scope:** Architecture, cryptography, privacy, server trustlessness

---

## Executive Summary

CoffeeChat implements a fundamentally sound trustless architecture with **client-side end-to-end encryption**, making the server blind to message content. However, several **critical security vulnerabilities** and privacy concerns exist that could compromise user safety, message integrity, and protection against advanced attacks.

**Risk Level:** **MODERATE-HIGH** for production use

---

## Architecture Overview

### What Works Well ✅

**1. Trustless Server Design**
- Server **cannot decrypt messages** - only relays encrypted payloads
- No plaintext data stored on server
- Server has zero knowledge of message content
- Truly peer-to-peer encryption model (after ECDH key exchange)

**2. Cryptographic Foundation**
- **ECDH (P-256):** Industry-standard ephemeral key exchange
- **AES-GCM-256:** Authenticated encryption with 128-bit authentication tags
- Derives unique symmetric keys per contact pair
- GCM provides AEAD (authenticated encryption with associated data)

**3. Client-Side Implementation**
- Key generation happens locally, not transmitted to server
- Shared secrets never leave the client
- No key material logged or exposed to server

---

## Critical Security Issues 🔴

### 1. **Unencrypted WebSocket Transport (CRITICAL)**

**Problem:**
```typescript
// Client: ws://localhost:8080
this.ws = new WebSocket('ws://localhost:8080');
```

- **No TLS/SSL tunnel** - all traffic (including public keys) visible in plaintext
- Network eavesdroppers can see:
  - User IDs
  - Public key material
  - Encrypted messages (metadata leakage)
  - Connection timing/patterns

**Impact:** 
- Man-in-the-middle (MITM) attacks possible
- Passive network monitoring exposes communication graph
- Public keys interceptable before encryption

**Recommendation:**
```typescript
this.ws = new WebSocket('wss://localhost:8080'); // Use TLS
```

**Server-side (main.ts):**
```typescript
import https from 'https';
import { readFileSync } from 'fs';

const tls_options = {
  cert: readFileSync('path/to/cert.pem'),
  key: readFileSync('path/to/key.pem')
};

const server = https.createServer(tls_options);
const wss = new WebSocketServer({ server });
server.listen(8080);
```

---

### 2. **Weak User ID Generation (CRITICAL)**

**Problem:**
```typescript
// server/src/utils.ts
public generateID(): string {
    return this.names[Math.floor(Math.random() * this.names.length)]!;
}
```

- IDs are **common English names** from finite list
- Not cryptographically random
- Predictable and enumerable
- Collision probability increases with users
- No uniqueness guarantee

**Security Impact:**
- **ID enumeration attacks:** Attackers can guess valid user IDs
- **Targeted attacks:** Knowing someone's name helps discover their ID
- **Reduced anonymity:** Names reveal demographic information
- **Message injection:** With predictable IDs, easier to spoof senders

**Attack Scenario:**
```
Attacker sees user "Alice" → guesses ID might be "alice", "Alice", or common names
Scans known names.txt → finds matches
Connects as multiple IDs → floods victim with messages
```

**Recommendation:**
```typescript
public generateID(): string {
    // Cryptographically random 32-character hex string
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Result: "a7f3c2b1e4d8f9a2c5e7b1d3f4a6c8e0"
```

---

### 3. **No Message Authentication at Transport Layer (HIGH)**

**Problem:**
- Encrypted payload is sent but **no signature** authenticates the sender
- Server relays messages without verification

**Current Flow:**
```typescript
// Server: no way to verify message came from claimed sender
const message = {
    type: 'chatmessage',
    encrypted: messageObj.encrypted,      // Unverified
    fromID: ws.userID                      // Unverified - from connection, not message
};
```

**Attack:**
```javascript
// Attacker could:
1. Intercept connection metadata
2. Spoof fromID in different message
3. Replay old encrypted messages
4. Create false "from" attribution
```

**Recommendation:**
Implement message signing with client's private key:
```typescript
// Client: Sign message with private key
async encryptAndSign(contactID: string, plaintext: string): Promise<{encrypted: string, signature: string}> {
    const encrypted = await this.encryptMessage(contactID, plaintext);
    
    const signature = await crypto.subtle.sign(
        'ECDSA',
        this.keyPair.privateKey,
        new TextEncoder().encode(encrypted)
    );
    
    return {
        encrypted,
        signature: btoa(String.fromCharCode(...new Uint8Array(signature)))
    };
}

// Recipient verifies signature
async decryptAndVerify(fromID: string, encrypted: string, signature: string): Promise<string> {
    const publicKey = this.publicKeyCache.get(fromID);
    
    const isValid = await crypto.subtle.verify(
        'ECDSA',
        publicKey,
        new Uint8Array(atob(signature).split('').map(c => c.charCodeAt(0))),
        new TextEncoder().encode(encrypted)
    );
    
    if (!isValid) throw new Error('Message signature invalid');
    
    return this.decryptMessage(fromID, encrypted);
}
```

---

### 4. **Man-in-the-Middle on Key Exchange (HIGH)**

**Problem:**
```typescript
// Server relays public keys without verification
case 'keyexchange':
    cws.send(JSON.stringify({
        type: 'publickey',
        fromID: ws.userID,              // ⚠️ Just the connection ID
        publicKey: messageObj.publicKey // ⚠️ No authentication
    }));
```

**Attack Scenario:**
```
1. Alice requests Bob's public key
2. Attacker intercepts → sends their own public key instead
3. Alice encrypts to attacker's key (thinking it's Bob)
4. Attacker decrypts, re-encrypts to Bob, relays message
5. Complete message compromise while both parties think conversation is secure
```

This is a classic **MITM attack** enabled by unauthenticated key exchange.

**Recommendation:**
Implement **out-of-band verification** (manual fingerprint verification):
```typescript
// Show fingerprint of peer's public key
getPublicKeyFingerprint(contactID: string): string {
    const publicKey = this.publicKeyCache.get(contactID);
    // Hash the public key material
    const hash = crypto.subtle.digest('SHA-256', publicKey);
    return btoa(String.fromCharCode(...new Uint8Array(hash))).substring(0, 16);
}
```

UI should show:
```
🔑 Bob's Fingerprint: 4F7E2C8A9B1D (verify with Bob out-of-band)
✅ Fingerprints match? / ❌ Different?
```

Users must manually confirm fingerprints on first contact.

---

### 5. **No Forward Secrecy Between Messages (MEDIUM)**

**Problem:**
All messages to same contact use **same derived shared secret**:
```typescript
private async deriveSharedSecret(contactID: string): Promise<CryptoKey> {
    // Same secret for ALL messages to this contact
    if (this.sharedSecretCache.has(contactID)) {
        return this.sharedSecretCache.get(contactID)!; // Reused
    }
    // ...only computed once per contact
}
```

**Impact:**
- **Compromise of one contact key = all past AND future messages readable**
- If client is hacked, entire conversation history becomes visible
- No per-message key rotation
- Extended exposure window

**Better Approach - Double Ratchet Algorithm (used by Signal):**
```typescript
// Simplified ratchet concept
private async rotateMessageKey(): Promise<CryptoKey> {
    // Derive new key from previous key
    const newKey = await crypto.subtle.deriveKey(
        { name: 'HKDF', ... },
        previousKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
    return newKey;
}
```

This ensures:
- Each message has unique key
- Compromise of current key doesn't expose past messages
- Requires HKDF (HMAC-based Key Derivation Function)

---

### 6. **Sensitive Data in Browser Console (MEDIUM)**

**Problem:**
```typescript
// Client logs to console
console.error('WebSocket error:', error);
console.error('Failed to decrypt message:', error);
console.log('Ignoring message from blocked user:', data.fromID);
console.error('Invalid message format', e);

// Server logs
console.log('New connection');
console.log(`Client disconnected`);
console.error('Sender userID is missing');
```

**Attack:**
- Browser developer tools accessible if device compromised
- Error messages reveal internal state
- User IDs and contact information logged
- Error stack traces expose code structure

**Recommendation:**
```typescript
// Use secure logging utilities
class SecureLogger {
    private isDev = process.env.NODE_ENV === 'development';
    
    error(msg: string, shouldLog: boolean = false) {
        if (this.isDev && shouldLog) {
            console.error(msg);
        }
        // In production: send to secure logging service if needed
    }
    
    warn(msg: string) {
        // Never log PII or contact info
        if (msg.includes('userID') || msg.includes('contactID')) {
            this.error('[redacted]');
        }
    }
}
```

Never log:
- User IDs / contact identifiers
- Error details about failed decryption
- Message content (even encrypted)
- Key material

---

### 7. **Session Ephemeral but In-Memory Exploit Risk (MEDIUM)**

**Problem:**
```typescript
// Client stores everything in memory
private contacts: Map<string, Contact> = new Map();
private sharedSecretCache: Map<string, CryptoKey> = new Map();
```

**Risk:**
- Browser memory accessible via DevTools when refreshed
- JavaScript debugger can inspect objects
- Swapfile may contain unencrypted key material
- Browser history/cookies could log identifiers

**Impact:**
- If device is unlocked, attacker can read all data in memory
- Browser forensics can recover secrets
- No encryption at rest

**Recommendation:**
```typescript
// Zero sensitive data on page unload
window.addEventListener('beforeunload', () => {
    this.crypto.clearCache();
    this.contacts.clear();
    // Overwrite sensitive memory
    if (this.keyPair) {
        // Modern browsers can't explicitly wipe, but:
        this.keyPair = null;
    }
});

// Clear on visibility change if hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        this.messageInput.value = ''; // Clear draft messages
        // Could clear session on suspicious inactivity
    }
});
```

---

## High Priority Issues 🟠

### 8. **No Input Validation/Sanitization**

**Server (main.ts):**
```typescript
case 'publickey':
    if (typeof messageObj.publicKey === 'string') {
        ws.publicKey = messageObj.publicKey;  // ⚠️ No validation
    }
    
case 'keyexchange':
    if (typeof messageObj.toID !== 'string' || ...) {
        // Only type checking, no format validation
    }
```

**Risk:**
- Malformed public keys could cause issues
- toID accepts any string (including extremely long strings = DoS)
- No length limits, no format validation

**Recommendation:**
```typescript
const validatePublicKey = (key: string): boolean => {
    // Must be valid base64
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(key)) return false;
    // Reasonable length (P-256 public key ≈ 88 base64 chars)
    if (key.length < 80 || key.length > 100) return false;
    return true;
};

const validateUserID = (id: string): boolean => {
    if (typeof id !== 'string') return false;
    if (id.length < 3 || id.length > 64) return false;
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false; // Alphanumeric only
    return true;
};

case 'publickey':
    if (!validatePublicKey(messageObj.publicKey)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid public key format' }));
        return;
    }
```

---

### 9. **No Rate Limiting / DoS Protection**

**Problem:**
```typescript
ws.on('message', (messageStr) => {
    // No rate limit - accepts unlimited messages
    // No backpressure handling
    // Server processes every message immediately
});
```

**Attack:**
```javascript
// Attacker connects and floods
for (let i = 0; i < 1000000; i++) {
    ws.send(JSON.stringify({
        type: 'chatmessage',
        toID: 'any_user_id',
        encrypted: 'x'.repeat(1000000)
    }));
}
// Server crashes or becomes unresponsive
```

**Recommendation:**
```typescript
import { RateLimiter } from 'limiter'; // npm: limiter

const rateLimiters = new Map<string, RateLimiter>();
const MAX_MSGS_PER_SEC = 5;

wss.on('connection', (ws: CustomWebSocket) => {
    const limiter = new RateLimiter({ tokensPerInterval: MAX_MSGS_PER_SEC, interval: 'second' });
    rateLimiters.set(ws.userID!, limiter);
    
    ws.on('message', async (messageStr) => {
        const remaining = await limiter.removeTokens(1);
        if (remaining < 0) {
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Rate limited' 
            }));
            return;
        }
        // Process message
    });
});
```

---

### 10. **No Timestamp Validation / Message Replay Attack**

**Problem:**
```typescript
// No timestamp in message
const message: ChatMessage = {
    type: 'chatmessage',
    encrypted: encrypted,
    toID: this.currentContactID
    // No timestamp, nonce, or sequence number
};
```

**Attack:**
```
1. Attacker captures encrypted message A sent at 10:00
2. Stores it
3. Replays same message at 10:05
4. Recipient receives identical encrypted message twice
5. No way to detect replay - appears legitimate
```

**Recommendation:**
```typescript
// Client adds nonce and timestamp
async sendMessage() {
    const message: ChatMessage = {
        type: 'chatmessage',
        encrypted: encrypted,
        toID: this.currentContactID,
        timestamp: Date.now(),    // Add timestamp
        nonce: crypto.randomUUID() // Unique per message
    };
    
    this.ws.send(JSON.stringify(message));
    this.recentNonces.add(message.nonce!);
}

// Recipient tracks seen nonces within time window
private recentNonces = new Set<string>();

private async handleChatMessage(data: ChatMessage) {
    const now = Date.now();
    
    // Reject if timestamp > 5 minutes old
    if (!data.timestamp || (now - data.timestamp) > 5 * 60 * 1000) {
        throw new Error('Message timestamp invalid');
    }
    
    // Reject if we've seen this nonce before
    if (this.recentNonces.has(data.nonce!)) {
        throw new Error('Message replay detected');
    }
    
    this.recentNonces.add(data.nonce!);
    
    // Auto-cleanup old nonces
    this.cleanupNonces();
}
```

---

### 11. **Blocking is Client-Side Only (MEDIUM)**

**Problem:**
```typescript
// Client blocks locally
if (contact?.blocked) {
    console.log('Ignoring message from blocked user:', data.fromID);
    return; // Just doesn't display
}
```

**Issue:**
- Blocked user's messages still arrive at client
- Server still relays them
- Client processes and decrypts before deciding to hide
- Metadata still reveals communication

**Better Approach:**
```typescript
// Notify server about block
private toggleBlockContact(contactID: string) {
    const contact = this.contacts.get(contactID);
    contact.blocked = !contact.blocked;
    
    // Notify server
    this.ws.send(JSON.stringify({
        type: 'blocklist',
        blockedUserID: contactID,
        action: contact.blocked ? 'block' : 'unblock'
    }));
}

// Server-side: respect blocklist
const blockedUsers = new Map<string, Set<string>>();

case 'chatmessage':
    const blockedByRecipient = blockedUsers.get(messageObj.toID) || new Set();
    if (blockedByRecipient.has(ws.userID!)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'You are blocked'
        }));
        return;
    }
    // Relay message
```

---

## Medium Priority Issues 🟡

### 12. **Missing Security Headers**

**Problem:**
If deployed as HTTP, missing:
```
Content-Security-Policy: default-src 'self'; script-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000
X-XSS-Protection: 1; mode=block
Referrer-Policy: no-referrer
```

**Recommendation:**
```typescript
import express from 'express';

const app = express();

app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});
```

---

### 13. **No CORS Configuration**

**Problem:**
```typescript
const wss = new WebSocketServer({ port: WSS_PORT });
// No CORS restrictions on WebSocket
```

**Recommendation:**
```typescript
const wss = new WebSocketServer({
    port: WSS_PORT,
    perMessageDeflate: false, // Disable compression (Compression Bombs)
    maxPayload: 64 * 1024,     // Limit message size to 64KB
    verifyClient: (info) => {
        // Verify origin
        const origin = info.req.headers.origin;
        return origin === 'https://yourdomain.com';
    }
});
```

---

### 14. **No Connection Timeout**

**Problem:**
```typescript
ws.on('message', (messageStr) => {
    // Connection kept alive indefinitely
    // If idling, no timeout
});
```

**Solution:**
```typescript
const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

wss.on('connection', (ws: CustomWebSocket) => {
    let pongTimeout: NodeJS.Timeout;
    
    const heartbeat = () => {
        clearTimeout(pongTimeout);
        pongTimeout = setTimeout(() => {
            ws.terminate();
        }, 30000); // 30s to respond
    };
    
    ws.on('pong', heartbeat);
    
    const pingInterval = setInterval(() => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    }, 30000);
    
    ws.on('close', () => clearInterval(pingInterval));
    
    heartbeat();
});
```

---

## Low Priority Issues 🟢

### 15. **No Contact DLP / Data Loss**

Currently, if you refresh the page:
```
- All contacts cleared
- All message history lost
- Encryption keys discarded
```

**Consideration:**
For extended privacy, ephemeral storage is good, but add:
- IndexedDB encryption for opt-in message history
- Encrypted export/backup feature
- Secure deletion on uninstall

---

## Privacy Analysis

### What the Server CANNOT See ✅
- Message content (encrypted with AES-GCM)
- Recipient identity (encrypted with ECDH)
- Conversation history
- Keystroke timing
- Links/media within messages

### What the Server CAN See 🔴
- **User connecting/disconnecting** (timing correlation)
- **Message frequency** (metadata, can infer communication patterns)
- **Message size** (even encrypted, reveals rough content length)
- **Public key material** (over unencrypted WebSocket)
- **User IDs** (human-readable names, not random)
- **Connection graph** (who talks to whom)

### Metadata Risks

Even though content is encrypted:
```
12:00:01 - Alice connects
12:00:45 - Alice requests Bob's key
12:00:47 - Alice sends 250-byte message to Bob
12:00:49 - Bob sends 312-byte message to Alice
12:01:15 - Alice sends 89-byte message to Bob
12:01:20 - Alice disconnects
```

**An observer can:**
- Identify who communicates with whom
- See message frequency
- Infer rough conversation topics from message sizes
- Detect active conversations (timing)
- Create connection graph of users

**Mitigations:**
1. Use **cover traffic** (dummy messages at random intervals)
2. Add **random padding** to all messages
3. Use **Tor/VPN** to mask IP
4. Run server locally or on trusted infrastructure

---

## Trustlessness Assessment

### ✅ **TRUE ZERO-KNOWLEDGE SERVER**

The server architecture is genuinely trustless in terms of **message content**:

1. **Key Exchange:** Client generates ECDH keypair locally ✅
2. **Shared Secret:** Derived on client only ✅
3. **Encryption:** Happens before transmission ✅
4. **Decryption:** Happens only on recipient's client ✅
5. **Server Access:** Cannot decrypt, only relays ✅

**Mathematical Proof:**
```
Message M encrypted: C = AES-GCM(M, K, IV)
where K = ECDH(Alice's private, Bob's public)

Server has: C, IV, Alice's public key, Bob's public key
Server missing: Alice's private key, Bob's private key

Without private keys:
Cannot compute K
Cannot compute M = AES-GCM_decrypt(C, K, IV)
Therefore: Message is unreadable to server ✅
```

### ⚠️ **HOWEVER: Metadata Leakage**

While content is safe, **metadata is NOT protected**:
- User IDs visible
- Connection pattern visible
- Message timing visible
- Message sizes visible

For **true privacy**, add:
```typescript
// Onion routing or padding
// Cover traffic
// Timing obfuscation
```

---

## Recommendations Priority Checklist

### 🔴 CRITICAL (Fix Before Production)
- [ ] Use TLS/SSL (wss:// not ws://)
- [ ] Fix user ID generation (cryptographically random)
- [ ] Add message signing for authentication
- [ ] Implement out-of-band key verification

### 🟠 HIGH
- [ ] Input validation/sanitization
- [ ] Rate limiting on server
- [ ] Timestamp validation + replay protection
- [ ] Disable console logging in production

### 🟡 MEDIUM
- [ ] Forward secrecy (Double Ratchet Algorithm)
- [ ] Security headers
- [ ] Connection timeouts
- [ ] CORS/Origin validation
- [ ] Payload size limits

### 🟢 LOW
- [ ] Metadata protection (padding, cover traffic)
- [ ] Optional encrypted local storage
- [ ] Connection anonymization

---

## Conclusion

**Security Grade: C+**

CoffeeChat has achieved the **core goal of a trustless server** - messages remain encrypted end-to-end and the server cannot read them. ✅

However, **critical vulnerabilities in transport security and key exchange** undermine this advantage. The application should **not be used in production** until TLS and proper authentication mechanisms are implemented.

**For personal/experimental use with friends who can verify keys out-of-band:** Currently acceptable with awareness of metadata risks.

**For sensitive communications or public deployment:** Implement all 🔴 CRITICAL items before use.

---

## References

- [NIST SP 800-38D: AES-GCM](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [RFC 8439: ChaCha20-Poly1305](https://tools.ietf.org/html/rfc8439)
- [Signal & Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cryptographic Failures](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/)
