export interface Message {
  id: string;
  chatId: string;
  userId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  metadata?: MessageMetadata;
  createdAt: string;
}

export interface MessageMetadata {
  tokens?: number;
  model?: string;
  processingTime?: number;
  citations?: Citation[];
}

export interface Citation {
  source: string;
  title: string;
  section?: string;
  relevanceScore: number;
}

export interface Chat {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  messageCount: number;
}