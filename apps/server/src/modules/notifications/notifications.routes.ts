import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middlewares/auth';
import { ok } from '../../utils/http';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const data = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' }
  });
  return ok(res, data);
});

router.patch('/:id/read', async (req, res) => {
  const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.id) {
    return res.status(404).json({ message: 'Notification not found' });
  }

  const notification = await prisma.notification.update({
    where: { id: req.params.id },
    data: { isRead: true }
  });

  return ok(res, notification, 'Notification marked as read');
});

router.patch('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true }
  });

  return ok(res, null, 'All notifications marked as read');
});

export default router;
