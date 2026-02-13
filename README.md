# CoffeeCHAT v2

A modern, privacy-focused chat application with local message storage and beautiful UI.

## Features

### Core
- **Real-time messaging** - WebSocket-based instant messaging
- **Group chats** - Dynamic membership (add members anytime)
- **Image sharing** - Drag & drop, paste, or click to send images
- **Local storage** - Messages persist across sessions, encrypted at rest
- **Fire button** 🔥 - One-click delete all data (DuckDuckGo style)

### Privacy & Security
- **Transport encryption** - TLS/WSS for all communications
- **Username hashing** - Server never sees plaintext usernames
- **Encrypted storage** - Local data encrypted with session-derived key
- **No server storage** - Server is a pure relay, stores nothing permanently
- **Rate limiting** - Protection against spam/DoS

### UX Improvements
- **Modern dark UI** - Clean, responsive design
- **Message timestamps** - Human-readable time display
- **Unread badges** - Track unread messages per conversation
- **Notifications** - Browser notifications for new messages
- **Keyboard shortcuts** - Enter to send, paste images
- **Contact search** - Find users by @username

## Quick Start

### 1. Server Setup

```bash
cd v2/server
npm install

# Create TLS certificates (development)
mkdir certs
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"

# Start server
npm run dev
```

### 2. Client Setup

```bash
cd v2/client
npm install
npm run dev
```

### 3. Open in Browser

Navigate to `http://localhost:5173`. Accept the self-signed certificate warning for WSS.

## Architecture

### Client (`v2/client/`)
```
src/
├── main.ts              # App entry point
├── styles.css           # All styles
├── types/index.ts       # TypeScript definitions
├── services/
│   ├── EventEmitter.ts      # Pub/sub event system
│   ├── StorageService.ts    # Encrypted localStorage
│   ├── WebSocketService.ts  # Connection management
│   ├── ContactService.ts    # Contact management
│   ├── GroupService.ts      # Group management
│   ├── ImageService.ts      # Image processing
│   └── NotificationService.ts
├── ui/
│   ├── ChatUI.ts        # Message display
│   ├── SidebarUI.ts     # Contacts/groups lists
│   ├── ModalsUI.ts      # Modal dialogs
│   └── HeaderUI.ts      # Connection status
└── utils/
    └── helpers.ts       # Utility functions
```

### Server (`v2/server/`)
```
src/
├── main.ts              # Server entry point
├── types/index.ts       # TypeScript definitions
├── services/
│   ├── ConnectionManager.ts # User connections
│   └── GroupManager.ts      # Group state
└── validators/
    └── MessageValidator.ts  # Input validation
```

## Data Storage

### Local Storage
- Data is encrypted using AES-GCM with a key derived from the session ID
- Stored in `localStorage` under `coffeechat-v2-data`
- Use the 🔥 Fire button to permanently delete all data

### What's Stored
- Your username (if set)
- Contacts list with message history
- Groups with message history
- App settings

### What's NOT Stored
- Nothing on the server (pure relay)
- No unencrypted data in localStorage

## Security Model

| Layer | Protection |
|-------|------------|
| Transport | TLS 1.3 (WSS) |
| Username | SHA-256 hashed client-side |
| Local Storage | AES-256-GCM encrypted |
| Rate Limiting | Token bucket (20 msg/10s) |

### What the Server Sees
- Session IDs (ephemeral)
- Username hashes (not plaintext)
- Message content (plaintext - no E2EE in v2)
- Connection timing

### Privacy Trade-offs
v2 removes end-to-end encryption in favor of:
- Simpler architecture
- Faster development
- Local message persistence
- Easier debugging

For E2EE, see v1.

## Configuration

### Server
- `WSS_PORT` - WebSocket port (default: 8080)

### Client
- `VITE_WSS_PORT` - Server port (default: 8080)

## Troubleshooting

### "Failed to connect"
1. Ensure server is running
2. Accept the self-signed certificate at `https://localhost:8080`
3. Check that ports match

### "User not found"
- The user must be online and have set a username
- Usernames are case-insensitive

### Fire button doesn't work
- Check browser console for errors
- Try clearing localStorage manually

## Development

```bash
# Client (with hot reload)
cd v2/client && npm run dev

# Server (rebuild on changes)
cd v2/server && npm run dev
```

## License

MIT
