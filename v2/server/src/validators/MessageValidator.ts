/**
 * Message Validator - Validates incoming messages
 */

export class MessageValidator {
  private static readonly MAX_CONTENT_LENGTH = 16 * 1024 * 1024; // 16MB for images
  private static readonly MAX_USERNAME_LENGTH = 32;
  private static readonly MAX_GROUP_ID_LENGTH = 64;
  private static readonly MAX_NAME_LENGTH = 32;

  /**
   * Validate username format
   * Allows: guest#xxx, or custom usernames with alphanumeric, underscore, hyphen
   */
  static validateUsername(username: unknown): username is string {
    return typeof username === 'string' && 
           username.length > 0 && 
           username.length <= this.MAX_USERNAME_LENGTH &&
           /^[a-zA-Z0-9_#-]+$/.test(username);
  }

  static validateContent(content: unknown): content is string {
    return typeof content === 'string' && 
           content.length > 0 && 
           content.length <= this.MAX_CONTENT_LENGTH;
  }

  static validateContentType(type: unknown): type is 'text' | 'image' {
    return type === 'text' || type === 'image';
  }

  static validateGroupID(id: unknown): id is string {
    return typeof id === 'string' && 
           id.length > 0 && 
           id.length <= this.MAX_GROUP_ID_LENGTH;
  }

  static validateGroupName(name: unknown): name is string {
    return typeof name === 'string' && 
           name.length > 0 && 
           name.length <= this.MAX_NAME_LENGTH;
  }

  /**
   * Validate array of usernames
   */
  static validateMembers(members: unknown): members is string[] {
    return Array.isArray(members) && 
           members.length > 0 && 
           members.length <= 100 &&
           members.every(m => this.validateUsername(m));
  }
}
