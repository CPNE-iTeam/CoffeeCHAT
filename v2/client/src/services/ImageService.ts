/**
 * Image Service - Handles image processing and compression
 */

const MAX_IMAGE_SIZE = 1024 * 1024 * 5; // 5MB after compression
const MAX_DIMENSION = 1920;
const QUALITY = 0.85;

export interface ProcessedImage {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

export class ImageService {
  private activeBlobUrls: Set<string> = new Set();

  /**
   * Open file picker and process selected image
   */
  async selectImage(): Promise<ProcessedImage | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        
        try {
          const processed = await this.processImage(file);
          resolve(processed);
        } catch (error) {
          console.error('Failed to process image:', error);
          resolve(null);
        }
      };
      
      input.click();
    });
  }

  /**
   * Process an image file - resize and compress
   */
  async processImage(file: File): Promise<ProcessedImage> {
    const originalSize = file.size;
    
    // Create image element
    const img = await this.loadImage(file);
    
    // Calculate new dimensions
    let { width, height } = img;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    
    // Draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    
    // Compress to JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
    const compressedSize = Math.round((dataUrl.length * 3) / 4);
    
    if (compressedSize > MAX_IMAGE_SIZE) {
      throw new Error('Image too large even after compression');
    }
    
    return { dataUrl, originalSize, compressedSize, width, height };
  }

  /**
   * Load image from file
   */
  private loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Create a blob URL from data URL for display
   */
  createBlobUrl(dataUrl: string): string {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    this.activeBlobUrls.add(url);
    return url;
  }

  /**
   * Revoke a blob URL to free memory
   */
  revokeBlobUrl(url: string): void {
    URL.revokeObjectURL(url);
    this.activeBlobUrls.delete(url);
  }

  /**
   * Revoke all blob URLs
   */
  revokeAll(): void {
    this.activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
    this.activeBlobUrls.clear();
  }

  /**
   * Check if content is an image message
   */
  isImageContent(content: string): boolean {
    return content.startsWith('data:image/');
  }
}

// Singleton
export const imageService = new ImageService();
