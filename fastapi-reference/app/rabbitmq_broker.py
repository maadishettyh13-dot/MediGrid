import json
import os
import aio_pika

RABBITMQ_URL = os.getenv(
    "RABBITMQ_URL",
    "amqp://medigrid:medigrid_dev_password@rabbitmq:5672/",
)

MAIN_QUEUE = "medigrid.emergency.events"
DLQ_EXCHANGE = "medigrid.dlx"
DLQ_QUEUE = "medigrid.emergency.dlq"


class RabbitMQBroker:
    def __init__(self) -> None:
        self.connection: aio_pika.RobustConnection | None = None
        self.channel: aio_pika.abc.AbstractChannel | None = None

    async def connect(self) -> None:
        self.connection = await aio_pika.connect_robust(RABBITMQ_URL)
        self.channel = await self.connection.channel(publisher_confirms=True)
        await self.channel.set_qos(prefetch_count=32)

        dlx = await self.channel.declare_exchange(
            DLQ_EXCHANGE, aio_pika.ExchangeType.DIRECT, durable=True
        )
        dlq = await self.channel.declare_queue(DLQ_QUEUE, durable=True)
        await dlq.bind(dlx, routing_key=MAIN_QUEUE)

        await self.channel.declare_queue(
            MAIN_QUEUE,
            durable=True,
            arguments={
                "x-max-priority": 10,
                "x-dead-letter-exchange": DLQ_EXCHANGE,
                "x-dead-letter-routing-key": MAIN_QUEUE,
            },
        )

    async def publish_event(self, event_id: str, event_type: str, priority: int, payload: dict) -> None:
        if self.channel is None:
            await self.connect()
        assert self.channel is not None

        message = aio_pika.Message(
            body=json.dumps({"id": event_id, "event_type": event_type, "payload": payload}).encode(),
            message_id=event_id,
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            priority=max(0, min(10, priority)),
        )
        await self.channel.default_exchange.publish(message, routing_key=MAIN_QUEUE)

    async def close(self) -> None:
        if self.connection is not None:
            await self.connection.close()
