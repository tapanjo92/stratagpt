'use client';

import { useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
import outputs from '@/amplify_outputs.json';
import { useAuthStore } from '@/stores/auth-store';

// Configure Amplify only once
if (!Amplify.getConfig().API?.GraphQL) {
  Amplify.configure(outputs);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const loadUser = useAuthStore((state) => state.loadUser);

  useEffect(() => {
    // Load user on mount
    loadUser();

    // Listen for auth events
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
        case 'signUp':
        case 'tokenRefresh':
          loadUser();
          break;
        case 'signedOut':
          useAuthStore.setState({ user: null, isAuthenticated: false });
          break;
      }
    });

    return unsubscribe;
  }, [loadUser]);

  return <>{children}</>;
}
