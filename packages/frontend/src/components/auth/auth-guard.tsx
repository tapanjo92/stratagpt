'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredPlan?: string[];
  redirectTo?: string;
}

export function AuthGuard({ 
  children, 
  requiredPlan, 
  redirectTo = '/auth' 
}: AuthGuardProps) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo);
    }

    if (!isLoading && isAuthenticated && requiredPlan && user) {
      // Check if user has required plan
      if (!requiredPlan.includes(user.planType)) {
        router.push('/upgrade');
      }
    }
  }, [isLoading, isAuthenticated, user, requiredPlan, router, redirectTo]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (requiredPlan && user && !requiredPlan.includes(user.planType)) {
    return null;
  }

  return <>{children}</>;
}
