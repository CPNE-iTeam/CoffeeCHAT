/**
 * Chat UI management
 */

import type { Contact, MessageType } from '../types';

export class ChatUI {
  private statusEl: HTMLElement;
  private myIDEl: HTMLElement;
  private currentChatInfo: HTMLElement;
  private messagesContainer: HTMLElement;
  private messageInput: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private blockBtn: HTMLButtonElement;

  constructor() {
    this.statusEl = document.getElementById('status') as HTMLElement;
    this.myIDEl = document.getElementById('myID') as HTMLElement;
    this.currentChatInfo = document.getElementById('currentChatInfo') as HTMLElement;
    this.messagesContainer = document.getElementById('messages') as HTMLElement;
    this.messageInput = document.getElementById('messageInput') as HTMLInputElement;
    this.sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
    this.blockBtn = document.getElementById('blockBtn') as HTMLButtonElement;
  }

  /**
   * Update connection status display
   */
  updateStatus(status: string, isConnected: boolean): void {
    this.statusEl.textContent = status;
    this.statusEl.className = isConnected ? 'status connected' : 'status disconnected';
  }

  /**
   * Update my user ID display
   */
  updateMyID(userID: string): void {
    this.myIDEl.textContent = userID;
  }

  /**
   * Update chat header
   */
  updateChatHeader(
    contactID: string | null,
    isBlocked: boolean,
    hasPublicKey: boolean
  ): void {
    if (!contactID) {
      this.currentChatInfo.innerHTML = '<span class="chat-title">Select a contact to start chatting</span>';
      this.messageInput.disabled = true;
      this.sendBtn.disabled = true;
      this.blockBtn.style.display = 'none';
      return;
    }

    // Show block button
    this.blockBtn.style.display = 'block';
    this.blockBtn.textContent = isBlocked ? 'Unblock' : 'Block';
    this.blockBtn.className = isBlocked ? 'block-btn blocked' : 'block-btn';

    // Update input state
    this.messageInput.disabled = isBlocked;
    this.sendBtn.disabled = isBlocked;

    if (isBlocked) {
      this.messageInput.placeholder = 'User is blocked';
    } else if (!hasPublicKey) {
      this.messageInput.placeholder = 'Requesting secure key exchange...';
    } else {
      this.messageInput.placeholder = 'Type your message...';
    }

    let headerHTML = `
      <div class="chat-header-content">
        <div class="chat-subtitle">${contactID}${isBlocked ? ' 🚫' : ''}</div>
    `;

    if (!hasPublicKey) {
      headerHTML += '<div class="fingerprint-header"><span class="text-secondary">⏳ Exchanging keys...</span></div>';
    }

    headerHTML += '</div>';
    this.currentChatInfo.innerHTML = headerHTML;
  }

  /**
   * Add message to chat
   */
  addMessage(content: string, type: MessageType): void {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = content;

    messageEl.appendChild(contentEl);
    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Add system message
   */
  addSystemMessage(content: string): void {
    this.addMessage(content, 'system');
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messagesContainer.innerHTML = '';
  }

  /**
   * Render all messages from contact
   */
  renderMessages(contact: Contact, myID: string): void {
    this.clearMessages();
    
    contact.messages.forEach((msg) => {
      const type = msg.fromID === myID ? 'sent' : 'received';
      this.addMessage(msg.content, type);
    });
  }

  /**
   * Get message input value
   */
  getMessageInput(): string {
    return this.messageInput.value;
  }

  /**
   * Clear message input
   */
  clearMessageInput(): void {
    this.messageInput.value = '';
  }

  /**
   * Setup event listeners
   */
  onSendMessage(handler: () => void): void {
    this.sendBtn.addEventListener('click', handler);
    
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handler();
      }
    });
  }

  /**
   * Setup block button listener
   */
  onBlockContact(handler: () => void): void {
    this.blockBtn.addEventListener('click', handler);
  }
}
