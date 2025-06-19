'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Plus, FileText, Bot, User } from 'lucide-react';
import { Message, Chat } from '@/types/chat';
import { MessageBubble } from './message-bubble';
import { MessageList } from './message-list';
import { generateClient } from 'aws-amplify/api';
import { createChat, sendMessage, listMessages } from '@/graphql/mutations';
import { listChats } from '@/graphql/queries';
import { onMessageSent } from '@/graphql/subscriptions';
import { useAuthenticator } from '@aws-amplify/ui-react';

const client = generateClient();

export function ChatInterface() {
  const { user } = useAuthenticator();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chats on component mount
  useEffect(() => {
    if (user?.userId) {
      loadChats();
    }
  }, [user]);

  // Load messages when active chat changes
  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat.id);
    }
  }, [activeChat]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Subscribe to new messages
  useEffect(() => {
    if (!activeChat) return;

    const subscription = client.graphql({
      query: onMessageSent,
      variables: { chatId: activeChat.id }
    }).subscribe({
      next: ({ data }) => {
        if (data?.onMessageSent) {
          setMessages(prev => [...prev, data.onMessageSent]);
        }
      },
      error: (error) => console.error('Subscription error:', error)
    });

    return () => subscription.unsubscribe();
  }, [activeChat]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChats = async () => {
    try {
      setIsLoading(true);
      const result = await client.graphql({
        query: listChats,
        variables: { userId: user.userId, limit: 50 }
      });
      
      if (result.data?.listChats?.items) {
        setChats(result.data.listChats.items);
        // Set first chat as active if no active chat
        if (!activeChat && result.data.listChats.items.length > 0) {
          setActiveChat(result.data.listChats.items[0]);
        }
      }
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    try {
      setIsLoading(true);
      const result = await client.graphql({
        query: listMessages,
        variables: { chatId, limit: 100 }
      });
      
      if (result.data?.listMessages?.items) {
        setMessages(result.data.listMessages.items);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateChat = async () => {
    try {
      const title = inputMessage.trim() || 'New Chat';
      const result = await client.graphql({
        query: createChat,
        variables: {
          input: {
            userId: user.userId,
            title: title.length > 50 ? title.substring(0, 50) + '...' : title
          }
        }
      });

      if (result.data?.createChat) {
        const newChat = result.data.createChat;
        setChats(prev => [newChat, ...prev]);
        setActiveChat(newChat);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !activeChat || isSending) return;

    const messageContent = inputMessage.trim();
    setInputMessage('');
    setIsSending(true);

    try {
      await client.graphql({
        query: sendMessage,
        variables: {
          input: {
            chatId: activeChat.id,
            userId: user.userId,
            content: messageContent
          }
        }
      });

      // Message will be added via subscription
    } catch (error) {
      console.error('Error sending message:', error);
      setInputMessage(messageContent); // Restore message on error
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (activeChat) {
        handleSendMessage();
      } else {
        handleCreateChat();
      }
    }
  };

  return (
    <div className=\"flex h-screen bg-gray-50\">
      {/* Sidebar - Chat List */}
      <div className=\"w-80 bg-white border-r border-gray-200 flex flex-col\">
        <div className=\"p-4 border-b border-gray-200\">
          <Button
            onClick={handleCreateChat}
            className=\"w-full flex items-center gap-2\"
            variant=\"outline\"
          >
            <Plus className=\"h-4 w-4\" />
            New Chat
          </Button>
        </div>
        
        <div className=\"flex-1 overflow-y-auto\">
          {isLoading && chats.length === 0 ? (
            <div className=\"p-4 text-center text-gray-500\">
              Loading chats...
            </div>
          ) : chats.length === 0 ? (
            <div className=\"p-4 text-center text-gray-500\">
              <FileText className=\"h-12 w-12 mx-auto mb-2 text-gray-300\" />
              <p>No chats yet</p>
              <p className=\"text-sm\">Start a new conversation</p>
            </div>
          ) : (
            <div className=\"space-y-1 p-2\">
              {chats.map((chat) => (
                <Card
                  key={chat.id}
                  className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${\n                    activeChat?.id === chat.id ? 'bg-blue-50 border-blue-200' : ''\n                  }`}
                  onClick={() => setActiveChat(chat)}
                >
                  <h3 className=\"font-medium text-sm truncate\">{chat.title}</h3>
                  <p className=\"text-xs text-gray-500 mt-1\">
                    {chat.messageCount} messages
                  </p>
                  {chat.lastMessageAt && (
                    <p className=\"text-xs text-gray-400 mt-1\">
                      {new Date(chat.lastMessageAt).toLocaleDateString()}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className=\"flex-1 flex flex-col\">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className=\"p-4 bg-white border-b border-gray-200\">
              <h1 className=\"text-lg font-semibold\">{activeChat.title}</h1>
              <p className=\"text-sm text-gray-500\">
                {messages.length} messages
              </p>
            </div>

            {/* Messages */}
            <div className=\"flex-1 overflow-y-auto p-4 space-y-4\">
              <MessageList 
                messages={messages} 
                isLoading={isLoading}
              />
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className=\"p-4 bg-white border-t border-gray-200\">
              <div className=\"flex gap-2\">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder=\"Type your message...\"
                  className=\"flex-1\"
                  disabled={isSending}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isSending}
                  size=\"sm\"
                >
                  <Send className=\"h-4 w-4\" />
                </Button>
              </div>
              {isSending && (
                <p className=\"text-sm text-gray-500 mt-2\">
                  Sending message...
                </p>
              )}
            </div>
          </>
        ) : (
          <div className=\"flex-1 flex items-center justify-center\">
            <div className=\"text-center\">
              <Bot className=\"h-16 w-16 mx-auto mb-4 text-gray-300\" />
              <h2 className=\"text-xl font-semibold text-gray-600 mb-2\">
                Welcome to StrataGPT
              </h2>
              <p className=\"text-gray-500 mb-4\">
                Start a new conversation or select an existing chat
              </p>
              <Button onClick={handleCreateChat} className=\"flex items-center gap-2\">
                <Plus className=\"h-4 w-4\" />
                Start New Chat
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}