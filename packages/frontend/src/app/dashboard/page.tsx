'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { ChatInterface } from '@/components/chat/chat-interface';

export default function DashboardPage() {
  return (
    <AuthGuard>
      <ChatInterface />
    </AuthGuard>
  );
}
