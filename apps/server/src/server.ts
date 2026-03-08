import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initializeSocket } from './config/socket';
import { initializeNotificationQueue } from './queue/notification-queue';

const app = createApp();
const server = createServer(app);

initializeSocket(server);
void initializeNotificationQueue();

server.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});
