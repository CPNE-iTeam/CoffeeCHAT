# CoffeeChat

CoffeeChat is an end-to-end encrypted (E2EE) messaging app with a trustless server. The server only relays encrypted payloads and never sees plaintext content.

## Contents

- Features
- Security and privacy model
- Setup and run (server)
- Setup and run (client)
- Key verification (emoji chains)
- Configuration
- Troubleshooting

## Features

- E2EE messaging using ECDH (P-256) + AES-GCM
- Message authenticity with ECDSA signatures
- Trustless server that only relays encrypted payloads
- Optional manual key verification via emoji fingerprints
- TLS/WSS transport support
- Rate limiting and basic DoS protection

## Security and Privacy Model

### What is protected

- Message content is encrypted end-to-end with AES-GCM.
- Shared secrets are derived on the clients only (ECDH).
- Message authenticity is verified with ECDSA signatures.
- The server cannot decrypt messages.

### What is exposed (metadata)

The server can still see:

- User IDs (temporary session IDs)
- Connection timing and message timing
- Message sizes

### Manual key verification

The app generates an emoji fingerprint for each public key. When keys are exchanged, the client prints a combined emoji chain in the system messages:

- Compare the emoji chain with your contact out-of-band (in person, phone call).
- If the chain matches, you reduce the risk of a man-in-the-middle attack.

### Ephemeral sessions

Session data is kept in memory only and cleared on page refresh. Data is cleared on unload and when the page becomes hidden.

### Transport security

Use WSS (TLS) for WebSocket transport. Self-signed certificates are fine for local development. Use a real CA for production.

## Setup and Run (Server)

### 1) Install dependencies

```bash
cd server
npm install
```

### 2) Create TLS certificates (development)

From the project root:

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"
```

### 3) Start server

```bash
npm run dev
```

The server listens on WSS port 8080 by default.

## Setup and Run (Client)

### 1) Install dependencies

```bash
cd client
npm install
```

### 2) Configure WSS port (optional)

The client reads `VITE_WSS_PORT` at build time. Create `client/.env` if you want to override:

```
VITE_WSS_PORT=8080
```

### 3) Start client

```bash
npm run dev
```

Open the client in your browser. If you use a self-signed certificate, your browser will show a warning for WSS. Allow it for local development.

## Key Verification (Emoji Chain)

When a key exchange completes, the client prints a line like:

```
Emoji chain: <combined emojis> - Ask if it matches theirs
```

Compare this chain with your contact. If it matches, the key exchange is likely authentic.

## Configuration

### Server

- `WSS_PORT` (default: 8080)
- TLS certs loaded from `./certs/cert.pem` and `./certs/key.pem`

### Client

- `VITE_WSS_PORT` (default: 8080)

## Security Controls Implemented

- Input validation for IDs, keys, and encrypted payloads
- Basic rate limiting (token bucket)
- WebSocket message size limit (64KB)
- Compression disabled to mitigate compression bombs
- Heartbeat-based connection timeout
- Minimal logging (no sensitive data in console)

## Troubleshooting

### WSS fails with self-signed certificates

- Open `https://localhost:8080` in your browser and accept the warning.
- Then reload the client and try again.

### Client cannot connect

- Ensure the server is running.
- Verify the WSS port matches `VITE_WSS_PORT`.
- Check that `certs/` contains `cert.pem` and `key.pem`.

### Key exchange not completing

- Ensure both clients are online.
- Check that neither user is blocked.

## Notes

- The server is a relay only and must be treated as untrusted.
- For production, use certificates from a trusted CA (for example, Let's Encrypt).
- This project is intended for educational and experimental use until all audit items are addressed.
