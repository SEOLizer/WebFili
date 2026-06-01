import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// WP 6 – Stubs for virtual link management (Socket.io WAN broker)
router.get('/', requireRole('teacher'), (_req, res) => {
  res.json([]);
});

router.post('/', requireRole('teacher'), (_req, res) => {
  res.status(501).json({ error: 'Implementiert in WP 6' });
});

router.delete('/:token', requireRole('teacher'), (_req, res) => {
  res.status(501).json({ error: 'Implementiert in WP 6' });
});

export default router;
