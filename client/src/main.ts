/**
 * CoffeeChat Client - Main Application
 * Refactored with service-oriented architecture for scalability
 */

import './style.css';
import { CryptoManager } from './crypto';
import { WebSocketService } from './services/WebSocketService';
import { ContactService } from './services/ContactService';
import { MessageService } from './services/MessageService';
import { NotificationService } from './services/NotificationService';
import { ChatUI } from './ui/ChatUI';
import { ContactListUI } from './ui/ContactListUI';
import type { ChatMessage } from './types';

class CoffeeChatClient {
  private myID: string = '';
  private myPublicKey: string = '';
  private myFingerprint: string = '';

  // Services
  private crypto: CryptoManager;
  private wsService: WebSocketService;
  private contactService: ContactService;
  private messageService: MessageService;
  private notificationService: NotificationService;

  // UI Components
  private chatUI: ChatUI;
  private contactListUI: ContactListUI;

  constructor() {
    // Initialize services
    this.crypto = new CryptoManager();
    this.wsService = new WebSocketService();
    this.contactService = new ContactService();
    this.messageService = new MessageService(this.crypto, this.wsService);
    this.notificationService = new NotificationService();

    // Initialize UI components
    this.chatUI = new ChatUI();
    this.contactListUI = new ContactListUI();

    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Setup WebSocket handlers
    this.wsService.onStatusChange((status, isConnected) => {
      this.chatUI.updateStatus(status, isConnected);
    });

    this.wsService.onMessage((message) => {
      this.handleMessage(message);
    });

    // Setup contact service handlers
    this.contactService.onChange(() => {
      this.renderContacts();
      this.updateChatUI();
    });

    // Setup UI event handlers
    this.setupEventListeners();
    this.setupSecurityHandlers();    // Initialize encryption
    this.chatUI.updateStatus('Initializing encryption...', false);
    this.myPublicKey = await this.crypto.initialize();
    this.myFingerprint = await this.messageService.generateFingerprint(this.myPublicKey);

    this.chatUI.addSystemMessage('End-to-end encryption initialized');
    this.chatUI.addSystemMessage('⚠️ Session is ephemeral - all data lost on reload');

    // Request notification permission
    await this.initializeNotifications();

    // Connect to server
    this.connect();
  }

  private async initializeNotifications(): Promise<void> {
    const permission = await this.notificationService.requestPermission();
    
    if (permission === 'granted') {
      this.chatUI.addSystemMessage('🔔 Notifications enabled');
    } else if (permission === 'denied') {
      this.chatUI.addSystemMessage('🔕 Notifications blocked - enable in browser settings for message alerts');
    } else {
      this.chatUI.addSystemMessage('🔔 Enable notifications to receive message alerts');
    }
  }

  private connect(): void {
    const wsPort = import.meta.env.VITE_WSS_PORT ?? '8080';
    const wsHost = import.meta.env.VITE_WSS_URL ?? (window.location.hostname || 'localhost');
    const wsURL = `wss://${wsHost}:${wsPort}`;
    
    this.wsService.connect(wsURL);
  }

  private async handleMessage(data: ChatMessage): Promise<void> {
    switch (data.type) {
      case 'welcome':
        if (data.userID) {
          this.myID = data.userID;
          this.chatUI.updateMyID(this.myID);
          
          // Send our public key to server
          this.wsService.send({
            type: 'publickey',
            publicKey: this.myPublicKey
          });
        }
        break;

      case 'chatmessage':
        await this.handleChatMessage(data);
        break;

      case 'publickey':
        await this.handlePublicKey(data);
        break;

      case 'error':
        if (data.message) {
          this.chatUI.addSystemMessage(`Error: ${data.message}`);
        }
        break;
    }
  }  private async handleChatMessage(data: ChatMessage): Promise<void> {
    if (!data.fromID || !data.encrypted) return;

    const senderID = data.fromID; // Capture for use in callback
    const contact = this.contactService.getContact(senderID);
    if (contact?.blocked) return;

    try {
      const decryptedContent = await this.messageService.decryptMessage(
        senderID,
        data.encrypted,
        data.signature
      );

      this.contactService.addMessage(senderID, decryptedContent, senderID);

      if (this.contactService.getCurrentContactID() === senderID) {
        this.chatUI.addMessage(decryptedContent, 'received');
      }

      // Show push notification for new messages
      this.notificationService.showMessageNotification(
        senderID,
        decryptedContent,
        () => {
          // Switch to the sender's chat when notification is clicked
          this.contactService.setCurrentContact(senderID);
          const senderContact = this.contactService.getContact(senderID);
          if (senderContact) {
            this.chatUI.renderMessages(senderContact, this.myID);
          }
        }
      );
    } catch (error) {
      this.chatUI.addSystemMessage(`⚠️ Failed to process message - encryption error`);
    }
  }
  private async handlePublicKey(data: ChatMessage): Promise<void> {
    if (!data.fromID || !data.publicKey) return;

    const fingerprint = await this.messageService.generateFingerprint(data.publicKey);

    // Ensure contact exists
    if (!this.contactService.hasContact(data.fromID)) {
      this.contactService.addContact(data.fromID);
    }

    // Store public key
    this.contactService.updateContact(data.fromID, {
      publicKey: data.publicKey,
      publicKeyFingerprint: fingerprint
    });

    await this.messageService.storePublicKey(data.fromID, data.publicKey);

    // Generate combined fingerprint for verification
    const combinedChain = this.messageService.combineFingerprints(this.myFingerprint, fingerprint);

    this.chatUI.addSystemMessage(`🔑 Key received from ${data.fromID.substring(0, 8)}...`);
    this.chatUI.addSystemMessage(`👀 Emoji chain: ${combinedChain} - Ask if it matches theirs`);

    // Show push notification for key exchange
    this.notificationService.showKeyExchangeNotification(data.fromID);
  }

  private setupEventListeners(): void {
    // Send message handler
    this.chatUI.onSendMessage(() => this.sendMessage());

    // Block contact handler
    this.chatUI.onBlockContact(() => {
      const currentID = this.contactService.getCurrentContactID();
      if (currentID) {
        this.contactService.toggleBlock(currentID);
      }
    });

    // Add contact handler
    this.contactListUI.onAddContact(() => this.addContact());

    // Copy ID handler
    this.contactListUI.onCopyID(() => {
      navigator.clipboard.writeText(this.myID).then(() => {
        this.chatUI.addSystemMessage('Your ID copied to clipboard');
      });
    });
  }

  private setupSecurityHandlers(): void {
    window.addEventListener('beforeunload', () => {
      this.messageService.clearCache();
      this.contactService.clear();
      this.chatUI.clearMessages();
      this.myPublicKey = '';
      this.myFingerprint = '';
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.chatUI.clearMessageInput();
      }
    });
  }

  private addContact(): void {
    const contactID = this.contactListUI.getNewContactInput();

    if (!contactID) {
      this.chatUI.addSystemMessage('Please enter a contact ID');
      return;
    }

    if (contactID === this.myID) {
      this.chatUI.addSystemMessage('Cannot add yourself as a contact');
      return;
    }

    if (this.contactService.hasContact(contactID)) {
      this.chatUI.addSystemMessage('Contact already exists');
      return;
    }

    this.contactService.addContact(contactID);
    this.contactService.setCurrentContact(contactID);
    this.contactListUI.clearNewContactInput();

    // Request key exchange
    this.messageService.requestKeyExchange(contactID, this.myPublicKey);
    this.chatUI.addSystemMessage(`Requesting key exchange with ${contactID}...`);
  }

  private switchToContact(contactID: string): void {
    this.contactService.setCurrentContact(contactID);
    
    const contact = this.contactService.getContact(contactID);
    if (contact) {
      this.chatUI.renderMessages(contact, this.myID);
    }
  }

  private async sendMessage(): Promise<void> {
    const content = this.chatUI.getMessageInput().trim();
    const currentContactID = this.contactService.getCurrentContactID();

    if (!content || !currentContactID) return;

    const contact = this.contactService.getContact(currentContactID);
    if (!contact || contact.blocked) return;

    if (!this.messageService.hasPublicKey(currentContactID)) {
      this.chatUI.addSystemMessage('Waiting for key exchange...');
      return;
    }

    try {
      await this.messageService.sendEncryptedMessage(currentContactID, content);
      
      this.contactService.addMessage(currentContactID, content, this.myID);
      this.chatUI.addMessage(content, 'sent');
      this.chatUI.clearMessageInput();
    } catch (error) {
      this.chatUI.addSystemMessage('⚠️ Failed to send message');
    }
  }

  private renderContacts(): void {
    const contacts = this.contactService.getAllContacts();
    const currentContactID = this.contactService.getCurrentContactID();

    this.contactListUI.renderContactsList(
      contacts,
      currentContactID,
      (contactID) => this.switchToContact(contactID)
    );
  }

  private updateChatUI(): void {
    const currentContactID = this.contactService.getCurrentContactID();
    const contact = this.contactService.getCurrentContact();

    this.chatUI.updateChatHeader(
      currentContactID,
      contact?.blocked || false,
      currentContactID ? this.messageService.hasPublicKey(currentContactID) : false
    );
  }
}

// Initialize application after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new CoffeeChatClient();
});
