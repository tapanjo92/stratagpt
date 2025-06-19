import { create } from 'zustand';
import { getCurrentUser, fetchUserAttributes, signOut, fetchAuthSession } from 'aws-amplify/auth';

interface User {
  id: string;
  email: string;
  fullName: string;
  jurisdiction: string;
  planType: string;
  stripeCustomerId?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  loadUser: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  error: null,
  isAuthenticated: false,

  loadUser: async () => {
    set({ isLoading: true, error: null });
    try {
      // Check if user is authenticated
      const authUser = await getCurrentUser();
      const attributes = await fetchUserAttributes();
      const session = await fetchAuthSession();
      
      if (!authUser || !session.tokens) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // Get custom claims from ID token
      const idToken = session.tokens.idToken;
      const payload = idToken?.payload;
      
      const user: User = {
        id: authUser.userId,
        email: attributes.email || '',
        fullName: attributes.given_name || '',
        jurisdiction: payload?.jurisdiction as string || 'NSW',
        planType: payload?.plan_type as string || 'free',
        stripeCustomerId: payload?.stripe_customer_id as string,
      };
      
      set({ user, isAuthenticated: true, isLoading: false });
      
      // TODO: Create user profile in backend once resolvers are implemented
      // For now, we'll skip backend user creation to avoid errors
      console.log('User profile creation skipped - backend resolvers need implementation');
    } catch (error: any) {
      // If user is not authenticated, don't treat it as an error
      if (error.name === 'UserUnAuthenticatedException') {
        set({ 
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: null
        });
      } else {
        console.error('Error loading user:', error);
        set({ 
          error: error.message || 'Failed to load user', 
          isLoading: false,
          isAuthenticated: false 
        });
      }
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await signOut();
      set({ user: null, isAuthenticated: false, isLoading: false });
      window.location.href = '/';
    } catch (error: any) {
      set({ 
        error: error.message || 'Failed to sign out', 
        isLoading: false 
      });
    }
  },

  updateUser: (updates: Partial<User>) => {
    const currentUser = get().user;
    if (!currentUser) return;
    
    set({ user: { ...currentUser, ...updates } });
  },

  clearError: () => set({ error: null }),
}));
