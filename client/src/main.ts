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
import { PrivacyModeService } from './services/PrivacyModeService';
import { ImageService } from './services/ImageService';
import { UsernameService } from './services/UsernameService';
import { ChatUI } from './ui/ChatUI';
import { ContactListUI } from './ui/ContactListUI';
import type { ChatMessage, ContentType } from './types';

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
  private privacyModeService: PrivacyModeService;
  private imageService: ImageService;
  private usernameService: UsernameService;

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
    this.privacyModeService = new PrivacyModeService();
    this.imageService = new ImageService();
    this.usernameService = new UsernameService();

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
  }  private async handleMessage(data: ChatMessage): Promise<void> {
    switch (data.type) {
      case 'welcome':
        if (data.userID) {
          this.myID = data.userID;
          
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

      case 'usernameSet':
        this.chatUI.addSystemMessage('✅ Username set (hashed on your device)');
        break;

      case 'userFound':
        this.handleUserFound(data);
        break;

      case 'error':
        if (data.message) {
          this.chatUI.addSystemMessage(`Error: ${data.message}`);
        }
        break;
    }
  }private async handleChatMessage(data: ChatMessage): Promise<void> {
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

      // Determine content type
      const contentType: ContentType = this.imageService.isImageMessage(decryptedContent) ? 'image' : 'text';

      this.contactService.addMessage(senderID, decryptedContent, senderID, contentType);

      if (this.contactService.getCurrentContactID() === senderID) {
        this.chatUI.addMessage(decryptedContent, 'received', contentType);
      }

      // Show push notification for new messages
      this.notificationService.showMessageNotification(
        senderID,
        contentType === 'image' ? '🖼️ Image' : decryptedContent,
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
  }  private setupEventListeners(): void {
    // Send message handler
    this.chatUI.onSendMessage(() => this.sendMessage());

    // Send image handler
    this.chatUI.onSendImage(() => this.sendImage());

    // Paste image handler (Ctrl+V)
    this.chatUI.onPasteImage((file) => this.sendImageFromFile(file));    // Block contact handler
    this.chatUI.onBlockContact(() => {
      const currentID = this.contactService.getCurrentContactID();
      if (currentID) {
        this.contactService.toggleBlock(currentID);
      }
    });

    // Set username handler
    this.contactListUI.onSetUsername(() => this.setUsername());

    // Find user handler
    this.contactListUI.onFindUser(() => this.findUser());

    // Privacy mode toggle handler
    this.setupPrivacyMode();
  }

  private setupPrivacyMode(): void {
    const privacyToggle = document.getElementById('privacyToggle');
    
    if (privacyToggle) {
      // Initialize UI state
      this.privacyModeService.initialize();
      this.updatePrivacyToggleUI(privacyToggle, this.privacyModeService.isEnabled());

      // Toggle on click
      privacyToggle.addEventListener('click', () => {
        const isEnabled = this.privacyModeService.toggle();
        this.updatePrivacyToggleUI(privacyToggle, isEnabled);
        
        if (isEnabled) {
          this.chatUI.addSystemMessage('🙈 Privacy Mode ON - Messages hidden until hover');
        } else {
          this.chatUI.addSystemMessage('🐵 Privacy Mode OFF - Messages visible');
        }
      });

      // Listen for changes (e.g., keyboard shortcut in the future)
      this.privacyModeService.onChange((isEnabled) => {
        this.updatePrivacyToggleUI(privacyToggle, isEnabled);
      });
    }
  }

  private updatePrivacyToggleUI(button: HTMLElement, isEnabled: boolean): void {
    const icon = button.querySelector('.icon');
    
    if (isEnabled) {
      button.classList.add('active');
      button.title = 'Disable Privacy Mode';
      if (icon) icon.textContent = '🙈';
    } else {
      button.classList.remove('active');
      button.title = 'Enable Privacy Mode';
      if (icon) icon.textContent = '🐵';
    }
  }
  private setupSecurityHandlers(): void {
    window.addEventListener('beforeunload', () => {
      this.messageService.clearCache();
      this.contactService.clear();
      this.chatUI.clearMessages();
      this.usernameService.clear();
      this.myPublicKey = '';
      this.myFingerprint = '';
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.chatUI.clearMessageInput();
      }
    });
  }  /**
   * Set username - hashed client-side before sending to server
   */
  private async setUsername(): Promise<void> {
    const username = this.contactListUI.getUsernameInput();

    if (!username) {
      this.chatUI.addSystemMessage('Please enter a username');
      return;
    }

    if (username.length < 2 || username.length > 32) {
      this.chatUI.addSystemMessage('Username must be 2-32 characters');
      return;
    }

    try {
      // Hash username client-side for privacy
      const usernameHash = await this.usernameService.setUsername(username);
      
      // Send only the hash to server - server never sees actual username
      this.wsService.send({
        type: 'setusername',
        usernameHash: usernameHash
      });

      this.chatUI.addSystemMessage(`🔐 Username "${username}" hashed and sent to server`);
    } catch (error) {
      this.chatUI.addSystemMessage('⚠️ Failed to set username');
    }
  }

  /**
   * Find user by username - username is hashed client-side before lookup
   */
  private async findUser(): Promise<void> {
    const username = this.contactListUI.getFindUsernameInput();

    if (!username) {
      this.chatUI.addSystemMessage('Please enter a username to find');
      return;
    }

    try {
      // Hash the username we're searching for (same algorithm as setting)
      const usernameHash = await this.usernameService.hashUsername(username);
      
      // Send hash to server for lookup - server never sees actual username
      this.wsService.send({
        type: 'finduser',
        usernameHash: usernameHash
      });

      this.chatUI.addSystemMessage(`🔍 Searching for user "${username}"...`);
    } catch (error) {
      this.chatUI.addSystemMessage('⚠️ Failed to search for user');
    }
  }

  /**
   * Handle user found response from server  /**
   * Handle user found response from server
   */
  private handleUserFound(data: ChatMessage): void {
    const searchedUsername = this.contactListUI.getFindUsernameInput();
    
    if (data.userID) {
      this.chatUI.addSystemMessage(`✅ Found "${searchedUsername}"!`);
      
      // Auto-add as contact if not already added
      if (!this.contactService.hasContact(data.userID) && data.userID !== this.myID) {
        this.contactService.addContact(data.userID);
        
        // Store the username we searched for with this contact
        this.contactService.updateContact(data.userID, { username: searchedUsername });
        
        this.contactService.setCurrentContact(data.userID);
        this.contactListUI.clearFindUsernameInput();
        
        // Request key exchange
        this.messageService.requestKeyExchange(data.userID, this.myPublicKey);
        this.chatUI.addSystemMessage(`Added "${searchedUsername}" as contact. Requesting key exchange...`);
      } else if (data.userID === this.myID) {
        this.chatUI.addSystemMessage(`That's you!`);
      } else {
        this.chatUI.addSystemMessage(`"${searchedUsername}" is already in your contacts`);
      }
    } else {
      this.chatUI.addSystemMessage('❌ User not found or not online');
    }
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
      
      this.contactService.addMessage(currentContactID, content, this.myID, 'text');
      this.chatUI.addMessage(content, 'sent', 'text');
      this.chatUI.clearMessageInput();
    } catch (error) {
      this.chatUI.addSystemMessage('⚠️ Failed to send message');
    }
  }

  private async sendImage(): Promise<void> {
    const currentContactID = this.contactService.getCurrentContactID();

    if (!currentContactID) {
      this.chatUI.addSystemMessage('Select a contact first');
      return;
    }

    const contact = this.contactService.getContact(currentContactID);
    if (!contact || contact.blocked) return;

    if (!this.messageService.hasPublicKey(currentContactID)) {
      this.chatUI.addSystemMessage('Waiting for key exchange...');
      return;
    }

    try {
      // Open image picker and process image
      const processedImage = await this.imageService.selectImage();
      
      if (!processedImage) {
        return; // User cancelled
      }

      this.chatUI.addSystemMessage('📤 Encrypting and sending image...');

      // Wrap image as message content
      const imageContent = this.imageService.wrapImageAsMessage(processedImage.dataUrl);

      // Send encrypted image
      await this.messageService.sendEncryptedMessage(currentContactID, imageContent);
      
      // Add to local history
      this.contactService.addMessage(currentContactID, imageContent, this.myID, 'image');
      this.chatUI.addMessage(imageContent, 'sent', 'image');      const savings = Math.round((1 - processedImage.compressedSize / processedImage.originalSize) * 100);
      this.chatUI.addSystemMessage(`✅ Image sent (${Math.round(processedImage.compressedSize / 1024)}KB${savings > 0 ? `, ${savings}% compressed` : ''})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.chatUI.addSystemMessage(`⚠️ Failed to send image: ${errorMessage}`);
    }
  }

  /**
   * Send an image from a File object (used for paste support)
   */
  private async sendImageFromFile(file: File): Promise<void> {
    const currentContactID = this.contactService.getCurrentContactID();

    if (!currentContactID) {
      this.chatUI.addSystemMessage('Select a contact first');
      return;
    }

    const contact = this.contactService.getContact(currentContactID);
    if (!contact || contact.blocked) return;

    if (!this.messageService.hasPublicKey(currentContactID)) {
      this.chatUI.addSystemMessage('Waiting for key exchange...');
      return;
    }

    try {
      // Process the pasted image
      const processedImage = await this.imageService.processImage(file);

      this.chatUI.addSystemMessage('📤 Encrypting and sending pasted image...');

      // Wrap image as message content
      const imageContent = this.imageService.wrapImageAsMessage(processedImage.dataUrl);

      // Send encrypted image
      await this.messageService.sendEncryptedMessage(currentContactID, imageContent);

      // Add to local history
      this.contactService.addMessage(currentContactID, imageContent, this.myID, 'image');
      this.chatUI.addMessage(imageContent, 'sent', 'image');

      const savings = Math.round((1 - processedImage.compressedSize / processedImage.originalSize) * 100);
      this.chatUI.addSystemMessage(`✅ Image sent (${Math.round(processedImage.compressedSize / 1024)}KB${savings > 0 ? `, ${savings}% compressed` : ''})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.chatUI.addSystemMessage(`⚠️ Failed to send image: ${errorMessage}`);
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
