/**
 * GradientButton — pill, accent gradient, press-spring scale, haptic.
 *
 * The canonical primary CTA per the design rulebook (§3, §10):
 *   - 56pt tall, full-width on key screens
 *   - radius pill (999)
 *   - LinearGradient using the accent stops
 *   - shadow for lift
 *   - withSpring scale 1 → 0.96 → 1 on tap
 *   - Haptics.selection (or .impactAsync(Light)) on press
 *
 * NEVER a flat solid backgroundColor. Solid + no shadow + no press = FAIL.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface GradientButtonProps {
  label: string;
  onPress: () => void;
  /** When true, full-width. Default true. */
  fullWidth?: boolean;
  /** Disable input + dim. */
  disabled?: boolean;
  /** Optional gradient stops. Defaults to accent → accent-glow. */
  colors?: readonly [string, string, ...string[]];
  /** Optional left icon node. */
  leftIcon?: React.ReactNode;
  textStyle?: TextStyle;
  style?: ViewStyle;
  /** A11y. */
  accessibilityLabel?: string;
}

export function GradientButton({
  label,
  onPress,
  fullWidth = true,
  disabled = false,
  colors: colorsProp,
  leftIcon,
  textStyle,
  style,
  accessibilityLabel,
}: GradientButtonProps) {
  const { colors, radius } = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 22, stiffness: 240 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 200 });
  };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const gradient = colorsProp ?? ([colors.accent, colors.accentGlow] as const);

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={[
        animStyle,
        styles.root,
        fullWidth && { alignSelf: 'stretch' },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <LinearGradient
        colors={gradient as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { borderRadius: radius.pill }]}
      >
        {leftIcon}
        <Text
          style={[
            styles.label,
            textStyle,
            leftIcon ? { marginLeft: 8 } : null,
          ]}
        >
          {label}
        </Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
