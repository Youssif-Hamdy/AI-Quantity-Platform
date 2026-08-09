"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
class LocalStorageService {
    uploadDir;
    constructor(uploadDir = 'src/uploads') {
        this.uploadDir = path_1.default.resolve(process.cwd(), uploadDir);
        this.ensureDirExists();
    }
    async ensureDirExists() {
        try {
            await promises_1.default.access(this.uploadDir);
        }
        catch {
            await promises_1.default.mkdir(this.uploadDir, { recursive: true });
        }
    }
    async uploadFile(file, pathPrefix = '') {
        const filename = `${Date.now()}-${file.originalname}`;
        const targetDir = path_1.default.join(this.uploadDir, pathPrefix);
        try {
            await promises_1.default.access(targetDir);
        }
        catch {
            await promises_1.default.mkdir(targetDir, { recursive: true });
        }
        const filePath = path_1.default.join(targetDir, filename);
        await promises_1.default.copyFile(file.path, filePath);
        return path_1.default.join(pathPrefix, filename).replace(/\\/g, '/');
    }
    async getDownloadUrl(filePath) {
        return `/uploads/${filePath}`;
    }
    async deleteFile(filePath) {
        const absolutePath = path_1.default.join(this.uploadDir, filePath);
        try {
            await promises_1.default.unlink(absolutePath);
        }
        catch (error) {
            console.error(`Failed to delete file: ${absolutePath}`, error);
        }
    }
}
exports.LocalStorageService = LocalStorageService;
