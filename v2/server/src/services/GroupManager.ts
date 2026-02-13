/**
 * Group Manager - Manages group state on server
 */

import type { GroupInfo } from '../types/index.js';

export class GroupManager {
  private groups: Map<string, GroupInfo> = new Map();

  /**
   * Create or update a group
   */
  set(group: GroupInfo): void {
    this.groups.set(group.id, group);
  }

  /**
   * Get group by ID
   */
  get(id: string): GroupInfo | undefined {
    return this.groups.get(id);
  }

  /**
   * Check if group exists
   */
  has(id: string): boolean {
    return this.groups.has(id);
  }

  /**
   * Add members to a group
   */
  addMembers(groupID: string, members: string[]): boolean {
    const group = this.groups.get(groupID);
    if (!group) return false;

    const existingSet = new Set(group.members);
    for (const username of members) {
      if (!existingSet.has(username)) {
        group.members.push(username);
      }
    }
    return true;
  }

  /**
   * Check if user is a member of a group
   */
  isMember(groupID: string, username: string): boolean {
    const group = this.groups.get(groupID);
    return group?.members.includes(username) ?? false;
  }

  /**
   * Get all members of a group
   */
  getMembers(groupID: string): string[] {
    return this.groups.get(groupID)?.members ?? [];
  }
}
