import { useColorScheme } from 'react-native';
import { lightColors, darkColors, type Colors } from './colors';

export function useTheme(): Colors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : lightColors;
}