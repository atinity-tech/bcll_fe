import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  email: string;
  role: 'admin' | 'passenger';
  name?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (token, user) => {
        localStorage.setItem('token', token);
        set({ token, user, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('token');
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

interface LocationState {
  source: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  setSource: (location: { lat: number; lng: number }) => void;
  setDestination: (location: { lat: number; lng: number }) => void;
  clearLocations: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  source: null,
  destination: null,
  setSource: (location) => set({ source: location }),
  setDestination: (location) => set({ destination: location }),
  clearLocations: () => set({ source: null, destination: null }),
}));

