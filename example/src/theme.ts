import { createContext, useContext } from 'react';

export const palettes = {
  light: { bg: '#f6f7f9', card: '#ffffff', text: '#14161a', muted: '#6b7280', border: '#e5e7eb', accent: '#4f46e5', dot: '#ef4444', newBg: '#eef2ff', newText: '#4338ca' },
  dark: { bg: '#0f1115', card: '#181b21', text: '#f3f4f6', muted: '#9ca3af', border: '#2a2f38', accent: '#818cf8', dot: '#f87171', newBg: '#272a4a', newText: '#c7d2fe' },
};

export type Palette = (typeof palettes)['light'];

export interface AppState {
  colors: Palette;
  dark: boolean;
  setDark: (v: boolean) => void;
  isPro: boolean;
  setPro: (v: boolean) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppContext');
  return value;
}

/** Non-pro users only see entries meant for everyone. */
export function audienceFilter(isPro: boolean) {
  return isPro ? {} : { data: { audience: 'all' as const } };
}
