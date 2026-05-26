// ZionX Palette: Serene
// Selected because: meditation

export const lightColors = {
  primary: '#4A6FA5',
  accent: '#7BA7BC',
  bg: '#F7F9FC',
  surface: '#FFFFFF',
  textPrimary: '#1A2332',
  textSecondary: '#6B7C8F',
  border: '#E8EDF2',
  success: '#4CAF82',
  warning: '#E8A838',
  error: '#D64545',
  primarySoft: '#4A6FA520',
  accentSoft: '#7BA7BC20',
  successSoft: '#4CAF8220',
  warningSoft: '#E8A83820',
};

export const darkColors = {
  primary: '#6B8FC4',
  accent: '#8FB8C9',
  bg: '#0F1419',
  surface: '#1A2332',
  textPrimary: '#F0F4F8',
  textSecondary: '#A0AEC0',
  border: '#2A3441',
  success: '#5DBE92',
  warning: '#F0B848',
  error: '#E66565',
  primarySoft: '#6B8FC420',
  accentSoft: '#8FB8C920',
  successSoft: '#5DBE9220',
  warningSoft: '#F0B84820',
};

export type Colors = typeof lightColors;

// Default export for static contexts (StyleSheet outside components)
// For dynamic themed components, use useTheme() hook
export const colors = lightColors;