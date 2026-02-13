/**
 * Group management service
 * Handles group creation, storage, and message management
 * Groups have static membership defined at creation for security
 */

import type { Group, ContentType } from '../types';

export class GroupService {
  private groups: Map<string, Group> = new Map();
  private currentGroupID: string | null = null;
  private changeHandlers: Set<() => void> = new Set();

  /**
   * Generate a unique group ID
   */
  private generateGroupID(): string {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return 'grp_' + Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Create a new group with static membership
   * Members are fixed at creation and cannot be changed
   */
  createGroup(name: string, memberIDs: string[], creatorID: string): Group {
    const groupID = this.generateGroupID();
    
    const group: Group = {
      id: groupID,
      name: name.trim(),
      memberIDs: [...memberIDs], // Copy to prevent external modification
      creatorID,
      createdAt: Date.now(),
      messages: []
    };
    
    this.groups.set(groupID, group);
    this.notifyChange();
    
    return group;
  }

  /**
   * Add a group that was created by someone else
   */
  addGroup(group: Group): void {
    if (!this.groups.has(group.id)) {
      this.groups.set(group.id, {
        ...group,
        messages: [] // New members only see new messages
      });
      this.notifyChange();
    }
  }

  /**
   * Get group by ID
   */
  getGroup(groupID: string): Group | undefined {
    return this.groups.get(groupID);
  }

  /**
   * Get all groups
   */
  getAllGroups(): Group[] {
    return Array.from(this.groups.values());
  }

  /**
   * Check if group exists
   */
  hasGroup(groupID: string): boolean {
    return this.groups.has(groupID);
  }

  /**
   * Add message to group's history
   */
  addMessage(
    groupID: string, 
    content: string, 
    fromID: string, 
    fromUsername?: string,
    contentType: ContentType = 'text'
  ): void {
    const group = this.getGroup(groupID);
    if (group) {
      group.messages.push({
        content,
        fromID,
        fromUsername,
        timestamp: Date.now(),
        contentType
      });
      group.lastMessage = contentType === 'image' ? '🖼️ Image' : content;
      this.notifyChange();
    }
  }

  /**
   * Set current active group
   */
  setCurrentGroup(groupID: string | null): void {
    this.currentGroupID = groupID;
    this.notifyChange();
  }

  /**
   * Get current active group ID
   */
  getCurrentGroupID(): string | null {
    return this.currentGroupID;
  }

  /**
   * Get current active group
   */
  getCurrentGroup(): Group | undefined {
    if (this.currentGroupID) {
      return this.groups.get(this.currentGroupID);
    }
    return undefined;
  }

  /**
   * Check if user is member of group
   */
  isMember(groupID: string, userID: string): boolean {
    const group = this.groups.get(groupID);
    return group ? group.memberIDs.includes(userID) : false;
  }

  /**
   * Register change handler
   */
  onChange(handler: () => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  /**
   * Clear all groups
   */
  clear(): void {
    this.groups.clear();
    this.currentGroupID = null;
    this.notifyChange();
  }

  private notifyChange(): void {
    this.changeHandlers.forEach(handler => handler());
  }
}
