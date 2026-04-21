import type { Channel, ChannelModel } from 'amqplib';
import * as amqplib from 'amqplib';

export interface Publisher {
  publish(topic: string, payload: unknown): Promise<void>;
  close(): Promise<void>;
}

/**
 * RabbitMQ topic-exchange publisher. The outbox pattern already guarantees
 * durability at the DB level, so a regular channel is sufficient here: if
 * the publish throws we leave the outbox row in 'pending' and retry.
 */
export class RabbitPublisher implements Publisher {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(
    private readonly url: string,
    private readonly exchange: string = 'uprm.events',
  ) {}

  async connect(): Promise<void> {
    const conn = await amqplib.connect(this.url);
    const ch = await conn.createChannel();
    await ch.assertExchange(this.exchange, 'topic', { durable: true });
    this.connection = conn;
    this.channel = ch;
  }

  async publish(topic: string, payload: unknown): Promise<void> {
    if (!this.channel) throw new Error('publisher not connected');
    const buf = Buffer.from(JSON.stringify(payload), 'utf8');
    const ok = this.channel.publish(this.exchange, topic, buf, {
      persistent: true,
      contentType: 'application/json',
    });
    if (!ok) {
      await new Promise<void>((resolve) => this.channel!.once('drain', () => resolve()));
    }
  }

  async close(): Promise<void> {
    try {
      await this.channel?.close();
    } catch {}
    try {
      await this.connection?.close();
    } catch {}
    this.channel = null;
    this.connection = null;
  }
}
