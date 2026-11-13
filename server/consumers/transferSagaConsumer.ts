import { BrokerEvent } from '../../src/types/medilink.ts';
import { db } from '../db/database.ts';
import { rabbitmqBroker } from '../infrastructure/rabbitmqBroker.ts';
import { websocketHub } from '../services/websocketHub.ts';

const CONSUMER_NAME = 'transfer_saga_consumer';

export async function handleTransferSagaEvent(event: BrokerEvent): Promise<void> {
  if (!rabbitmqBroker.markEventProcessed(event.id, CONSUMER_NAME)) {
    return;
  }

  const p = event.payload;
  const transferId = typeof p.transfer_id === 'string' ? p.transfer_id : null;

  if (transferId && event.event_type === 'TransferRequested') {
    db.prepare(`
      UPDATE TransferRequests
      SET status = 'PENDING',
          saga_step = 'AWAITING_RECEIVING_HOSPITAL_CONFIRMATION',
          updated_at = ?
      WHERE id = ? AND status = 'REQUESTED'
    `).run(new Date().toISOString(), transferId);

    websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'TRANSFER_PENDING', transfer_id: transferId });
  }
}
