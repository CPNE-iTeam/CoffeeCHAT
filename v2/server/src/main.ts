/**
 * CoffeeCHAT v2 Server - WebSocket Relay
 */

import https from 'https';
import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import { ConnectionManager } from './services/ConnectionManager.js';
import { GroupManager } from './services/GroupManager.js';
import { MessageValidator } from './validators/MessageValidator.js';
import type { 
  CustomWebSocket, ServerMessage, 
  ChatMessage, GroupMessage, CreateGroup, AddGroupMembers,
  SetUsername, FindUser
} from './types/index.js';

const PORT = parseInt(process.env.WSS_PORT ?? '8080', 10);

// Load TLS certificates
const tlsOptions = {
  cert: readFileSync('./certs/cert.pem'),
  key: readFileSync('./certs/key.pem')
};

// Create HTTPS server
const httpsServer = https.createServer(tlsOptions);

// Create WebSocket server
const wss = new WebSocketServer({
  server: httpsServer,
  perMessageDeflate: false,
  maxPayload: 16 * 1024 * 1024 // 16MB
});

// Services
const connections = new ConnectionManager();
const groups = new GroupManager();

// Rate limiting
const RATE_LIMIT = 20;
const RATE_WINDOW = 10000;
const rateLimiters = new WeakMap<CustomWebSocket, { count: number; reset: number }>();

function checkRateLimit(ws: CustomWebSocket): boolean {
  const now = Date.now();
  let state = rateLimiters.get(ws);
  
  if (!state || now > state.reset) {
    state = { count: 1, reset: now + RATE_WINDOW };
    rateLimiters.set(ws, state);
    return true;
  }
  
  if (state.count >= RATE_LIMIT) {
    return false;
  }
  
  state.count++;
  return true;
}

function sendError(ws: CustomWebSocket, message: string): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message }));
  }
}

// ==================== Connection Handler ====================

wss.on('connection', (ws: CustomWebSocket) => {
  // Register with auto-generated guest username
  const username = connections.register(ws);
  
  // Send welcome with username
  ws.send(JSON.stringify({ type: 'welcome', username }));
  
  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  const pingInterval = setInterval(() => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  }, 30000);

  // Message handler
  ws.on('message', (data) => {
    if (!checkRateLimit(ws)) {
      sendError(ws, 'Rate limited');
      return;
    }

    let msg: ServerMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (!msg.type) return;

    switch (msg.type) {
      case 'chatmessage':
        handleChatMessage(ws, msg as ChatMessage);
        break;
      case 'groupmessage':
        handleGroupMessage(ws, msg as GroupMessage);
        break;
      case 'creategroup':
        handleCreateGroup(ws, msg as CreateGroup);
        break;
      case 'addgroupmembers':
        handleAddMembers(ws, msg as AddGroupMembers);
        break;
      case 'setusername':
        handleSetUsername(ws, msg as SetUsername);
        break;
      case 'finduser':
        handleFindUser(ws, msg as FindUser);
        break;
      case 'ping':
        // Heartbeat - no action needed
        break;
    }
  });

  // Close handler
  ws.on('close', () => {
    clearInterval(pingInterval);
    if (ws.username) {
      connections.unregister(ws.username);
    }
  });

  // Error handler
  ws.on('error', (error: Error & { code?: string }) => {
    if (error.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') {
      sendError(ws, 'Message too large');
    }
  });
});

// ==================== Message Handlers ====================

function handleChatMessage(ws: CustomWebSocket, msg: ChatMessage): void {
  if (!ws.username) return;
  
  if (!MessageValidator.validateUsername(msg.to)) {
    sendError(ws, 'Invalid recipient');
    return;
  }
  
  if (!MessageValidator.validateContent(msg.content)) {
    sendError(ws, 'Invalid message content');
    return;
  }

  const contentType = MessageValidator.validateContentType(msg.contentType) 
    ? msg.contentType 
    : 'text';

  connections.send(msg.to, {
    type: 'chatmessage',
    from: ws.username,
    content: msg.content,
    contentType,
    timestamp: Date.now()
  });
}

function handleGroupMessage(ws: CustomWebSocket, msg: GroupMessage): void {
  if (!ws.username) return;
  
  if (!MessageValidator.validateGroupID(msg.groupID)) {
    sendError(ws, 'Invalid group');
    return;
  }
  
  if (!MessageValidator.validateContent(msg.content)) {
    sendError(ws, 'Invalid message content');
    return;
  }

  // Check if user is a member
  if (!groups.isMember(msg.groupID, ws.username)) {
    sendError(ws, 'Not a member of this group');
    return;
  }

  const contentType = MessageValidator.validateContentType(msg.contentType) 
    ? msg.contentType 
    : 'text';

  const members = groups.getMembers(msg.groupID);
  
  connections.broadcast(members, {
    type: 'groupmessage',
    groupID: msg.groupID,
    from: ws.username,
    content: msg.content,
    contentType,
    timestamp: Date.now()
  }, ws.username); // Exclude sender
}

function handleCreateGroup(ws: CustomWebSocket, msg: CreateGroup): void {
  if (!ws.username) return;
  
  if (!MessageValidator.validateGroupID(msg.groupID)) {
    sendError(ws, 'Invalid group ID');
    return;
  }
  
  if (!MessageValidator.validateGroupName(msg.groupName)) {
    sendError(ws, 'Invalid group name');
    return;
  }
  
  if (!MessageValidator.validateMembers(msg.members)) {
    sendError(ws, 'Invalid member list');
    return;
  }

  // Ensure creator is in members
  if (!msg.members.includes(ws.username)) {
    msg.members.push(ws.username);
  }

  // Store group
  groups.set({
    id: msg.groupID,
    name: msg.groupName,
    members: msg.members,
    creator: ws.username
  });

  // Notify all members (except creator)
  connections.broadcast(msg.members, {
    type: 'groupcreated',
    groupID: msg.groupID,
    groupName: msg.groupName,
    members: msg.members,
    creator: ws.username
  }, ws.username);
}

function handleAddMembers(ws: CustomWebSocket, msg: AddGroupMembers): void {
  if (!ws.username) return;
  
  if (!MessageValidator.validateGroupID(msg.groupID)) {
    sendError(ws, 'Invalid group');
    return;
  }
  
  if (!MessageValidator.validateMembers(msg.members)) {
    sendError(ws, 'Invalid member list');
    return;
  }

  // Check if user is a member
  if (!groups.isMember(msg.groupID, ws.username)) {
    sendError(ws, 'Not a member of this group');
    return;
  }

  const group = groups.get(msg.groupID);
  if (!group) {
    sendError(ws, 'Group not found');
    return;
  }

  // Add members
  groups.addMembers(msg.groupID, msg.members);

  // Get updated member list
  const allMembers = groups.getMembers(msg.groupID);

  // Notify existing members about new members
  connections.broadcast(allMembers, {
    type: 'groupmemberadded',
    groupID: msg.groupID,
    members: msg.members,
    addedBy: ws.username
  });

  // Send full group info to new members
  for (const newMember of msg.members) {
    connections.send(newMember, {
      type: 'groupcreated',
      groupID: group.id,
      groupName: group.name,
      members: allMembers,
      creator: group.creator
    });
  }
}

function handleSetUsername(ws: CustomWebSocket, msg: SetUsername): void {
  if (!ws.username) return;
  
  if (!MessageValidator.validateUsername(msg.username)) {
    sendError(ws, 'Invalid username format');
    return;
  }

  const oldUsername = ws.username;
  const success = connections.changeUsername(oldUsername, msg.username);
  
  if (success) {
    ws.send(JSON.stringify({
      type: 'usernamechanged',
      oldUsername,
      newUsername: msg.username
    }));
  } else {
    sendError(ws, 'Username already taken');
  }
}

function handleFindUser(ws: CustomWebSocket, msg: FindUser): void {
  if (!ws.username) return;
  
  if (!MessageValidator.validateUsername(msg.username)) {
    sendError(ws, 'Invalid username');
    return;
  }

  const isOnline = connections.isConnected(msg.username);
  
  ws.send(JSON.stringify({
    type: 'userfound',
    username: msg.username,
    isOnline
  }));
}

// ==================== Start Server ====================

httpsServer.listen(PORT, () => {
  console.log(`☕ CoffeeCHAT v2 server running on wss://localhost:${PORT}`);
});
