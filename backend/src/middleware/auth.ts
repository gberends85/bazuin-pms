import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool';

export interface AdminPayload {
  adminId: string;
  email: string;
  role: 'admin' | 'staff';
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminPayload;
    }
  }
}

export function signAccessToken(payload: AdminPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

export function signRefreshToken(payload: AdminPayload): string {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): AdminPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as AdminPayload;
}

export function verifyRefreshToken(token: string): AdminPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as AdminPayload;
}

/** Middleware: require valid JWT access token */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Niet geautoriseerd' });
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);

    // Verify admin still exists and is active
    const result = await query(
      'SELECT id, name, email, role, is_active FROM admin_users WHERE id = $1',
      [payload.adminId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Gebruiker niet gevonden of inactief' });
    }

    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Ongeldige of verlopen sessie' });
  }
}

/** Middleware: require admin role */
export function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  if (req.admin?.role !== 'admin') {
    return res.status(403).json({ error: 'Onvoldoende rechten' });
  }
  next();
}
