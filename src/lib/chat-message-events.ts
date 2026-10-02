/** Shared client/server shape for Ably `chat:message` payloads. */
export type ChatMessageEvent = {
  id: string;
  groupId: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderLabel: string;
  senderUsername: string;
};

export const CHAT_MESSAGE_EVENT = "rowgon:chat-message";
export const CHAT_MESSAGE_ABLY = "chat:message";
