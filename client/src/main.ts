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
import { GroupService } from './services/GroupService';
import { ChatUI } from './ui/ChatUI';
import { ContactListUI } from './ui/ContactListUI';
import { GroupListUI } from './ui/GroupListUI';
import type { ChatMessage, ContentType, Group } from './types';

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
  private groupService: GroupService;

  // UI Components
  private chatUI: ChatUI;
  private contactListUI: ContactListUI;
  private groupListUI: GroupListUI;

  // Track whether we're viewing a group or contact
  private viewingGroup: boolean = false;

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
    this.groupService = new GroupService();

    // Initialize UI components
    this.chatUI = new ChatUI();
    this.contactListUI = new ContactListUI();
    this.groupListUI = new GroupListUI();

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

    // Setup group service handlers
    this.groupService.onChange(() => {
      this.renderGroups();
      this.updateChatUI();
    });

    // Setup UI event handlers
    this.setupEventListeners();
    this.setupGroupEventListeners();
    this.setupSecurityHandlers();// Initialize encryption
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
        break;      case 'groupcreated':
        await this.handleGroupCreated(data);
        break;

      case 'groupmessage':
        await this.handleGroupMessage(data);
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
  }  private setupSecurityHandlers(): void {
    window.addEventListener('beforeunload', () => {
      this.messageService.clearCache();
      this.contactService.clear();
      this.groupService.clear();
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
    } else {      this.chatUI.addSystemMessage('❌ User not found or not online');
    }
  }

  private async sendMessage(): Promise<void> {
    // Handle group messages differently
    if (this.viewingGroup) {
      await this.sendGroupMessage();
      return;
    }

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
    // Handle group image sending
    if (this.viewingGroup) {
      await this.sendGroupImage();
      return;
    }

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
    // Handle group image sending
    if (this.viewingGroup) {
      await this.sendGroupImageFromFile(file);
      return;
    }

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
    const currentContactID = this.viewingGroup ? null : this.contactService.getCurrentContactID();

    this.contactListUI.renderContactsList(
      contacts,
      currentContactID,
      (contactID) => this.switchToContact(contactID)
    );
  }

  private renderGroups(): void {
    const groups = this.groupService.getAllGroups();
    const currentGroupID = this.viewingGroup ? this.groupService.getCurrentGroupID() : null;

    this.groupListUI.renderGroupsList(
      groups,
      currentGroupID,
      (groupID) => this.switchToGroup(groupID)
    );
  }

  private updateChatUI(): void {
    if (this.viewingGroup) {
      const currentGroupID = this.groupService.getCurrentGroupID();
      const group = this.groupService.getCurrentGroup();

      if (currentGroupID && group) {
        this.chatUI.updateGroupHeader(group.name, group.memberIDs.length);
      } else {
        this.chatUI.updateChatHeader(null, false, false);
      }
    } else {
      const currentContactID = this.contactService.getCurrentContactID();
      const contact = this.contactService.getCurrentContact();

      this.chatUI.updateChatHeader(
        currentContactID,
        contact?.blocked || false,
        currentContactID ? this.messageService.hasPublicKey(currentContactID) : false
      );
    }
  }

  // ==================== Group Methods ====================

  private setupGroupEventListeners(): void {
    // Show create group modal
    this.groupListUI.onCreateGroupClick(() => {
      const contacts = this.contactService.getAllContacts();
      this.groupListUI.showModal(contacts);
    });

    // Confirm group creation
    this.groupListUI.onConfirmCreateGroup(() => this.createGroup());
  }

  private async createGroup(): Promise<void> {
    const groupName = this.groupListUI.getGroupNameInput();
    const selectedMemberIDs = this.groupListUI.getSelectedMemberIDs();

    if (!groupName) {
      this.chatUI.addSystemMessage('Please enter a group name');
      return;
    }

    if (groupName.length < 1 || groupName.length > 32) {
      this.chatUI.addSystemMessage('Group name must be 1-32 characters');
      return;
    }

    if (selectedMemberIDs.length === 0) {
      this.chatUI.addSystemMessage('Please select at least one member');
      return;
    }

    // Add ourselves to the member list
    const allMemberIDs = [this.myID, ...selectedMemberIDs];

    // Create group locally
    const group = this.groupService.createGroup(groupName, allMemberIDs, this.myID);

    // Send group creation to server (to notify other members)
    this.wsService.send({
      type: 'creategroup',
      groupID: group.id,
      groupName: group.name,
      memberIDs: group.memberIDs,
      creatorID: this.myID
    });    this.groupListUI.hideModal();
    this.chatUI.addSystemMessage(`✅ Group "${groupName}" created with ${selectedMemberIDs.length} members`);

    // Exchange keys with all group members who we don't have keys for
    await this.exchangeKeysWithGroupMembers(group.memberIDs);

    // Switch to the new group
    this.switchToGroup(group.id);
  }

  /**
   * Exchange encryption keys with all group members
   * Ensures we can encrypt/decrypt messages for everyone in the group
   */
  private async exchangeKeysWithGroupMembers(memberIDs: string[]): Promise<void> {
    for (const memberID of memberIDs) {
      // Skip ourselves
      if (memberID === this.myID) continue;

      // Check if we already have their public key
      if (!this.messageService.hasPublicKey(memberID)) {
        // Ensure they exist as a contact (for key storage)
        if (!this.contactService.hasContact(memberID)) {
          this.contactService.addContact(memberID);
        }

        // Request key exchange
        await this.messageService.requestKeyExchange(memberID, this.myPublicKey);
        this.chatUI.addSystemMessage(`🔑 Requesting key from group member ${memberID.substring(0, 8)}...`);
      }
    }
  }
  private async handleGroupCreated(data: ChatMessage): Promise<void> {
    if (!data.groupID || !data.groupName || !data.memberIDs || !data.creatorID) return;

    // Don't duplicate if we created it
    if (this.groupService.hasGroup(data.groupID)) return;

    // Add the group
    this.groupService.addGroup({
      id: data.groupID,
      name: data.groupName,
      memberIDs: data.memberIDs,
      creatorID: data.creatorID,
      createdAt: Date.now(),
      messages: []
    });

    const creatorName = data.creatorID === this.myID ? 'You' : data.creatorID.substring(0, 8) + '...';
    this.chatUI.addSystemMessage(`👥 Added to group "${data.groupName}" by ${creatorName}`);

    // Exchange keys with all group members to enable encryption
    await this.exchangeKeysWithGroupMembers(data.memberIDs);
  }

  private async handleGroupMessage(data: ChatMessage): Promise<void> {
    if (!data.groupID || !data.fromID || !data.encrypted) return;

    const group = this.groupService.getGroup(data.groupID);
    if (!group) return;

    // Verify sender is a member
    if (!group.memberIDs.includes(data.fromID)) return;

    try {
      const decryptedContent = await this.messageService.decryptMessage(
        data.fromID,
        data.encrypted,
        data.signature
      );

      const contentType: ContentType = this.imageService.isImageMessage(decryptedContent) ? 'image' : 'text';
      
      // Get sender's username from contacts
      const senderContact = this.contactService.getContact(data.fromID);
      const senderUsername = senderContact?.username;

      this.groupService.addMessage(data.groupID, decryptedContent, data.fromID, senderUsername, contentType);      // If viewing this group, show the message
      if (this.viewingGroup && this.groupService.getCurrentGroupID() === data.groupID) {
        this.chatUI.addGroupMessage(decryptedContent, data.fromID, senderUsername || '', 'received', contentType);
      }

      // Show notification
      this.notificationService.showMessageNotification(
        `${group.name}`,
        contentType === 'image' ? '🖼️ Image' : decryptedContent,
        () => this.switchToGroup(data.groupID!)
      );
    } catch (error) {
      this.chatUI.addSystemMessage(`⚠️ Failed to decrypt group message`);
    }
  }

  private switchToGroup(groupID: string): void {
    this.viewingGroup = true;
    this.contactService.setCurrentContact(null); // Deselect contact
    this.groupService.setCurrentGroup(groupID);

    const group = this.groupService.getGroup(groupID);
    if (group) {
      this.renderGroupMessages(group);
    }

    this.renderContacts(); // Update UI to show no contact selected
    this.renderGroups(); // Update UI to show group selected
  }

  private switchToContact(contactID: string): void {
    this.viewingGroup = false;
    this.groupService.setCurrentGroup(null); // Deselect group
    this.contactService.setCurrentContact(contactID);
    
    const contact = this.contactService.getContact(contactID);
    if (contact) {
      this.chatUI.renderMessages(contact, this.myID);
    }

    this.renderContacts();
    this.renderGroups();
  }

  private renderGroupMessages(group: Group): void {
    this.chatUI.clearMessages();
      group.messages.forEach((msg) => {
      const contentType = msg.contentType || 'text';
      if (msg.fromID === this.myID) {
        this.chatUI.addMessage(msg.content, 'sent', contentType);
      } else {
        this.chatUI.addGroupMessage(msg.content, msg.fromID, msg.fromUsername || '', 'received', contentType);
      }
    });
  }

  private async sendGroupMessage(): Promise<void> {
    const content = this.chatUI.getMessageInput().trim();
    const currentGroupID = this.groupService.getCurrentGroupID();

    if (!content || !currentGroupID) return;

    const group = this.groupService.getGroup(currentGroupID);
    if (!group) return;

    // Get other members (exclude self)
    const otherMembers = group.memberIDs.filter(id => id !== this.myID);

    // Check we have keys for all members
    for (const memberID of otherMembers) {
      if (!this.messageService.hasPublicKey(memberID)) {
        this.chatUI.addSystemMessage(`⚠️ Missing encryption key for a member. Cannot send.`);
        return;
      }
    }

    try {
      // Encrypt message for each member (pairwise encryption)
      const encryptedPayloads: Array<{ toID: string; encrypted: string; signature: string }> = [];

      for (const memberID of otherMembers) {
        const { encrypted, signature } = await this.crypto.encryptAndSign(memberID, content);
        encryptedPayloads.push({ toID: memberID, encrypted, signature });
      }

      // Send to server
      this.wsService.send({
        type: 'groupmessage',
        groupID: currentGroupID,
        encryptedPayloads
      });      // Add to local history
      const myUsername = this.usernameService.getUsername();
      this.groupService.addMessage(currentGroupID, content, this.myID, myUsername, 'text');
      this.chatUI.addMessage(content, 'sent', 'text');
      this.chatUI.clearMessageInput();
    } catch (error) {
      this.chatUI.addSystemMessage('⚠️ Failed to send group message');
    }
  }

  /**
   * Send an image to the current group
   */
  private async sendGroupImage(): Promise<void> {
    const currentGroupID = this.groupService.getCurrentGroupID();
    if (!currentGroupID) {
      this.chatUI.addSystemMessage('Select a group first');
      return;
    }

    try {
      const processedImage = await this.imageService.selectImage();
      if (!processedImage) return;

      const imageContent = this.imageService.wrapImageAsMessage(processedImage.dataUrl);
      await this.sendGroupContent(currentGroupID, imageContent, 'image');

      const savings = Math.round((1 - processedImage.compressedSize / processedImage.originalSize) * 100);
      this.chatUI.addSystemMessage(`✅ Image sent (${Math.round(processedImage.compressedSize / 1024)}KB${savings > 0 ? `, ${savings}% compressed` : ''})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.chatUI.addSystemMessage(`⚠️ Failed to send image: ${errorMessage}`);
    }
  }

  /**
   * Send an image from File to the current group (paste support)
   */
  private async sendGroupImageFromFile(file: File): Promise<void> {
    const currentGroupID = this.groupService.getCurrentGroupID();
    if (!currentGroupID) {
      this.chatUI.addSystemMessage('Select a group first');
      return;
    }

    try {
      const processedImage = await this.imageService.processImage(file);
      const imageContent = this.imageService.wrapImageAsMessage(processedImage.dataUrl);
      
      this.chatUI.addSystemMessage('📤 Encrypting and sending pasted image...');
      await this.sendGroupContent(currentGroupID, imageContent, 'image');

      const savings = Math.round((1 - processedImage.compressedSize / processedImage.originalSize) * 100);
      this.chatUI.addSystemMessage(`✅ Image sent (${Math.round(processedImage.compressedSize / 1024)}KB${savings > 0 ? `, ${savings}% compressed` : ''})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.chatUI.addSystemMessage(`⚠️ Failed to send image: ${errorMessage}`);
    }
  }

  /**
   * Send content (text or image) to a group with pairwise encryption
   */
  private async sendGroupContent(groupID: string, content: string, contentType: ContentType): Promise<void> {
    const group = this.groupService.getGroup(groupID);
    if (!group) throw new Error('Group not found');

    const otherMembers = group.memberIDs.filter(id => id !== this.myID);

    // Check we have keys for all members
    for (const memberID of otherMembers) {
      if (!this.messageService.hasPublicKey(memberID)) {
        throw new Error('Missing encryption key for a member');
      }
    }

    // Encrypt for each member
    const encryptedPayloads: Array<{ toID: string; encrypted: string; signature: string }> = [];
    for (const memberID of otherMembers) {
      const { encrypted, signature } = await this.crypto.encryptAndSign(memberID, content);
      encryptedPayloads.push({ toID: memberID, encrypted, signature });
    }

    // Send to server
    this.wsService.send({
      type: 'groupmessage',
      groupID,
      encryptedPayloads
    });

    // Add to local history
    const myUsername = this.usernameService.getUsername();
    this.groupService.addMessage(groupID, content, this.myID, myUsername, contentType);
    this.chatUI.addMessage(content, 'sent', contentType);
  }
}

// Initialize application after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new CoffeeChatClient();
});
