/**
 * CoffeeCHAT v2 - Main Application
 */

import './styles.css';

import type { 
  Contact, Group, Message, ContentType,
  WSWelcome, WSChatMessage, WSGroupMessage, WSGroupCreated, 
  WSGroupMemberAdded, WSUserFound, WSError, WSUsernameChanged
} from './types';

import { eventBus } from './services/EventEmitter';
import { storage } from './services/StorageService';
import { wsService } from './services/WebSocketService';
import { contactService } from './services/ContactService';
import { groupService } from './services/GroupService';
import { imageService } from './services/ImageService';
import { notificationService } from './services/NotificationService';
import { generateID } from './utils/helpers';

import { ChatUI } from './ui/ChatUI';
import { SidebarUI } from './ui/SidebarUI';
import { ModalsUI } from './ui/ModalsUI';
import { HeaderUI } from './ui/HeaderUI';

class CoffeeChatApp {
  private myUsername: string = '';
  
  private currentView: 'contact' | 'group' | null = null;
  private currentID: string | null = null;  // username for contacts, groupID for groups

  // UI Components
  private chatUI: ChatUI;
  private sidebarUI: SidebarUI;
  private modalsUI: ModalsUI;
  private headerUI: HeaderUI;

  constructor() {
    this.chatUI = new ChatUI();
    this.sidebarUI = new SidebarUI();
    this.modalsUI = new ModalsUI();
    this.headerUI = new HeaderUI();

    this.setupEventListeners();
    this.setupWSHandlers();
    
    // Request notification permission
    notificationService.requestPermission();
    
    // Connect to server
    wsService.connect();
  }

  // ==================== Event Listeners ====================

  private setupEventListeners(): void {
    // Header
    this.headerUI.onFireClick(() => this.modalsUI.showFireModal());

    // Sidebar
    this.sidebarUI.onSetUsername(() => this.changeUsername());
    this.sidebarUI.onAddContact(() => this.addContact());
    this.sidebarUI.onCreateGroup(() => this.showCreateGroupModal());
    this.sidebarUI.onSelectContact((username) => this.selectContact(username));
    this.sidebarUI.onSelectGroup((id) => this.selectGroup(id));

    // Chat
    this.chatUI.onSend(() => this.sendMessage());
    this.chatUI.onSendImage(() => this.sendImage());
    this.chatUI.onPaste((file) => this.sendImageFile(file));
    this.chatUI.onBlock(() => this.toggleBlock());
    this.chatUI.onAddMember(() => this.showAddMemberModal());

    // Modals
    this.modalsUI.onConfirmCreateGroup(() => this.createGroup());
    this.modalsUI.onCancelCreateGroup(() => this.modalsUI.hideCreateGroup());
    this.modalsUI.onConfirmAddMember(() => this.addMembers());
    this.modalsUI.onCancelAddMember(() => this.modalsUI.hideAddMember());
    this.modalsUI.onConfirmFire(() => this.fireAll());
    this.modalsUI.onCancelFire(() => this.modalsUI.hideFireModal());
    this.modalsUI.onCloseImage(() => this.modalsUI.hideImage());

    // Storage events
    eventBus.on('contact:added', () => this.renderContacts());
    eventBus.on('contact:updated', () => this.renderContacts());
    eventBus.on('contact:removed', () => this.renderContacts());
    eventBus.on('group:added', () => this.renderGroups());
    eventBus.on('group:updated', () => this.renderGroups());
    eventBus.on('group:removed', () => this.renderGroups());

    // Connection status
    eventBus.on('connection:status', (status) => {
      this.headerUI.setStatus(status as 'connected' | 'disconnected' | 'connecting');
    });
  }

  // ==================== WebSocket Handlers ====================

  private setupWSHandlers(): void {
    eventBus.on('ws:welcome', (data) => this.handleWelcome(data as WSWelcome));
    eventBus.on('ws:chatmessage', (data) => this.handleChatMessage(data as WSChatMessage));
    eventBus.on('ws:groupmessage', (data) => this.handleGroupMessage(data as WSGroupMessage));
    eventBus.on('ws:groupcreated', (data) => this.handleGroupCreated(data as WSGroupCreated));
    eventBus.on('ws:groupmemberadded', (data) => this.handleMemberAdded(data as WSGroupMemberAdded));
    eventBus.on('ws:userfound', (data) => this.handleUserFound(data as WSUserFound));
    eventBus.on('ws:usernamechanged', (data) => this.handleUsernameChanged(data as WSUsernameChanged));
    eventBus.on('ws:error', (data) => this.handleError(data as WSError));
  }

  private async handleWelcome(data: WSWelcome): Promise<void> {
    this.myUsername = data.username;
    
    // Initialize storage with username
    await storage.initialize(this.myUsername);
    
    // Update UI
    this.sidebarUI.setUsername(this.myUsername);
    this.sidebarUI.enableUsernameEdit();  // Allow changing username
    this.chatUI.addSystemMessage(`Connected as ${this.myUsername}`);
    
    // Render stored data
    this.renderContacts();
    this.renderGroups();
  }

  private handleChatMessage(data: WSChatMessage): void {
    if (!data.from || !data.content) return;

    // Ensure contact exists
    if (!contactService.has(data.from)) {
      contactService.add(data.from);
    }

    // Add message
    const message = contactService.addMessage(
      data.from,
      data.content,
      data.from,
      data.contentType || 'text'
    );

    // Show in UI if viewing this contact
    if (this.currentView === 'contact' && this.currentID === data.from) {
      this.chatUI.addMessage(message, 'received');
      this.chatUI.scrollToBottom();
    }

    // Notification
    notificationService.showMessage(
      data.from,
      data.contentType === 'image' ? '🖼️ Image' : data.content,
      () => this.selectContact(data.from!)
    );

    this.renderContacts();
  }

  private handleGroupMessage(data: WSGroupMessage): void {
    if (!data.groupID || !data.from || !data.content) return;

    const group = groupService.get(data.groupID);
    if (!group) return;

    // Verify sender is a member
    if (!group.members.includes(data.from)) return;

    // Add message
    const message = groupService.addMessage(
      data.groupID,
      data.content,
      data.from,
      data.contentType || 'text'
    );

    // Show in UI if viewing this group
    if (this.currentView === 'group' && this.currentID === data.groupID) {
      this.chatUI.addMessage(message, 'received', true);
      this.chatUI.scrollToBottom();
    }

    // Notification
    notificationService.showMessage(
      group.name,
      data.contentType === 'image' ? '🖼️ Image' : data.content,
      () => this.selectGroup(data.groupID)
    );

    this.renderGroups();
  }

  private handleGroupCreated(data: WSGroupCreated): void {
    if (!data.groupID || !data.groupName || !data.members) return;

    // Don't duplicate
    if (groupService.has(data.groupID)) return;

    const group: Group = {
      id: data.groupID,
      name: data.groupName,
      members: data.members,
      creator: data.creator,
      createdAt: Date.now(),
      messages: [],
      unreadCount: 0
    };

    groupService.add(group);
    
    const creatorName = data.creator === this.myUsername 
      ? 'You' 
      : data.creator;
    this.chatUI.addSystemMessage(`👥 Added to "${data.groupName}" by ${creatorName}`);
    
    this.renderGroups();
  }

  private handleMemberAdded(data: WSGroupMemberAdded): void {
    if (!data.groupID || !data.members) return;

    const group = groupService.get(data.groupID);
    if (!group) return;

    groupService.addMembers(data.groupID, data.members);
    
    // Update UI if viewing this group
    if (this.currentView === 'group' && this.currentID === data.groupID) {
      const updatedGroup = groupService.get(data.groupID);
      if (updatedGroup) {
        this.chatUI.showGroup(updatedGroup, this.myUsername);
      }
    }

    this.chatUI.addSystemMessage(`👥 New members added to "${group.name}"`);
  }

  private handleUserFound(data: WSUserFound): void {
    if (!data.username) return;

    // Add as contact if not exists
    if (!contactService.has(data.username)) {
      contactService.add(data.username);
      const status = data.isOnline ? '(online)' : '(offline)';
      this.chatUI.addSystemMessage(`✅ Found user: ${data.username} ${status}`);
      this.renderContacts();
    } else {
      this.chatUI.addSystemMessage(`ℹ️ User already in contacts`);
    }
  }

  private handleUsernameChanged(data: WSUsernameChanged): void {
    this.myUsername = data.newUsername;
    storage.setUsername(data.newUsername);
    this.sidebarUI.setUsername(data.newUsername);
    this.chatUI.addSystemMessage(`✅ Username changed to "${data.newUsername}"`);
  }

  private handleError(data: WSError): void {
    this.chatUI.addSystemMessage(`⚠️ ${data.message}`);
  }

  // ==================== User Actions ====================

  private async changeUsername(): Promise<void> {
    const username = this.sidebarUI.getUsernameInput();
    
    if (!username || username.length < 2 || username.length > 32) {
      this.chatUI.addSystemMessage('Username must be 2-32 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_#-]+$/.test(username)) {
      this.chatUI.addSystemMessage('Username can only contain letters, numbers, _, -, #');
      return;
    }

    // Send change request to server
    wsService.send({ type: 'setusername', username });
    this.chatUI.addSystemMessage(`🔄 Requesting username change to "${username}"...`);
  }

  private async addContact(): Promise<void> {
    const input = this.sidebarUI.getAddContactInput();
    if (!input) return;

    // Check if it looks like a username
    const username = input.startsWith('@') ? input.substring(1) : input;
    
    if (!username || username.length < 1) {
      this.chatUI.addSystemMessage('Enter a username');
      return;
    }

    // Search for user
    wsService.send({ type: 'finduser', username });
    this.chatUI.addSystemMessage(`🔍 Searching for ${username}...`);

    this.sidebarUI.clearAddContactInput();
  }

  private selectContact(username: string): void {
    this.currentView = 'contact';
    this.currentID = username;
    
    contactService.setCurrent(username);
    groupService.setCurrent(null);
    
    const contact = contactService.get(username);
    if (contact) {
      this.chatUI.showContact(contact, this.myUsername);
      this.chatUI.focusInput();
    }
    
    this.renderContacts();
    this.renderGroups();
    this.sidebarUI.switchTab('contacts');
  }

  private selectGroup(id: string): void {
    this.currentView = 'group';
    this.currentID = id;
    
    groupService.setCurrent(id);
    contactService.setCurrent(null);
    
    const group = groupService.get(id);
    if (group) {
      this.chatUI.showGroup(group, this.myUsername);
      this.chatUI.focusInput();
    }
    
    this.renderContacts();
    this.renderGroups();
    this.sidebarUI.switchTab('groups');
  }

  private async sendMessage(): Promise<void> {
    const content = this.chatUI.getInputValue();
    if (!content) return;

    if (this.currentView === 'contact' && this.currentID) {
      await this.sendContactMessage(content, 'text');
    } else if (this.currentView === 'group' && this.currentID) {
      await this.sendGroupMessage(content, 'text');
    }
  }

  private async sendImage(): Promise<void> {
    try {
      const processed = await imageService.selectImage();
      if (!processed) return;

      this.chatUI.addSystemMessage('📤 Sending image...');

      if (this.currentView === 'contact' && this.currentID) {
        await this.sendContactMessage(processed.dataUrl, 'image');
      } else if (this.currentView === 'group' && this.currentID) {
        await this.sendGroupMessage(processed.dataUrl, 'image');
      }
    } catch (error) {
      this.chatUI.addSystemMessage('⚠️ Failed to send image');
    }
  }

  private async sendImageFile(file: File): Promise<void> {
    if (!this.currentView || !this.currentID) {
      this.chatUI.addSystemMessage('Select a conversation first');
      return;
    }

    try {
      const processed = await imageService.processImage(file);
      this.chatUI.addSystemMessage('📤 Sending image...');

      if (this.currentView === 'contact') {
        await this.sendContactMessage(processed.dataUrl, 'image');
      } else {
        await this.sendGroupMessage(processed.dataUrl, 'image');
      }
    } catch (error) {
      this.chatUI.addSystemMessage('⚠️ Failed to send image');
    }
  }

  private async sendContactMessage(content: string, contentType: ContentType): Promise<void> {
    if (!this.currentID) return;

    const contact = contactService.get(this.currentID);
    if (!contact || contact.blocked) return;

    // Send to server
    wsService.send({
      type: 'chatmessage',
      to: this.currentID,
      content,
      contentType
    });

    // Add to local history
    const message = contactService.addMessage(
      this.currentID,
      content,
      this.myUsername,
      contentType
    );

    // Show in UI
    this.chatUI.addMessage(message, 'sent');
    this.chatUI.clearInput();
    this.chatUI.scrollToBottom();
    this.renderContacts();
  }

  private async sendGroupMessage(content: string, contentType: ContentType): Promise<void> {
    if (!this.currentID) return;

    const group = groupService.get(this.currentID);
    if (!group) return;

    // Send to server
    wsService.send({
      type: 'groupmessage',
      groupID: this.currentID,
      content,
      contentType
    });

    // Add to local history
    const message = groupService.addMessage(
      this.currentID,
      content,
      this.myUsername,
      contentType
    );

    // Show in UI
    this.chatUI.addMessage(message, 'sent');
    this.chatUI.clearInput();
    this.chatUI.scrollToBottom();
    this.renderGroups();
  }

  private toggleBlock(): void {
    if (this.currentView !== 'contact' || !this.currentID) return;

    const blocked = contactService.toggleBlock(this.currentID);
    const contact = contactService.get(this.currentID);
    
    if (contact) {
      this.chatUI.showContact(contact, this.myUsername);
      this.chatUI.addSystemMessage(blocked ? '🚫 User blocked' : '✅ User unblocked');
    }
  }

  // ==================== Group Actions ====================

  private showCreateGroupModal(): void {
    const contacts = contactService.getAll();
    this.modalsUI.showCreateGroup(contacts);
  }

  private createGroup(): void {
    const { name, memberUsernames } = this.modalsUI.getCreateGroupData();

    if (!name || name.length < 1 || name.length > 32) {
      this.chatUI.addSystemMessage('Group name must be 1-32 characters');
      return;
    }

    if (memberUsernames.length === 0) {
      this.chatUI.addSystemMessage('Select at least one member');
      return;
    }

    // Include self in members
    const allMembers = [this.myUsername, ...memberUsernames];

    // Create locally
    const group = groupService.create(name, allMembers, this.myUsername);

    // Send to server
    wsService.send({
      type: 'creategroup',
      groupID: group.id,
      groupName: group.name,
      members: group.members
    });

    this.modalsUI.hideCreateGroup();
    this.chatUI.addSystemMessage(`✅ Group "${name}" created`);
    this.selectGroup(group.id);
  }

  private showAddMemberModal(): void {
    if (this.currentView !== 'group' || !this.currentID) return;

    const group = groupService.get(this.currentID);
    if (!group) return;

    const contacts = contactService.getAll();
    this.modalsUI.showAddMember(contacts, group.members);
  }

  private addMembers(): void {
    if (!this.currentID) return;

    const newMembers = this.modalsUI.getAddMemberData();
    if (newMembers.length === 0) {
      this.chatUI.addSystemMessage('Select at least one member');
      return;
    }

    // Update local
    groupService.addMembers(this.currentID, newMembers);

    // Send to server
    wsService.send({
      type: 'addgroupmembers',
      groupID: this.currentID,
      members: newMembers
    });

    this.modalsUI.hideAddMember();
    this.chatUI.addSystemMessage(`✅ Added ${newMembers.length} member(s)`);

    // Refresh UI
    const group = groupService.get(this.currentID);
    if (group) {
      this.chatUI.showGroup(group, this.myUsername);
    }
  }

  // ==================== Fire (Delete All) ====================

  private async fireAll(): Promise<void> {
    // Clear all data
    await storage.clearAll();
    
    // Clear services
    imageService.revokeAll();
    
    // Disconnect
    wsService.disconnect();
    
    // Clear UI
    this.modalsUI.hideFireModal();
    
    // Reload page for fresh start
    window.location.reload();
  }

  // ==================== Rendering ====================

  private renderContacts(): void {
    const contacts = contactService.getAll();
    const selectedUsername = this.currentView === 'contact' ? this.currentID : null;
    this.sidebarUI.renderContacts(contacts, selectedUsername);
  }

  private renderGroups(): void {
    const groups = groupService.getAll();
    const selectedID = this.currentView === 'group' ? this.currentID : null;
    this.sidebarUI.renderGroups(groups, selectedID);
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  new CoffeeChatApp();
});
