'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, FileText, Settings, LogOut } from 'lucide-react';

export default function DashboardPage() {
  const { user, logout } = useAuthStore();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-xl font-semibold">StrataGPT Dashboard</h1>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  {user?.fullName} ({user?.planType} plan)
                </span>
                <Button variant="ghost" size="sm" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2" />
                  Chat Sessions
                </CardTitle>
                <CardDescription>Your recent conversations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-gray-600">Total chats</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Documents Generated
                </CardTitle>
                <CardDescription>Legal documents created</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-gray-600">This month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Account Settings
                </CardTitle>
                <CardDescription>Manage your profile</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">Jurisdiction: {user?.jurisdiction}</p>
                <p className="text-sm">Plan: {user?.planType}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full" size="lg">
                <MessageSquare className="h-5 w-5 mr-2" />
                Start New Chat
              </Button>
              <Button className="w-full" size="lg" variant="outline">
                <FileText className="h-5 w-5 mr-2" />
                Generate Document
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    </AuthGuard>
  );
}
