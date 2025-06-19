'use client';

import { Message } from '@/types/chat';
import { MessageBubble } from './message-bubble';
import { Card } from '@/components/ui/card';
import { Bot, Loader2 } from 'lucide-react';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  if (isLoading && messages.length === 0) {
    return (
      <div className=\"flex items-center justify-center py-8\">
        <div className=\"flex items-center gap-2 text-gray-500\">
          <Loader2 className=\"h-4 w-4 animate-spin\" />
          Loading messages...
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className=\"flex items-center justify-center py-12\">
        <div className=\"text-center max-w-md\">
          <Bot className=\"h-16 w-16 mx-auto mb-4 text-gray-300\" />
          <h3 className=\"text-lg font-medium text-gray-600 mb-2\">
            Start the conversation
          </h3>
          <p className=\"text-gray-500 text-sm\">
            Ask me anything about legal matters, regulations, or compliance.
            I'm here to help with your legal research and provide guidance
            based on current laws and precedents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className=\"space-y-6\">
      {messages.map((message, index) => (
        <div key={message.id}>
          <MessageBubble message={message} />
          
          {/* Add spacing between message pairs */}
          {index < messages.length - 1 && 
           messages[index + 1]?.role !== message.role && (
            <div className=\"h-4\" />
          )}
        </div>
      ))}
      
      {/* Loading indicator for new messages */}
      {isLoading && (
        <div className=\"flex gap-3\">
          <div className=\"flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center\">
            <Bot className=\"h-4 w-4 text-white\" />
          </div>
          <Card className=\"bg-white border-gray-200 mr-12 p-3\">
            <div className=\"flex items-center gap-2 text-gray-500\">
              <Loader2 className=\"h-4 w-4 animate-spin\" />
              <span className=\"text-sm\">Thinking...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}