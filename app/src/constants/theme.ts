import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B0D10',
    background: '#FFFFFF',
    backgroundElement: '#F1F2F4',
    backgroundSelected: '#E2E4E8',
    textSecondary: '#5E636B',
    border: '#E2E4E8',
    accent: '#E8590C',
    accentText: '#FFFFFF',
    success: '#2B8A3E',
    warning: '#B7791F',
    danger: '#C92A2A',
  },
  dark: {
    text: '#F5F6F7',
    background: '#0B0D10',
    backgroundElement: '#1A1D21',
    backgroundSelected: '#2A2E34',
    textSecondary: '#A3A8B0',
    border: '#2A2E34',
    accent: '#FF7A2F',
    accentText: '#0B0D10',
    success: '#51CF66',
    warning: '#FCC419',
    danger: '#FF6B6B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 14, lg: 20 } as const;

export const MaxContentWidth = 800;
