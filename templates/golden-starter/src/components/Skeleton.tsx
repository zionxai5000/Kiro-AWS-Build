/**
 * Skeleton — gentle shimmer loader. Per the design rulebook:
 *   "Loading: skeletons or a gentle pulse, never a raw spinner on a white screen."
 *
 * Honors reduced-motion (animation freezes when the OS setting is on).
 */

import React, { useEffect } from 'react';
import { View, type ViewStyle, AccessibilityInfo, Platform } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  /** Override radius. Defaults to radius.md (12). */
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, radius: radiusProp, style }: SkeletonProps) {
  const { colors, radius } = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      let reduceMotion = false;
      if (Platform.OS !== 'web') {
        try { reduceMotion = await AccessibilityInfo.isReduceMotionEnabled(); }
        catch { /* ignore */ }
      }
      if (cancelled || reduceMotion) return;
      opacity.value = withRepeat(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    };
    void start();
    return () => { cancelled = true; };
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View
      style={[
        {
          width: width as ViewStyle['width'],
          height,
          borderRadius: radiusProp ?? radius.md,
          backgroundColor: colors.bgElevated2,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          { flex: 1, backgroundColor: colors.borderSubtle },
          animStyle,
        ]}
      />
    </View>
  );
}

/** Skeleton list — convenient helper for "loading 3 cards" patterns. */
export function SkeletonList({ count = 3, gap = 12, itemHeight = 72 }: { count?: number; gap?: number; itemHeight?: number }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={itemHeight} radius={16} />
      ))}
    </View>
  );
}
