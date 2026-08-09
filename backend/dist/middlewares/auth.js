"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../database/prisma"));
const authenticate = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'fallback_secret');
            req.user = await prisma_1.default.user.findUnique({ where: { id: decoded.id } });
            if (!req.user) {
                return res.status(401).json({ status: 'error', message: 'User not found' });
            }
            next();
        }
        catch (error) {
            res.status(401).json({ status: 'error', message: 'Not authorized, token failed' });
        }
    }
    else {
        res.status(401).json({ status: 'error', message: 'Not authorized, no token' });
    }
};
exports.authenticate = authenticate;
