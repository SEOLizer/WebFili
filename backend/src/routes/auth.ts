import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, rotateRefreshToken } from '../services/token';
import { revokeRefreshToken } from '../lib/redis';
import { verifyAccessToken } from '../services/token';

const router = Router();

const RegisterSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

router.post('/register', async (req, res) => {
  const result = RegisterSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Ungültige Eingabe', details: result.error.flatten() });
    return;
  }
  const { username, email, password } = result.data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) {
    res.status(409).json({ error: 'Benutzername oder E-Mail bereits vergeben' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, role: 'student' },
  });

  const accessToken = signAccessToken({ sub: user.id, username: user.username, role: user.role });
  const refreshToken = await signRefreshToken(user.id);

  res.status(201).json({
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
});

router.post('/login', async (req, res) => {
  const result = LoginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Ungültige Eingabe' });
    return;
  }
  const { username, password } = result.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
    return;
  }

  const accessToken = signAccessToken({ sub: user.id, username: user.username, role: user.role });
  const refreshToken = await signRefreshToken(user.id);

  res.json({
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh-Token fehlt' });
    return;
  }

  const result = await rotateRefreshToken(refreshToken);
  if (!result) {
    res.status(401).json({ error: 'Refresh-Token ungültig oder abgelaufen' });
    return;
  }

  res.json({
    user: { sub: result.payload.sub, username: result.payload.username, role: result.payload.role },
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice(7));
      if (refreshToken) {
        const jwt = await import('jsonwebtoken');
        const secret = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me';
        try {
          const decoded = jwt.default.verify(refreshToken, secret) as unknown as { sub: number; jti: string };
          await revokeRefreshToken(decoded.sub, decoded.jti);
        } catch { /* expired token, ignore */ }
      }
      void payload;
    } catch { /* ignore */ }
  }
  res.json({ ok: true });
});

export default router;
