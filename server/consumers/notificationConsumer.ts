import { BrokerEvent } from '../../src/types/medilink.ts';
import { rabbitmqBroker } from '../infrastructure/rabbitmqBroker.ts';
import { websocketHub } from '../services/websocketHub.ts';

const CONSUMER_NAME = 'notification_consumer';

export async function handleNotificationEvent(event: BrokerEvent): Promise<void> {
  if (!rabbitmqBroker.markEventProcessed(event.id, CONSUMER_NAME)) {
    return;
  }

  const p = event.payload;
  const title = typeof p.title === 'string' ? p.title : event.event_type.replaceAll('_', ' ');
  const message = typeof p.message === 'string' ? p.message : 'Hospital coordination update received.';
  const targetHospitalId = typeof p.hospital_id === 'string' ? p.hospital_id : null;
  const severity = event.priority >= 10 ? 'CRITICAL' : event.priority >= 5 ? 'HIGH' : 'NORMAL';

  websocketHub.broadcast('NOTIFICATION', {
    id: event.id,
    title,
    message,
    hospital_id: targetHospitalId,
    severity,
    created_at: new Date().toISOString(),
  });
}
