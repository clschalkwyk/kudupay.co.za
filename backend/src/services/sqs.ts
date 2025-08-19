/**
 * SqsService - minimal helper to send messages to AWS SQS.
 *
 * Environment variables used (optional):
 * - AWS_REGION or AWS_DEFAULT_REGION: AWS region to use.
 * - SQS_QUEUE_URL: Default queue URL used by send().
 * - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: picked up automatically by AWS SDK.
 *
 * Usage:
 *  const sqs = new SqsService();
 *  await sqs.sendToQueue('https://sqs.us-east-1.amazonaws.com/123456789012/my-queue', { hello: 'world' });
 *  // or if SQS_QUEUE_URL is set:
 *  await sqs.send({ hello: 'world' });
 */

import { SQSClient, SendMessageCommand, MessageAttributeValue } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

export type SqsMessageAttributes = Record<string, MessageAttributeValue>;

export interface SqsSendOptions {
  /** Delay in seconds before the message is available for processing (0-900). */
  delaySeconds?: number;
  /** Optional message attributes. */
  attributes?: SqsMessageAttributes;
  /** FIFO queue: MessageGroupId. Auto-set to 'default' for .fifo queues if not provided. */
  groupId?: string;
  /** FIFO queue: MessageDeduplicationId. Auto-generated for .fifo queues if not provided. */
  deduplicationId?: string;
}

export interface SqsServiceOptions {
  /** AWS region. Defaults to process.env.AWS_REGION || AWS_DEFAULT_REGION || 'us-east-1' */
  region?: string;
  /** Default queue URL used by send(). Defaults to process.env.SQS_QUEUE_URL */
  defaultQueueUrl?: string;
  /** Optional custom SQSClient for testing/DI. */
  client?: SQSClient;
}

export interface SqsSendResult {
  messageId: string;
  md5OfMessageBody?: string;
}

export class SqsService {
  private client: SQSClient;
  private defaultQueueUrl?: string;

  constructor(options: SqsServiceOptions = {}) {
    const region = options.region ?? process.env.MY_AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
    this.client = options.client ?? new SQSClient({ region });
    this.defaultQueueUrl = options.defaultQueueUrl ?? process.env.SQS_QUEUE_URL;
  }

  /**
   * Send a message to a specific queue URL.
   */
  async sendToQueue(queueUrl: string, message: string | object, options: SqsSendOptions = {}): Promise<SqsSendResult> {
    if (!queueUrl) {
      throw new Error('SQS queueUrl is required');
    }

    const body = typeof message === 'string' ? message : JSON.stringify(message);
    const isFifo = queueUrl.endsWith('.fifo');

    const input = {
      QueueUrl: queueUrl,
      MessageBody: body,
      ...(options.delaySeconds !== undefined ? { DelaySeconds: options.delaySeconds } : {}),
      ...(options.attributes ? { MessageAttributes: options.attributes } : {}),
      ...(isFifo
        ? {
            MessageGroupId: options.groupId ?? 'default',
            MessageDeduplicationId: options.deduplicationId ?? this.computeDeduplicationId(body),
          }
        : {}),
    };

    const cmd = new SendMessageCommand(input);
    const res = await this.client.send(cmd);

    if (!res.MessageId) {
      throw new Error('Failed to send message to SQS: Missing MessageId in response');
    }

    return {
      messageId: res.MessageId,
      md5OfMessageBody: res.MD5OfMessageBody,
    };
  }

  /**
   * Send a message using the default queue URL from constructor or env (SQS_QUEUE_URL).
   */
  async send(message: string | object, options: SqsSendOptions = {}): Promise<SqsSendResult> {
    if (!this.defaultQueueUrl) {
      throw new Error('Default SQS queue URL is not configured. Provide defaultQueueUrl or set SQS_QUEUE_URL env var.');
    }
    return this.sendToQueue(this.defaultQueueUrl, message, options);
  }

  private computeDeduplicationId(body: string): string {
    // For simple usage, a UUID is sufficient. If you need stable deduplication, pass deduplicationId in options.
    return uuidv4();
  }
}

export default SqsService;
