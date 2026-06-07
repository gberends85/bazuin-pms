import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool';

export interface AdminPayload {
  adminId: string;
  email: string;
  role: 'admin' | 'staff';
}

export interface GuestPayload {
  guestEmail: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminPayload;
      guest?: GuestPayload;
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

    // Gebruik de ACTUELE rol uit de database, niet de (mogelijk verouderde) rol uit het token.
    // Anders behoudt een gedegradeerde admin zijn rechten tot het token verloopt.
    const row = result.rows[0];
    req.admin = { adminId: row.id, email: row.email, role: row.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Ongeldige of verlopen sessie' });
  }
}

// ── Guest token helpers ───────────────────────────────────────────────────────

export function signGuestToken(payload: GuestPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '30d' });
}

export function verifyGuestToken(token: string): GuestPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as GuestPayload;
}

/** Middleware: require valid guest JWT */
export async function requireGuestAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Niet geautoriseerd' });
    }
    const token = header.slice(7);
    const payload = verifyGuestToken(token);
    if (!payload.guestEmail) return res.status(401).json({ error: 'Geen gast-sessie' });
    req.guest = payload;
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
