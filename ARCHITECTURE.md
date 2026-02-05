# CoffeeChat - Refactored Architecture

## Overview

The codebase has been refactored from monolithic files into a **scalable, service-oriented architecture** with clear separation of concerns. This makes the code:
- ✅ **Maintainable**: Easy to find and fix bugs
- ✅ **Testable**: Each service can be unit tested independently
- ✅ **Scalable**: Easy to add new features without touching existing code
- ✅ **Readable**: Clear responsibilities for each module

---

## Client Architecture

### Directory Structure

```
client/src/
├── types/
│   └── index.ts              # Shared TypeScript interfaces
├── services/
│   ├── WebSocketService.ts   # WebSocket connection management
│   ├── ContactService.ts     # Contact data management
│   └── MessageService.ts     # Message encryption/decryption
├── ui/
│   ├── ChatUI.ts             # Chat interface management
│   └── ContactListUI.ts      # Contact list interface
├── crypto.ts                 # Cryptography operations (existing)
├── style.css                 # Styles
├── main.ts                   # Original monolithic code (legacy)
└── main-refactored.ts        # New service-based entry point ✨
```

### Service Layer

**WebSocketService** (`services/WebSocketService.ts`)
- Manages WebSocket connection lifecycle
- Handles reconnection logic (5 attempts with 2s delay)
- Provides pub/sub pattern for messages and status
- Exposes `send()`, `onMessage()`, `onStatusChange()` APIs

**ContactService** (`services/ContactService.ts`)
- Manages contact list (add, update, delete)
- Tracks current active contact
- Stores messages per contact
- Provides reactive change notifications

**MessageService** (`services/MessageService.ts`)
- Wraps CryptoManager for encryption/decryption
- Handles message signing and verification
- Manages key exchange requests
- Generates emoji fingerprints

### UI Layer

**ChatUI** (`ui/ChatUI.ts`)
- Renders chat messages
- Updates chat header
- Manages message input
- Handles status display

**ContactListUI** (`ui/ContactListUI.ts`)
- Renders contact list
- Handles add contact UI
- Manages contact selection

### Usage Example

```typescript
import { WebSocketService } from './services/WebSocketService';
import { ContactService } from './services/ContactService';

// Initialize services
const wsService = new WebSocketService();
const contactService = new ContactService();

// Subscribe to messages
wsService.onMessage((msg) => {
  console.log('Received:', msg);
});

// React to contact changes
contactService.onChange(() => {
  renderContactsList();
});
```

---

## Server Architecture

### Directory Structure

```
server/src/
├── types/
│   └── index.ts                      # Server TypeScript interfaces
├── services/
│   ├── ConnectionManager.ts          # WebSocket connection tracking
│   ├── KeyExchangeService.ts         # Key exchange coordination
│   └── MessageRouter.ts              # Message routing logic
├── validators/
│   └── MessageValidator.ts           # Input validation & sanitization
├── utils.ts                          # Utility functions (existing)
├── main.ts                           # Original monolithic code (legacy)
└── main-refactored.ts                # New service-based entry point ✨
```

### Service Layer

**ConnectionManager** (`services/ConnectionManager.ts`)
- Tracks all active WebSocket connections
- Maps user IDs to WebSockets
- Stores public keys per connection
- Provides connection lookup APIs

**KeyExchangeService** (`services/KeyExchangeService.ts`)  
- Coordinates key exchange between two users
- Validates sender and recipient
- Relays public keys bidirectionally
- Handles exchange failures gracefully

**MessageRouter** (`services/MessageRouter.ts`)
- Routes encrypted messages to recipients
- Validates message format
- Preserves signatures
- Returns delivery status

**MessageValidator** (`validators/MessageValidator.ts`)
- Validates public key format (JSON with encryption/signing keys)
- Validates user IDs (alphanumeric, 2-64 chars)
- Validates encrypted messages (base64, max 100KB)
- Validates signatures (base64)
- Provides sanitized error messages

### Usage Example

```typescript
import { ConnectionManager } from './services/ConnectionManager';
import { MessageRouter } from './services/MessageRouter';

// Initialize services
const connectionManager = new ConnectionManager();
const messageRouter = new MessageRouter(connectionManager);

// Register connection
connectionManager.registerConnection(ws, userID);

// Route message
messageRouter.routeMessage(fromWs, toID, encrypted, signature);
```

---

## Migration Guide

### Client Migration

**Current entry point:**
```typescript
// Using: client/src/main.ts
```

**New entry point:**
```typescript
// Switch to: client/src/main-refactored.ts
// Update: client/index.html

<script type="module" src="/src/main-refactored.ts"></script>
```

### Server Migration

**Current entry point:**
```typescript
// Using: server/src/main.ts
```

**New entry point:**
```typescript
// Switch to: server/src/main-refactored.ts
// Update: server/package.json

{
  "scripts": {
    "dev": "tsx watch src/main-refactored.ts"
  }
}
```

---

## Benefits of Refactored Architecture

### ✅ Separation of Concerns
Each service has a single, well-defined responsibility:
- WebSocket handling ≠ Message encryption ≠ UI rendering
- Easy to reason about and debug

### ✅ Testability
Services can be tested independently:
```typescript
// Mock WebSocket service for testing MessageService
const mockWs = new MockWebSocketService();
const messageService = new MessageService(crypto, mockWs);
```

### ✅ Reusability
Services can be composed in different ways:
```typescript
// Use ContactService in different contexts
const contactService = new ContactService();
// Use in React: useEffect(() => contactService.onChange(render), []);
// Use in Vue: watch(() => contactService.getAllContacts());
```

### ✅ Scalability
Easy to add new features:
- New message type? Add handler to MessageRouter
- New UI component? Create new class in `ui/`
- New validation rule? Extend MessageValidator

### ✅ Type Safety
Strong TypeScript types across the stack:
- Shared interfaces in `types/`
- Compile-time error checking
- Better IDE autocomplete

---

## Adding New Features

### Example: Add Typing Indicator

**1. Update Types:**
```typescript
// types/index.ts
export interface ChatMessage {
  type: string;
  isTyping?: boolean; // Add new field
}
```

**2. Add Client Service Method:**
```typescript
// services/MessageService.ts
sendTypingIndicator(toID: string, isTyping: boolean): void {
  this.wsService.send({
    type: 'typing',
    toID,
    isTyping
  });
}
```

**3. Add Server Handler:**
```typescript
// main-refactored.ts
case 'typing':
  handleTyping(ws, messageObj);
  break;

function handleTyping(ws: CustomWebSocket, message: ServerMessage): void {
  messageRouter.routeMessage(ws, message.toID!, JSON.stringify({ isTyping: message.isTyping }));
}
```

**4. Update UI:**
```typescript
// ui/ChatUI.ts
showTypingIndicator(isTyping: boolean): void {
  const indicator = document.getElementById('typingIndicator');
  indicator.style.display = isTyping ? 'block' : 'none';
}
```

---

## Performance Considerations

### Client
- **WebSocketService**: Auto-reconnect prevents connection loss
- **ContactService**: O(1) contact lookup with Map
- **UI Components**: No unnecessary re-renders

### Server
- **ConnectionManager**: O(1) connection lookup
- **MessageRouter**: Direct delivery, no broadcasting
- **Validators**: Early rejection of invalid messages

---

## Security Enhancements in Refactored Code

✅ **Input validation** on all server messages
✅ **Message size limits** (64KB max payload)
✅ **Compression disabled** (prevents compression bombs)
✅ **Type-safe** message handling
✅ **Sanitized error messages** (no info leakage)
✅ **No sensitive logging** (addresses SECURITY_AUDIT issue #6)

---

## Next Steps

1. **Switch entry points** in `index.html` and `package.json`
2. **Run tests** to ensure functionality matches
3. **Monitor performance** and connection stability
4. **Add unit tests** for each service
5. **Remove legacy files** (`main.ts`) after validation

---

## Summary

The refactored architecture provides:
- **10+ new files** with clear responsibilities
- **100% type-safe** TypeScript
- **Service-oriented** design pattern
- **Easy to extend** and maintain
- **Production-ready** structure

The old monolithic files (`main.ts`) remain for reference but should be replaced with the refactored versions (`main-refactored.ts`) once validated.
