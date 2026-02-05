import './style.css'
import { CryptoManager } from './crypto'

interface ChatMessage {
  type: string;
  content?: string;
  encrypted?: string;
  signature?: string;
  fromID?: string;
  toID?: string;
  userID?: string;
  message?: string;
  publicKey?: string;
  requestingUserID?: string;
}

interface Contact {
  id: string;
  messages: Array<{ content: string; fromID: string; timestamp: number }>;
  lastMessage?: string;
  publicKey?: string;
  blocked?: boolean;
}

class CoffeeChatClient {
  private ws: WebSocket | null = null;
  private myID: string = '';
  private currentContactID: string | null = null;
  private contacts: Map<string, Contact> = new Map();
  private crypto: CryptoManager = new CryptoManager();
  private myPublicKey: string = '';

  // DOM elements
  private statusEl: HTMLElement;
  private myIDEl: HTMLElement;
  private newContactIDInput: HTMLInputElement;
  private addContactBtn: HTMLButtonElement;
  private contactsList: HTMLElement;
  private currentChatInfo: HTMLElement;
  private messagesContainer: HTMLElement;
  private messageInput: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private copyBtn: HTMLButtonElement;
  private blockBtn: HTMLButtonElement;

  constructor() {
    // Get DOM elements
    this.statusEl = document.getElementById('status')!;
    this.myIDEl = document.getElementById('myID')!;
    this.newContactIDInput = document.getElementById('newContactID') as HTMLInputElement;
    this.addContactBtn = document.getElementById('addContactBtn') as HTMLButtonElement;
    this.contactsList = document.getElementById('contactsList')!;
    this.currentChatInfo = document.getElementById('currentChatInfo')!;
    this.messagesContainer = document.getElementById('messages')!;
    this.messageInput = document.getElementById('messageInput') as HTMLInputElement;
    this.sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
    this.copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;
    this.blockBtn = document.getElementById('blockBtn') as HTMLButtonElement;

    this.initialize();
  }

  private async initialize() {
    this.setupEventListeners();
    
    // Initialize encryption
    this.updateStatus('Initializing encryption...', false);
    this.myPublicKey = await this.crypto.initialize();
    this.addSystemMessage('End-to-end encryption initialized');
    this.addSystemMessage('⚠️ Session is ephemeral - all data lost on reload');
    
    this.connect();
  }

  private connect() {
    this.updateStatus('Connecting...', false);
    const wsPort = import.meta.env.VITE_WSS_PORT ?? '8080';
    const wsHost = window.location.hostname || 'localhost';
    this.ws = new WebSocket(`wss://${wsHost}:${wsPort}`);

    this.ws.onopen = () => {
      this.updateStatus('Connected', true);
      this.addSystemMessage('Secure connection established');
      
      // Send our public key to server
      if (this.myPublicKey && this.ws) {
        this.ws.send(JSON.stringify({
          type: 'publickey',
          publicKey: this.myPublicKey
        }));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data: ChatMessage = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.addSystemMessage('Connection error occurred');
    };

    this.ws.onclose = () => {
      this.updateStatus('Disconnected', false);
      this.addSystemMessage('Disconnected from server');
      setTimeout(() => this.connect(), 3000);
    };
  }

  private async handleMessage(data: ChatMessage) {
    switch (data.type) {
      case 'welcome':
        if (data.userID) {
          this.myID = data.userID;
          this.myIDEl.textContent = this.myID;
        }
        break;

      case 'chatmessage':
        if (data.encrypted && data.fromID) {
          try {
            // Check if user is blocked
            const contact = this.contacts.get(data.fromID);
            if (contact?.blocked) {
              console.log('Ignoring message from blocked user:', data.fromID);
              return;
            }

            // Verify signature and decrypt the message
            let decryptedContent: string;
            if (data.signature) {
              decryptedContent = await this.crypto.decryptAndVerify(data.fromID, data.encrypted, data.signature);
            } else {
              // Fallback for unsigned messages (backwards compatibility)
              decryptedContent = await this.crypto.decryptMessage(data.fromID, data.encrypted);
            }
            
            if (!this.contacts.has(data.fromID)) {
              this.addContact(data.fromID);
            }
            
            const updatedContact = this.contacts.get(data.fromID)!;
            updatedContact.messages.push({
              content: decryptedContent,
              fromID: data.fromID,
              timestamp: Date.now()
            });
            updatedContact.lastMessage = decryptedContent;
            
            if (this.currentContactID === data.fromID) {
              this.addMessage(decryptedContent, data.fromID, 'received');
            }
            
            this.renderContactsList();
          } catch (error) {
            console.error('Failed to decrypt/verify message:', error);
            this.addSystemMessage(`Failed to process message from ${data.fromID}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        break;

      case 'publickey':
        // Received public key from a contact
        if (data.fromID && data.publicKey) {
          await this.crypto.storePublicKey(data.fromID, data.publicKey);
          
          // Update contact
          const contact = this.contacts.get(data.fromID);
          if (contact) {
            contact.publicKey = data.publicKey;
          }
          
          this.addSystemMessage(`🔑 Secured connection with ${data.fromID.substring(0, 8)}...`);
          this.addSystemMessage('✅ You can now send encrypted messages');
          this.renderContactsList();
          
          // Update UI if this is the current chat
          if (this.currentContactID === data.fromID) {
            this.updateChatHeader();
          }
        }
        break;

      case 'error':
        if (data.message) {
          this.addSystemMessage(`Error: ${data.message}`);
        }
        break;
    }
  }

  private setupEventListeners() {
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.addContactBtn.addEventListener('click', () => this.addNewContact());
    this.newContactIDInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addNewContact();
      }
    });

    this.copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.myID).then(() => {
        this.copyBtn.textContent = '✓';
        setTimeout(() => {
          this.copyBtn.textContent = '📋';
        }, 1000);
      });
    });

    // Block button
    this.blockBtn.addEventListener('click', () => {
      if (this.currentContactID) {
        this.toggleBlockContact(this.currentContactID);
      }
    });
  }

  private addNewContact() {
    const contactID = this.newContactIDInput.value.trim();
    if (contactID && contactID !== this.myID) {
      this.addContact(contactID);
      this.newContactIDInput.value = '';
      
      // Request public key from this contact
      this.requestPublicKey(contactID);
      
      this.switchToContact(contactID);
    }
  }

  private requestPublicKey(contactID: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send our public key and request theirs
    this.ws.send(JSON.stringify({
      type: 'keyexchange',
      toID: contactID,
      publicKey: this.myPublicKey
    }));
  }

  private addContact(contactID: string) {
    if (!this.contacts.has(contactID)) {
      this.contacts.set(contactID, {
        id: contactID,
        messages: []
      });
      this.renderContactsList();
    }
  }

  private switchToContact(contactID: string) {
    this.currentContactID = contactID;
    this.renderContactsList();
    this.renderMessages();
    
    // Auto-focus input if encrypted
    if (this.crypto.hasPublicKey(contactID)) {
      this.messageInput.focus();
    }
    this.updateChatHeader();
  }

  private renderContactsList() {
    this.contactsList.innerHTML = '';
    
    this.contacts.forEach((contact) => {
      const contactEl = document.createElement('div');
      contactEl.className = 'contact-item';
      if (this.currentContactID === contact.id) {
        contactEl.className += ' active';
      }
      if (contact.blocked) {
        contactEl.className += ' blocked';
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'contact-name';
      const displayName = contact.id.substring(0, 10) + (contact.id.length > 10 ? '...' : '');
      nameEl.textContent = contact.blocked ? `${displayName} (Blocked)` : displayName;

      const previewEl = document.createElement('div');
      previewEl.className = 'contact-preview';
      previewEl.textContent = contact.blocked ? 'Blocked' : (contact.lastMessage || 'No messages yet');

      contactEl.appendChild(nameEl);
      contactEl.appendChild(previewEl);

      contactEl.addEventListener('click', () => {
        this.switchToContact(contact.id);
      });

      this.contactsList.appendChild(contactEl);
    });
  }

  private renderMessages() {
    this.messagesContainer.innerHTML = '';
    
    if (!this.currentContactID) {
      return;
    }

    const contact = this.contacts.get(this.currentContactID);
    if (!contact) return;

    contact.messages.forEach((msg) => {
      const type = msg.fromID === this.myID ? 'sent' : 'received';
      this.addMessage(msg.content, msg.fromID, type, false);
    });

    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private updateChatHeader() {
    if (!this.currentContactID) {
      this.currentChatInfo.innerHTML = '<span class="chat-title">Select a contact to start chatting</span>';
      this.messageInput.disabled = true;
      this.sendBtn.disabled = true;
      this.blockBtn.style.display = 'none';
      return;
    }

    const contact = this.contacts.get(this.currentContactID);
    const isBlocked = contact?.blocked || false;
    const isEncrypted = this.crypto.hasPublicKey(this.currentContactID);

    // Show block button
    this.blockBtn.style.display = 'block';
    this.blockBtn.textContent = isBlocked ? 'Unblock' : 'Block';
    this.blockBtn.className = isBlocked ? 'block-btn blocked' : 'block-btn';

    // Disable input if not encrypted or if blocked
    this.messageInput.disabled = !isEncrypted || isBlocked;
    this.sendBtn.disabled = !isEncrypted || isBlocked;
    
    if (isBlocked) {
      this.messageInput.placeholder = 'User is blocked';
    } else if (!isEncrypted) {
      this.messageInput.placeholder = 'Waiting for secure key exchange...';
    } else {
      this.messageInput.placeholder = 'Type your message...';
    }

    this.currentChatInfo.innerHTML = `
      <div>
        <div class="chat-subtitle">${this.currentContactID}${isBlocked ? ' (Blocked)' : ''}</div>
      </div>
    `;
  }

  private toggleBlockContact(contactID: string) {
    const contact = this.contacts.get(contactID);
    if (contact) {
      contact.blocked = !contact.blocked;
      const action = contact.blocked ? 'blocked' : 'unblocked';
      this.addSystemMessage(`User ${action}`);
      this.renderContactsList();
      this.updateChatHeader();
      
      // Clear messages from blocked user
      if (contact.blocked) {
        this.renderMessages();
      }
    }
  }



  private async sendMessage() {
    const content = this.messageInput.value.trim();

    if (!content) {
      return;
    }

    if (!this.currentContactID) {
      this.addSystemMessage('Please select a contact first');
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.addSystemMessage('Not connected to server');
      return;
    }

    // Check if we have the contact's public key
    if (!this.crypto.hasPublicKey(this.currentContactID)) {
      this.addSystemMessage('Waiting for secure key exchange...');
      this.requestPublicKey(this.currentContactID);
      return;
    }

    try {
      // Encrypt and sign the message
      const { encrypted, signature } = await this.crypto.encryptAndSign(this.currentContactID, content);

      const message: ChatMessage = {
        type: 'chatmessage',
        encrypted: encrypted,
        signature: signature,
        toID: this.currentContactID
      };

      this.ws.send(JSON.stringify(message));
      
      const contact = this.contacts.get(this.currentContactID)!;
      contact.messages.push({
        content: content,
        fromID: this.myID,
        timestamp: Date.now()
      });
      contact.lastMessage = content;
      
      this.addMessage(content, this.myID, 'sent');
      this.renderContactsList();
      this.messageInput.value = '';
    } catch (error) {
      console.error('Failed to encrypt message:', error);
      this.addSystemMessage('Failed to encrypt message');
    }
  }

  private addMessage(content: string, _fromID: string, type: 'sent' | 'received', scroll: boolean = true) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = content;

    messageEl.appendChild(contentEl);
    this.messagesContainer.appendChild(messageEl);

    if (scroll) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  private addSystemMessage(content: string) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message system';
    messageEl.textContent = content;
    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private updateStatus(text: string, connected: boolean) {
    this.statusEl.textContent = text;
    this.statusEl.className = connected ? 'connected' : 'disconnected';
  }
}

new CoffeeChatClient();
