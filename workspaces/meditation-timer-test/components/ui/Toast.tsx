import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { CheckCircle, Warning, X, Info } from 'phosphor-react-native';
import { useTheme } from '../../theme/useTheme';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  visible: boolean;
  type?: ToastType;
  message: string;
  duration?: number;
  onDismiss: () => void;
}

const ICONS = { success: CheckCircle, error: X, warning: Warning, info: Info };

export function Toast({ visible, type = 'info', message, duration = 3000, onDismiss }: ToastProps) {
  const colors = useTheme();
  const Icon = ICONS[type];
  const colorMap = {
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.primary,
  };

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  return (
    <MotiView
      from={{ opacity: 0, translateY: -20 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: -20 }}
      transition={{ type: 'spring', damping: 18, stiffness: 200 }}
      style={[styles.container, { backgroundColor: colors.surface, ...shadows.level2 }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon size={20} weight="duotone" color={colorMap[type]} />
      <Text style={[typography.bodyMd, { color: colors.textPrimary, flex: 1 }]}>
        {message}
      </Text>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: spacing.base,
    right: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: 12,
    zIndex: 1000,
  },
});