"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../../database/prisma"));
const generateToken = (id) => {
    return jsonwebtoken_1.default.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: '30d',
    });
};
const register = async (req, res) => {
    const { email, name, password } = req.body;
    const userExists = await prisma_1.default.user.findUnique({ where: { email } });
    if (userExists) {
        return res.status(400).json({ status: 'error', message: 'User already exists' });
    }
    const salt = await bcrypt_1.default.genSalt(10);
    const hashedPassword = await bcrypt_1.default.hash(password, salt);
    const user = await prisma_1.default.user.create({
        data: {
            email,
            name,
            password: hashedPassword,
        },
    });
    res.status(201).json({
        status: 'success',
        data: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            token: generateToken(user.id),
        },
    });
};
exports.register = register;
const login = async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma_1.default.user.findUnique({ where: { email } });
    if (user && (await bcrypt_1.default.compare(password, user.password))) {
        res.json({
            status: 'success',
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                token: generateToken(user.id),
            },
        });
    }
    else {
        res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }
};
exports.login = login;
