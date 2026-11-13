import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeSchema } from './server/db/database.ts';
import { seedDatabaseIfEmpty } from './server/db/seed.ts';
import { redisCoordinator } from './server/infrastructure/redisCoordinator.ts';
import { rabbitmqBroker } from './server/infrastructure/rabbitmqBroker.ts';
import { handleBedTrackingEvent } from './server/consumers/bedTrackingConsumer.ts';
import { handleNotificationEvent } from './server/consumers/notificationConsumer.ts';
import { handleAuditEvent } from './server/consumers/auditConsumer.ts';
import { handleTransferSagaEvent } from './server/consumers/transferSagaConsumer.ts';
import { runReservationExpirySweep } from './server/services/emergencyService.ts';
import { websocketHub } from './server/services/websocketHub.ts';
import { apiRouter } from './server/routes/api.ts';

async function bootstrap() {
  // 1. Initialize Relational Database & Synthetic Seed Data
  initializeSchema();
  seedDatabaseIfEmpty();

  // 2. Sync Redis Fast Availability Cache
  redisCoordinator.syncFromDatabase();

  // 3. Register Independent RabbitMQ Consumers
  rabbitmqBroker.registerConsumer('bed_tracking_queue', handleBedTrackingEvent);
  rabbitmqBroker.registerConsumer('notification_queue', handleNotificationEvent);
  rabbitmqBroker.registerConsumer('audit_queue', handleAuditEvent);
  rabbitmqBroker.registerConsumer('transfer_saga_queue', handleTransferSagaEvent);

  rabbitmqBroker.start(() => redisCoordinator.getTelemetry().avg_lookup_ms);

  // 4. Reliable Server-Side 15-Minute Reservation Expiry Worker (ticks every 1s)
  setInterval(() => {
    runReservationExpirySweep();
  }, 1000);

  // 5. Create Express + HTTP + WebSocket Server on Port 3000
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', apiRouter);

  const httpServer = http.createServer(app);
  websocketHub.attach(httpServer);

  // Broadcast live monitoring metrics every 2s so charts & counters update cleanly
  setInterval(() => {
    if (websocketHub.getClientCount() > 0) {
      websocketHub.broadcast('METRICS_UPDATED', {
        redis: redisCoordinator.getTelemetry(),
        rabbitmq: rabbitmqBroker.getTelemetry(),
        ws_clients: websocketHub.getClientCount(),
      });
    }
  }, 2000);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT || 3000);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MEDILINK 360 Coordinator listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start MEDILINK 360 server:', err);
  process.exit(1);
});
