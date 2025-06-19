'use client';

import { Message } from '@/types/chat';
import { Card } from '@/components/ui/card';
import { User, Bot, Clock, Hash } from 'lucide-react';
import { CitationList } from './citation-list';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'USER';
  const isAssistant = message.role === 'ASSISTANT';
  
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${\n        isUser ? 'bg-blue-500' : 'bg-green-500'\n      }`}>
        {isUser ? (
          <User className=\"h-4 w-4 text-white\" />
        ) : (
          <Bot className=\"h-4 w-4 text-white\" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <Card className={`p-3 ${\n          isUser \n            ? 'bg-blue-500 text-white ml-12' \n            : 'bg-white border-gray-200 mr-12'\n        }`}>
          {/* Message Text */}
          <div className=\"prose prose-sm max-w-none\">\n            <div className={`whitespace-pre-wrap ${\n              isUser ? 'text-white' : 'text-gray-900'\n            }`}>\n              {message.content}\n            </div>\n          </div>

          {/* Metadata for Assistant Messages */}\n          {isAssistant && message.metadata && (\n            <div className=\"mt-3 pt-3 border-t border-gray-100 space-y-2\">\n              <div className=\"flex items-center gap-4 text-xs text-gray-500\">\n                {message.metadata.model && (\n                  <div className=\"flex items-center gap-1\">\n                    <Bot className=\"h-3 w-3\" />\n                    <span>{message.metadata.model}</span>\n                  </div>\n                )}\n                {message.metadata.tokens && (\n                  <div className=\"flex items-center gap-1\">\n                    <Hash className=\"h-3 w-3\" />\n                    <span>{message.metadata.tokens} tokens</span>\n                  </div>\n                )}\n                {message.metadata.processingTime && (\n                  <div className=\"flex items-center gap-1\">\n                    <Clock className=\"h-3 w-3\" />\n                    <span>{message.metadata.processingTime.toFixed(1)}s</span>\n                  </div>\n                )}\n              </div>\n              \n              {/* Citations */}\n              {message.metadata.citations && message.metadata.citations.length > 0 && (\n                <CitationList citations={message.metadata.citations} />\n              )}\n            </div>\n          )}\n        </Card>\n        \n        {/* Timestamp */}\n        <div className={`text-xs text-gray-500 mt-1 px-1 ${\n          isUser ? 'text-right' : 'text-left'\n        }`}>\n          {new Date(message.createdAt).toLocaleTimeString([], {\n            hour: '2-digit',\n            minute: '2-digit'\n          })}\n        </div>\n      </div>\n    </div>\n  );\n}