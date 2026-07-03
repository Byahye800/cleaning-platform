// Design tokens for the site redesign: white/black primary, navy accent, no gold.
// Step 1 of the redesign -- tokens only, no existing page wired up to these yet.

export const color = {
  white: '#FFFFFF',
  black: '#0A0A0A',

  navy: '#1B2B4B',
  navyDark: '#12203A',
  navyLight: '#2F4570',
  navyBlack: '#0B1220',

  overlayBorder: 'rgba(255,255,255,0.12)',
  overlayBg: 'rgba(255,255,255,0.04)',
  overlayTextMuted: 'rgba(255,255,255,0.72)',

  gray50: '#FAFAFA',
  gray100: '#F2F2F2',
  gray200: '#E0E0E0',
  gray400: '#9A9A9A',
  gray600: '#5C5C5C',
  gray900: '#1A1A1A',

  background: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#E0E0E0',

  textPrimary: '#0A0A0A',
  textSecondary: '#5C5C5C',
  textInverse: '#FFFFFF',

  accent: '#1B2B4B',
  accentHover: '#12203A',

  success: '#15803D',
  error: '#B91C1C',
  warning: '#B45309',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  full: 9999,
} as const;

export const font = {
  family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  size: {
    sm: 12,
    base: 14,
    md: 16,
    lg: 20,
    xl: 28,
  },
  weight: {
    normal: 400,
    medium: 600,
    bold: 800,
    heavy: 1000,
  },
} as const;
