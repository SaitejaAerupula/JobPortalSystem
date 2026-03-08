import { NotificationType, Prisma } from '@prisma/client';

import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { getIO } from '../config/socket';

type NotificationPayload = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
};

let enqueueImpl: (payload: NotificationPayload) => Promise<void> = async (payload) => {
  const notification = await prisma.notification.create({
    data: {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      metadata: payload.metadata as Prisma.InputJsonValue | undefined
    }
  });

  try {
    getIO().to(`user:${payload.userId}`).emit('notification:new', notification);
  } catch {
    // Socket may be unavailable during tests or early startup.
  }
};

export const initializeNotificationQueue = async () => {
  if (!env.REDIS_URL) {
    return;
  }

  try {
    const { Queue, Worker } = await import('bullmq');
    const connection = { url: env.REDIS_URL };
    const queue = new Queue<NotificationPayload, void, 'notification'>('notification-events', { connection });

    new Worker<NotificationPayload>(
      'notification-events',
      async (job) => {
        const payload = job.data;
        const notification = await prisma.notification.create({
          data: {
            userId: payload.userId,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            metadata: payload.metadata as Prisma.InputJsonValue | undefined
          }
        });

        try {
          getIO().to(`user:${payload.userId}`).emit('notification:new', notification);
        } catch {
          // Socket may be unavailable during worker lifecycle edges.
        }
      },
      { connection }
    );

    enqueueImpl = async (payload) => {
      await queue.add('notification', payload, {
        removeOnComplete: 100,
        removeOnFail: 100
      });
    };
  } catch {
    // If Redis/BullMQ fails, keep direct in-process fallback.
  }
};

export const enqueueNotification = async (payload: NotificationPayload) => {
  await enqueueImpl(payload);
};
