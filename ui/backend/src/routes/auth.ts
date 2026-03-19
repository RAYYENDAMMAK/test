import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_SECRET } from '../middleware/auth';

const router = Router();

// Users store — in production replace with DB lookup
// Password hash for default "admin123"
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(
  process.env.ADMIN_PASSWORD || 'admin123',
  10
);

const USERS: Record<string, { passwordHash: string; role: string; displayName: string }> = {
  admin: {
    passwordHash: ADMIN_PASSWORD_HASH,
    role: 'admin',
    displayName: 'Administrator',
  },
};

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = USERS[username.toLowerCase()];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { username: username.toLowerCase(), role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { username: username.toLowerCase(), role: user.role, displayName: user.displayName },
    expiresIn: 86400,
  });
});

// GET /api/auth/me  — validate token & return user info
router.get('/me', (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as any;
    const user = USERS[payload.username];
    res.json({
      username: payload.username,
      role: payload.role,
      displayName: user?.displayName || payload.username,
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// POST /api/auth/logout  — client just discards token; endpoint for audit log
router.post('/logout', (req: Request, res: Response) => {
  res.json({ success: true });
});

export default router;
