import { BrokerEvent } from '../../src/types/medilink.ts';
import { rabbitmqBroker } from '../infrastructure/rabbitmqBroker.ts';
import { redisCoordinator } from '../infrastructure/redisCoordinator.ts';
import { websocketHub } from '../services/websocketHub.ts';

const CONSUMER_NAME = 'bed_tracking_consumer';

export async function handleBedTrackingEvent(event: BrokerEvent): Promise<void> {
  if (!rabbitmqBroker.markEventProcessed(event.id, CONSUMER_NAME)) {
    return;
  }

  if (
    event.event_type === 'BedReserved' ||
    event.event_type === 'PatientAdmitted' ||
    event.event_type === 'PatientDischarged' ||
    event.event_type === 'ReservationExpired'
  ) {
    redisCoordinator.syncFromDatabase();
    websocketHub.broadcast('SNAPSHOT_UPDATED', {
      trigger: event.event_type,
      event_id: event.id,
    });
  }
}
