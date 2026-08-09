import fs from 'fs/promises';
import path from 'path';
import { StorageService } from './StorageService';

export class LocalStorageService implements StorageService {
  private readonly uploadDir: string;

  constructor(uploadDir: string = 'src/uploads') {
    this.uploadDir = path.resolve(process.cwd(), uploadDir);
    this.ensureDirExists();
  }

  private async ensureDirExists() {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(file: { path: string; originalname: string; mimetype: string; size: number }, pathPrefix: string = ''): Promise<string> {
    const filename = `${Date.now()}-${file.originalname}`;
    const targetDir = path.join(this.uploadDir, pathPrefix);

    try {
      await fs.access(targetDir);
    } catch {
      await fs.mkdir(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, filename);
    await fs.copyFile(file.path, filePath);

    return path.join(pathPrefix, filename).replace(/\\/g, '/');
  }

  async getDownloadUrl(filePath: string): Promise<string> {
    return `/uploads/${filePath}`;
  }

  async deleteFile(filePath: string): Promise<void> {
    const absolutePath = path.join(this.uploadDir, filePath);
    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      console.error(`Failed to delete file: ${absolutePath}`, error);
    }
  }
}
