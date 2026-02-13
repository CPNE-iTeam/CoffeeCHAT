/**
 * Chat UI - Manages the main chat interface
 */

import type { Message, MessageDisplayType, ContentType, Contact, Group } from '../types';
import { imageService } from '../services/ImageService';
import { formatTime, formatFullTime, escapeHtml, getInitials, stringToColor } from '../utils/helpers';

export class ChatUI {
  private elements: {
    header: HTMLElement;
    chatName: HTMLElement;
    chatSubtitle: HTMLElement;
    messagesContainer: HTMLElement;
    messageInput: HTMLInputElement;
    sendBtn: HTMLButtonElement;
    imageBtn: HTMLButtonElement;
    blockBtn: HTMLButtonElement;
    addMemberBtn: HTMLButtonElement;
  };

  constructor() {
    this.elements = {
      header: document.getElementById('chatHeader')!,
      chatName: document.querySelector('.chat-name')!,
      chatSubtitle: document.querySelector('.chat-subtitle')!,
      messagesContainer: document.getElementById('messagesContainer')!,
      messageInput: document.getElementById('messageInput') as HTMLInputElement,
      sendBtn: document.getElementById('sendBtn') as HTMLButtonElement,
      imageBtn: document.getElementById('imageBtn') as HTMLButtonElement,
      blockBtn: document.getElementById('blockBtn') as HTMLButtonElement,
      addMemberBtn: document.getElementById('addMemberBtn') as HTMLButtonElement
    };
  }

  /**
   * Show empty state
   */
  showEmptyState(): void {
    this.elements.chatName.textContent = 'Select a conversation';
    this.elements.chatSubtitle.textContent = '';
    this.elements.messagesContainer.innerHTML = `
      <div class="empty-state">
        <span class="emoji">☕</span>
        <p>Start a conversation</p>
      </div>
    `;
    this.setInputEnabled(false);
    this.elements.blockBtn.classList.add('hidden');
    this.elements.addMemberBtn.classList.add('hidden');
  }

  /**
 * Show contact chat
   */
  showContact(contact: Contact, myUsername: string): void {
    const displayName = contact.displayName || contact.username;
    this.elements.chatName.textContent = displayName;
    this.elements.chatSubtitle.textContent = contact.username;
    
    this.elements.blockBtn.classList.remove('hidden');
    this.elements.blockBtn.textContent = contact.blocked ? '✓ Unblock' : '🚫';
    this.elements.blockBtn.title = contact.blocked ? 'Unblock user' : 'Block user';
    
    this.elements.addMemberBtn.classList.add('hidden');
    
    this.setInputEnabled(!contact.blocked);
    this.renderMessages(contact.messages, myUsername);
  }

  /**
   * Show group chat
   */
  showGroup(group: Group, myUsername: string): void {
    this.elements.chatName.textContent = group.name;
    this.elements.chatSubtitle.textContent = `${group.members.length} members`;
    
    this.elements.blockBtn.classList.add('hidden');
    this.elements.addMemberBtn.classList.remove('hidden');
    
    this.setInputEnabled(true);
    this.renderMessages(group.messages, myUsername, true);
  }

  /**
   * Render messages
   */
  private renderMessages(messages: Message[], myUsername: string, isGroup = false): void {
    this.elements.messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
      this.elements.messagesContainer.innerHTML = `
        <div class="empty-state">
          <span class="emoji">💬</span>
          <p>No messages yet</p>
        </div>
      `;
      return;
    }

    messages.forEach(msg => {
      const type: MessageDisplayType = msg.from === myUsername ? 'sent' : 'received';
      this.addMessage(msg, type, isGroup);
    });

    this.scrollToBottom();
  }

  /**
   * Add a single message to the UI
   */
  addMessage(message: Message, type: MessageDisplayType, showSender = false): void {
    const el = document.createElement('div');
    el.className = `message ${type}`;
    el.dataset.messageId = message.id;

    let html = '';

    // Show sender name for group messages
    if (showSender && type === 'received') {
      const senderName = message.from;
      const color = stringToColor(message.from);
      html += `<div class="message-sender" style="color: ${color}">${escapeHtml(senderName)}</div>`;
    }

    // Content
    if (message.contentType === 'image' && imageService.isImageContent(message.content)) {
      const blobUrl = imageService.createBlobUrl(message.content);
      html += `<img class="message-image" src="${blobUrl}" alt="Image" loading="lazy">`;
    } else {
      html += `<div class="message-content">${escapeHtml(message.content)}</div>`;
    }

    // Timestamp
    html += `<div class="message-time" title="${formatFullTime(message.timestamp)}">${formatTime(message.timestamp)}</div>`;

    el.innerHTML = html;

    // Image click handler
    const img = el.querySelector('.message-image');
    if (img) {
      img.addEventListener('click', () => this.showImageModal(img.getAttribute('src')!));
    }

    this.elements.messagesContainer.appendChild(el);
  }

  /**
   * Add system message
   */
  addSystemMessage(content: string): void {
    const el = document.createElement('div');
    el.className = 'message system';
    el.innerHTML = `<div class="message-content">${escapeHtml(content)}</div>`;
    this.elements.messagesContainer.appendChild(el);
    this.scrollToBottom();
  }

  /**
   * Scroll to bottom of messages
   */
  scrollToBottom(): void {
    this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
  }

  /**
   * Clear messages
   */
  clearMessages(): void {
    imageService.revokeAll();
    this.elements.messagesContainer.innerHTML = '';
  }

  /**
   * Enable/disable input
   */
  setInputEnabled(enabled: boolean): void {
    this.elements.messageInput.disabled = !enabled;
    this.elements.sendBtn.disabled = !enabled;
    this.elements.imageBtn.disabled = !enabled;
    
    if (enabled) {
      this.elements.messageInput.placeholder = 'Type a message...';
    } else {
      this.elements.messageInput.placeholder = 'Select a conversation';
    }
  }

  /**
   * Get input value
   */
  getInputValue(): string {
    return this.elements.messageInput.value.trim();
  }

  /**
   * Clear input
   */
  clearInput(): void {
    this.elements.messageInput.value = '';
  }

  /**
   * Focus input
   */
  focusInput(): void {
    this.elements.messageInput.focus();
  }

  /**
   * Show image in fullscreen modal
   */
  private showImageModal(src: string): void {
    const modal = document.getElementById('imageModal')!;
    const img = document.getElementById('imageModalImg') as HTMLImageElement;
    
    img.src = src;
    modal.classList.remove('hidden');

    const closeHandler = () => {
      modal.classList.add('hidden');
      modal.removeEventListener('click', closeHandler);
    };

    modal.addEventListener('click', closeHandler);
  }

  /**
   * Set up event listeners
   */
  onSend(handler: () => void): void {
    this.elements.sendBtn.addEventListener('click', handler);
    this.elements.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handler();
      }
    });
  }

  onSendImage(handler: () => void): void {
    this.elements.imageBtn.addEventListener('click', handler);
  }

  onBlock(handler: () => void): void {
    this.elements.blockBtn.addEventListener('click', handler);
  }

  onAddMember(handler: () => void): void {
    this.elements.addMemberBtn.addEventListener('click', handler);
  }

  onPaste(handler: (file: File) => void): void {
    document.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handler(file);
          return;
        }
      }
    });
  }
}
