import { Multer } from 'multer';

export interface StorageService {
  uploadFile(file: Express.Multer.File, pathPrefix?: string): Promise<string>;
  getDownloadUrl(filePath: string): Promise<string>;
  deleteFile(filePath: string): Promise<void>;
}
