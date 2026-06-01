import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const CreateLinkSchema = z.object({
  maxUsers: z.number().int().min(2).max(30).default(30),
  expiresInHours: z.number().int().min(1).max(72).optional(),
});

router.get('/', requireRole('teacher'), async (req: AuthRequest, res) => {
  const links = await prisma.virtualLink.findMany({
    where: { creatorId: req.user!.sub },
    orderBy: { createdAt: 'desc' },
  });
  res.json(links);
});

router.post('/', requireRole('teacher'), async (req: AuthRequest, res) => {
  const result = CreateLinkSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Ungültige Eingabe', details: result.error.flatten() });
    return;
  }

  const linkToken = nanoid(32);
  const roomName = `room_${nanoid(16)}`;
  const expiresAt = result.data.expiresInHours
    ? new Date(Date.now() + result.data.expiresInHours * 3600 * 1000)
    : null;

  const link = await prisma.virtualLink.create({
    data: {
      linkToken,
      roomName,
      creatorId: req.user!.sub,
      maxUsers: result.data.maxUsers,
      expiresAt,
    },
  });
  res.status(201).json(link);
});

router.delete('/:token', requireRole('teacher'), async (req: AuthRequest, res) => {
  const token = String(req.params.token);
  const existing = await prisma.virtualLink.findFirst({
    where: { linkToken: token, creatorId: req.user!.sub },
  });
  if (!existing) {
    res.status(404).json({ error: 'Link nicht gefunden' });
    return;
  }
  await prisma.virtualLink.delete({ where: { linkToken: token } });
  res.json({ ok: true });
});

export default router;
