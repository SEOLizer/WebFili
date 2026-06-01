import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const ProjectSchema = z.object({
  name: z.string().min(1).max(255),
  topology: z.record(z.string(), z.unknown()).default({}),
});

router.get('/', async (req: AuthRequest, res) => {
  const projects = await prisma.project.findMany({
    where: { userId: req.user!.sub },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, updatedAt: true },
  });
  res.json(projects);
});

router.post('/', async (req: AuthRequest, res) => {
  const result = ProjectSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Ungültige Eingabe', details: result.error.flatten() });
    return;
  }
  const project = await prisma.project.create({
    data: { userId: req.user!.sub, name: result.data.name, topology: result.data.topology as object },
  });
  res.status(201).json(project);
});

router.get('/:id', async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const project = await prisma.project.findFirst({ where: { id, userId: req.user!.sub } });
  if (!project) { res.status(404).json({ error: 'Projekt nicht gefunden' }); return; }
  res.json(project);
});

router.put('/:id', async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const result = ProjectSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Ungültige Eingabe', details: result.error.flatten() });
    return;
  }

  const existing = await prisma.project.findFirst({ where: { id, userId: req.user!.sub } });
  if (!existing) { res.status(404).json({ error: 'Projekt nicht gefunden' }); return; }

  const project = await prisma.project.update({
    where: { id },
    data: { name: result.data.name, topology: result.data.topology as object },
  });
  res.json(project);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = await prisma.project.findFirst({ where: { id, userId: req.user!.sub } });
  if (!existing) { res.status(404).json({ error: 'Projekt nicht gefunden' }); return; }

  await prisma.project.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
