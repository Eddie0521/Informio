export const colors = {
  accent: '#059669',
  accentHover: '#047857',
  text: '#111820',
  muted: '#64748b',
  surface: '#ffffff',
  pageBg: '#eef2f3',
  sidebar: '#f8fafc',
  border: '#e2e8f0',
  borderSubtle: '#d9dee2',
} as const;

export const radius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '18px',
  pill: '999px',
} as const;

export const fonts = {
  sans: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  mono: 'var(--font-geist-mono), ui-monospace, monospace',
} as const;

export const cssVariables = {
  '--informio-accent': colors.accent,
  '--informio-accent-hover': colors.accentHover,
  '--informio-text': colors.text,
  '--informio-muted': colors.muted,
  '--informio-surface': colors.surface,
  '--informio-page-bg': colors.pageBg,
  '--informio-sidebar': colors.sidebar,
  '--informio-border': colors.border,
} as const;
