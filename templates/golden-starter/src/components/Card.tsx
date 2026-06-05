/**
 * Card — calm card with MotiView entrance, radius + shadow, accent border
 * available via prop. Used as the default surface for list items.
 *
 * Honors reduced-motion automatically (Moti respects the OS setting).
 */

import React, { type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { useTheme } from '../theme';

export interface CardProps {
  onPress?: () => void;
  /** Highlight as the primary surface (accent-tinted border). */
  highlighted?: boolean;
  /** Stagger index for list animations (30ms per item). */
  index?: number;
  /** Override the card padding. Defaults to spacing.base (16). */
  padding?: number;
  style?: ViewStyle;
  /** Accessibility label — required for tappable cards. */
  accessibilityLabel?: string;
}

export function Card({
  children,
  onPress,
  highlighted = false,
  index = 0,
  padding,
  style,
  accessibilityLabel,
}: PropsWithChildren<CardProps>) {
  const { colors, radius, spacing, elevation } = useTheme();
  const Wrapper: React.ComponentType<any> = onPress ? Pressable : MotiView;

  const cardStyle: ViewStyle = {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.card,
    padding: padding ?? spacing.base,
    borderWidth: highlighted ? 1 : StyleSheet.hairlineWidth,
    borderColor: highlighted ? colors.accent : colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: elevation.level1.elevation,
  };

  if (onPress) {
    return (
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'spring', damping: 18, stiffness: 180, delay: index * 30 }}
        style={[cardStyle, style]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          android_ripple={{ color: colors.accentSoft, foreground: true }}
          onPress={onPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
        >
          {children}
        </Pressable>
      </MotiView>
    );
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 180, delay: index * 30 }}
      style={[cardStyle, style]}
    >
      {children}
    </MotiView>
  );
}
