/**
 * Secure Image Service
 * Handles image selection, validation, compression, and sanitization
 * Security features:
 * - File type validation (magic bytes, not just extension)
 * - Size limits to prevent DoS
 * - Image re-encoding to strip metadata (EXIF, GPS, etc.)
 * - Content Security Policy friendly (blob URLs)
 */

export interface ProcessedImage {
  dataUrl: string;      // Base64 data URL for encryption
  mimeType: string;     // Validated MIME type
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

// Security constants
const MAX_FILE_SIZE = 5 * 1024 * 1024;  // 5MB max
const MAX_DIMENSION = 2048;              // Max width/height
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const COMPRESSION_QUALITY = 0.8;         // 80% quality for JPEG

// Magic bytes for file type validation
const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]] // RIFF header (WebP starts with RIFF)
};

export class ImageService {
  /**
   * Open file picker and process selected image
   */
  async selectImage(): Promise<ProcessedImage | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/gif,image/webp';
      input.style.display = 'none';

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
          console.error('Image processing failed:', error);
          resolve(null);
        } finally {
          input.remove();
        }
      };

      input.oncancel = () => {
        input.remove();
        resolve(null);
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  /**
   * Process and validate an image file
   */
  async processImage(file: File): Promise<ProcessedImage> {
    // Step 1: Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Image too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Step 2: Read file bytes for magic number validation
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Step 3: Validate magic bytes (actual file type, not extension)
    const detectedType = this.detectImageType(bytes);
    if (!detectedType) {
      throw new Error('Invalid image format. Only JPEG, PNG, GIF, and WebP are allowed.');
    }

    // Step 4: Load image to validate it's actually renderable
    const bitmap = await this.loadImageBitmap(file);

    // Step 5: Re-encode image to strip metadata and sanitize
    const processed = await this.reencodeImage(bitmap, detectedType, file.size);

    bitmap.close();
    return processed;
  }

  /**
   * Detect image type from magic bytes
   */
  private detectImageType(bytes: Uint8Array): string | null {
    for (const [mimeType, signatures] of Object.entries(MAGIC_BYTES)) {
      for (const signature of signatures) {
        if (this.matchesSignature(bytes, signature)) {
          return mimeType;
        }
      }
    }
    return null;
  }

  /**
   * Check if bytes match a signature
   */
  private matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
    if (bytes.length < signature.length) return false;
    for (let i = 0; i < signature.length; i++) {
      if (bytes[i] !== signature[i]) return false;
    }
    return true;
  }

  /**
   * Load image as ImageBitmap for processing
   */
  private async loadImageBitmap(file: File): Promise<ImageBitmap> {
    try {
      return await createImageBitmap(file);
    } catch {
      throw new Error('Failed to load image. File may be corrupted.');
    }
  }

  /**
   * Re-encode image to strip metadata and optionally compress
   * This is crucial for security - removes EXIF data, GPS coordinates, etc.
   */
  private async reencodeImage(
    bitmap: ImageBitmap,
    mimeType: string,
    originalSize: number
  ): Promise<ProcessedImage> {
    // Calculate dimensions (resize if too large)
    let { width, height } = bitmap;
    
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    // Create canvas and draw image (this strips all metadata)
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }

    // Draw with white background (for transparent images converted to JPEG)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Determine output format (convert GIF to PNG to preserve quality)
    let outputType = mimeType;
    let quality = COMPRESSION_QUALITY;

    if (mimeType === 'image/gif') {
      outputType = 'image/png';
      quality = 1;
    } else if (mimeType === 'image/png') {
      quality = 1; // PNG is lossless
    }

    // Export as blob
    const blob = await canvas.convertToBlob({
      type: outputType,
      quality: quality
    });

    // Convert to data URL for encryption
    const dataUrl = await this.blobToDataUrl(blob);

    return {
      dataUrl,
      mimeType: outputType,
      width,
      height,
      originalSize,
      compressedSize: blob.size
    };
  }

  /**
   * Convert blob to data URL
   */
  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Create a secure blob URL from decrypted image data
   * Used for displaying received images
   */
  createSecureBlobUrl(dataUrl: string): string {
    try {
      // Parse data URL
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid data URL');
      }

      const mimeType = matches[1];
      const base64Data = matches[2];

      // Validate MIME type
      if (!ALLOWED_TYPES.includes(mimeType)) {
        throw new Error('Invalid image type');
      }

      // Convert base64 to blob
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Validate magic bytes of decoded data
      const detectedType = this.detectImageType(bytes);
      if (!detectedType) {
        throw new Error('Invalid image data');
      }

      const blob = new Blob([bytes], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Failed to create blob URL:', error);
      throw error;
    }
  }

  /**
   * Revoke a blob URL to free memory
   */
  revokeBlobUrl(url: string): void {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Check if content is an image message
   */
  isImageMessage(content: string): boolean {
    return content.startsWith('[IMAGE:') && content.endsWith(']');
  }

  /**
   * Extract image data from message content
   */
  extractImageData(content: string): string | null {
    if (!this.isImageMessage(content)) return null;
    return content.slice(7, -1); // Remove [IMAGE: and ]
  }

  /**
   * Wrap image data URL as message content
   */
  wrapImageAsMessage(dataUrl: string): string {
    return `[IMAGE:${dataUrl}]`;
  }
}
