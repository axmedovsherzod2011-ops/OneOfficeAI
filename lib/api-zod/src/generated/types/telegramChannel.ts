/**
 * Api
 * OneOffice AI API specification
 * OpenAPI spec version: 0.1.0
 */

export interface TelegramChannel {
  id: number;
  channelId: string;
  channelUsername: string | null;
  channelTitle: string;
  connectedAt: string;
  isActive: boolean;
}
