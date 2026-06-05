/**
 * GlassSheet — the 4-part glass stack from the design rulebook:
 *   1. blurred layer (BlurView)
 *   2. semi-transparent tint of `surface`
 *   3. 1px hairline border
 *   4. soft inner highlight
 *
 * That combination is what reads as glass. Transparency alone looks cheap.
 * Used for nav bars, bottom sheets, floating bars.
 */

import React, { type PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme';

export interface GlassSheetProps {
  /** BlurView intensity 0-100. Default 40 (subtle). */
  intensity?: number;
  tint?: 'dark' | 'light' | 'default';
  /** Override radius. Defaults to radius.sheet (24). */
  radius?: number;
  style?: ViewStyle;
}

export function GlassSheet({
  children,
  intensity = 40,
  tint,
  radius: radiusOverride,
  style,
}: PropsWithChildren<GlassSheetProps>) {
  const { colors, radius, isDark } = useTheme();
  const resolvedTint = tint ?? (isDark ? 'dark' : 'light');
  const r = radiusOverride ?? radius.sheet;

  return (
    <View
      style={[
        styles.root,
        {
          borderRadius: r,
          borderColor: colors.borderSubtle,
        },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint={resolvedTint}
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      {/* Semi-transparent tint of the surface — gives the glass a body. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.bgElevated,
            opacity: 0.55,
            borderRadius: r,
          },
        ]}
      />
      {/* Inner highlight — the subtle top-edge gleam that sells "glass". */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: r,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.06)',
          },
        ]}
      />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
