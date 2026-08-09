import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../database/prisma';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as any;
      req.user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'User not found' });
      }
      next();
    } catch (error) {
      res.status(401).json({ status: 'error', message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ status: 'error', message: 'Not authorized, no token' });
  }
};
