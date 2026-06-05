/**
 * EmptyState — icon + headline + subtitle + primary CTA.
 *
 * Per the design rulebook §2: empty states are designed, not blank.
 * Every empty list ships with this pattern. NEVER a bare empty list.
 */

import React, { type ReactNode } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { useTheme } from '../theme';
import { GradientButton } from './GradientButton';

export interface EmptyStateProps {
  /** Emoji or React node — small (~64pt) hero glyph. */
  icon: ReactNode;
  headline: string;
  subtitle: string;
  /** Primary CTA. If omitted, the empty state is presentational only. */
  cta?: { label: string; onPress: () => void };
  /** A11y for the icon. */
  iconLabel?: string;
}

export function EmptyState({ icon, headline, subtitle, cta, iconLabel }: EmptyStateProps) {
  const { colors, spacing, typography } = useTheme();

  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 180 }}
      style={styles.root}
    >
      <View
        accessibilityLabel={iconLabel}
        accessibilityRole="image"
        style={[styles.iconWrap, { marginBottom: spacing.lg }]}
      >
        {typeof icon === 'string' ? <Text style={styles.iconText}>{icon}</Text> : icon}
      </View>

      <Text
        style={[
          typography.title,
          { color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
        ]}
      >
        {headline}
      </Text>

      <Text
        style={[
          typography.body,
          {
            color: colors.textSecondary,
            textAlign: 'center',
            paddingHorizontal: spacing.xl,
            marginBottom: spacing.xl,
            lineHeight: 22,
          },
        ]}
      >
        {subtitle}
      </Text>

      {cta ? (
        <GradientButton
          label={cta.label}
          onPress={cta.onPress}
          fullWidth={false}
          style={{ minWidth: 200 }}
        />
      ) : null}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 64,
  },
});
