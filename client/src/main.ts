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
  publicKeyFingerprint?: string;
  isVerified?: boolean;
  blocked?: boolean;
}

class CoffeeChatClient {
  private ws: WebSocket | null = null;
  private myID: string = '';
  private currentContactID: string | null = null;
  private contacts: Map<string, Contact> = new Map();
  private crypto: CryptoManager = new CryptoManager();
  private myPublicKey: string = '';
  private myFingerprint: string = '';

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
    console.log('[INIT] My public key (first 50 chars):', this.myPublicKey.substring(0, 50), '...');
    this.myFingerprint = await this.crypto.generateEmojiFingerprint(this.myPublicKey);
    console.log('[INIT] My fingerprint:', this.myFingerprint, '(from key hash)');
    
    // Don't display fingerprint bar - only show in system messages
    // this.displayMyFingerprint();
    
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
        // Received public key from a contact - display fingerprint for optional verification
        if (data.fromID && data.publicKey) {
          console.log('[PUBLICKEY] Received from', data.fromID, 'key (first 50 chars):', data.publicKey.substring(0, 50), '...');
          const fingerprint = await this.crypto.generateEmojiFingerprint(data.publicKey);
          console.log('[PUBLICKEY] Generated fingerprint for', data.fromID, ':', fingerprint, '(should not match my own)');
          
          // Ensure contact exists
          if (!this.contacts.has(data.fromID)) {
            this.addContact(data.fromID);
          }
          
          // Store the public key in the contact
          const contact = this.contacts.get(data.fromID)!;
          contact.publicKey = data.publicKey;
          contact.publicKeyFingerprint = fingerprint;
          
          // Store public key for encryption
          await this.crypto.storePublicKey(data.fromID, data.publicKey);
          
          // Generate combined fingerprint for verification
          const combinedChain = this.combineFingerprints(this.myFingerprint, fingerprint);
          
          this.addSystemMessage(`🔑 Key received from ${data.fromID.substring(0, 8)}...`);
          this.addSystemMessage(`👀 Emoji chain: ${combinedChain} - Ask if it matches theirs`);
          this.renderContactsList();
          this.updateChatHeader();
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
      this.addSystemMessage(`Added ${contactID.substring(0, 8)}... - requesting encryption keys...`);
      
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
      if (contact.isVerified) {
        contactEl.className += ' verified';
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'contact-name';
      const displayName = contact.id.substring(0, 10) + (contact.id.length > 10 ? '...' : '');
      
      let statusIndicator = '';
      if (contact.blocked) {
        statusIndicator = '🚫';
      } else if (contact.isVerified) {
        statusIndicator = '✅';
      } else if (contact.publicKey) {
        statusIndicator = '🔐';
      } else {
        statusIndicator = '⏳';
      }
      
      nameEl.textContent = `${statusIndicator} ${displayName}`;

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
    const hasPublicKey = this.crypto.hasPublicKey(this.currentContactID);

    // Show block button
    this.blockBtn.style.display = 'block';
    this.blockBtn.textContent = isBlocked ? 'Unblock' : 'Block';
    this.blockBtn.className = isBlocked ? 'block-btn blocked' : 'block-btn';

    // Allow messaging if not blocked (even if not verified)
    this.messageInput.disabled = isBlocked;
    this.sendBtn.disabled = isBlocked;
    
    if (isBlocked) {
      this.messageInput.placeholder = 'User is blocked';
    } else if (!hasPublicKey) {
      this.messageInput.placeholder = 'Requesting secure key exchange...';
    } else {
      this.messageInput.placeholder = 'Type your message...';
    }

    // Build header without fingerprint display
    let headerHTML = `
      <div class="chat-header-content">
        <div class="chat-subtitle">${this.currentContactID}${isBlocked ? ' 🚫' : ''}</div>
    `;

    if (!hasPublicKey) {
      headerHTML += '<div class="fingerprint-header"><span class="text-secondary">⏳ Exchanging keys...</span></div>';
    }

    headerHTML += '</div>';
    this.currentChatInfo.innerHTML = headerHTML;
  }


  /**
   * Combine two emoji fingerprints into a single sorted chain
   * Splits both chains, combines them, and sorts for a canonical representation
   */
  private combineFingerprints(chain1: string, chain2: string): string {
    // Split by spaces and combine
    const emojis1 = chain1.split(' ').filter(e => e.length > 0);
    const emojis2 = chain2.split(' ').filter(e => e.length > 0);
    const combined = [...emojis1, ...emojis2];
    
    // Sort by Unicode code point for consistent ordering
    const sorted = combined.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));
    
    return sorted.join(' ');
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
      
      const updatedContact = this.contacts.get(this.currentContactID)!;
      updatedContact.messages.push({
        content: content,
        fromID: this.myID,
        timestamp: Date.now()
      });
      updatedContact.lastMessage = content;
      
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
