import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'open5gs-admin-secret-change-in-prod';

export interface AuthPayload {
  username: string;
  role: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Accept token from Authorization header or ?token= query param (needed for EventSource)
  const header = req.headers.authorization;
  const raw = (header?.startsWith('Bearer ') ? header.slice(7) : null)
            ?? (req.query.token as string | undefined)
            ?? null;

  if (!raw) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(raw, JWT_SECRET) as AuthPayload;
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
