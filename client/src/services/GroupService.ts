/**
 * Group Service - Manages group chats with dynamic membership
 */

import type { Group, Message, ContentType } from '../types';
import { storage } from './StorageService';
import { eventBus } from './EventEmitter';
import { generateID } from '../utils/helpers';

export class GroupService {
  private currentGroupID: string | null = null;

  /**
   * Get all groups sorted by recent activity
   */
  getAll(): Group[] {
    return storage.getGroups();
  }

  /**
   * Get a specific group
   */
  get(id: string): Group | undefined {
    return storage.getGroup(id);
  }

  /**
   * Check if group exists
   */
  has(id: string): boolean {
    return storage.hasGroup(id);
  }

  /**
   * Create a new group
   */
  create(name: string, members: string[], creator: string): Group {
    const group: Group = {
      id: generateID(),
      name,
      members,
      creator,
      createdAt: Date.now(),
      messages: [],
      unreadCount: 0
    };

    storage.addGroup(group);
    return group;
  }

  /**
   * Add a group (from server notification)
   */
  add(group: Group): void {
    if (!storage.hasGroup(group.id)) {
      storage.addGroup(group);
    }
  }

  /**
   * Update group info
   */
  update(id: string, updates: Partial<Group>): void {
    storage.updateGroup(id, updates);
  }

  /**
   * Remove a group
   */
  remove(id: string): void {
    storage.removeGroup(id);
    if (this.currentGroupID === id) {
      this.currentGroupID = null;
    }
  }

  /**
   * Add members to a group
   */
  addMembers(groupID: string, newMembers: string[]): void {
    const group = storage.getGroup(groupID);
    if (!group) return;

    const existingSet = new Set(group.members);
    const toAdd = newMembers.filter(m => !existingSet.has(m));
    
    if (toAdd.length > 0) {
      storage.updateGroup(groupID, {
        members: [...group.members, ...toAdd]
      });
    }
  }

  /**
   * Check if user is a member
   */
  isMember(groupID: string, username: string): boolean {
    const group = storage.getGroup(groupID);
    return group?.members.includes(username) ?? false;
  }

  /**
   * Add a message to group's history
   */
  addMessage(
    groupID: string,
    content: string,
    fromUsername: string,
    contentType: ContentType = 'text'
  ): Message {
    const group = storage.getGroup(groupID);
    if (!group) {
      throw new Error(`Group ${groupID} not found`);
    }

    const message: Message = {
      id: generateID(),
      content,
      from: fromUsername,
      timestamp: Date.now(),
      contentType,
      status: 'sent'
    };

    group.messages.push(message);

    // Update unread count if it's a received message and not viewing this group
    const myUsername = storage.getUsername();
    if (fromUsername !== myUsername && this.currentGroupID !== groupID) {
      group.unreadCount++;
    }

    storage.updateGroup(groupID, {
      messages: group.messages,
      unreadCount: group.unreadCount
    });

    eventBus.emit('message:received', {
      conversationID: groupID,
      message,
      isGroup: true
    });

    return message;
  }

  /**
   * Get current group ID
   */
  getCurrentID(): string | null {
    return this.currentGroupID;
  }

  /**
   * Set current group (for viewing)
   */
  setCurrent(id: string | null): void {
    this.currentGroupID = id;
    
    // Clear unread count
    if (id) {
      const group = storage.getGroup(id);
      if (group && group.unreadCount > 0) {
        storage.updateGroup(id, { unreadCount: 0 });
      }
    }
  }

  /**
   * Get messages for a group
   */
  getMessages(id: string): Message[] {
    return storage.getGroup(id)?.messages || [];
  }
}

// Singleton
export const groupService = new GroupService();
