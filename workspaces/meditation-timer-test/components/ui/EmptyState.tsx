import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { Canvas, Circle, LinearGradient, vec } from '@shopify/react-native-skia';
import { Button } from './Button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { IconProps } from 'phosphor-react-native';

interface EmptyStateProps {
  icon: React.ComponentType<IconProps>;
  headline: string;
  helper: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export function EmptyState({ icon: Icon, headline, helper, ctaLabel, onCtaPress }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.illustrationContainer}>
        <Canvas style={styles.canvas}>
          <Circle cx={80} cy={80} r={80}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(160, 160)}
              colors={[`${colors.accent}33`, `${colors.primary}33`]}
            />
          </Circle>
        </Canvas>
        <MotiView
          style={styles.iconOverlay}
          from={{ scale: 0.97 }}
          animate={{ scale: 1.0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 90, loop: true, repeatReverse: true }}
        >
          <Icon size={96} weight="duotone" color={colors.accent} />
        </MotiView>
      </View>
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.helper}>{helper}</Text>
      {ctaLabel && onCtaPress && (
        <View style={styles.ctaContainer}>
          <Button variant="primary" label={ctaLabel} onPress={onCtaPress} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing['2xl'] },
  illustrationContainer: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  canvas: { position: 'absolute', width: 160, height: 160 },
  iconOverlay: { position: 'absolute', width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  headline: { ...typography.displayMd, color: colors.textPrimary, textAlign: 'center', marginTop: spacing.xl },
  helper: { ...typography.bodyMd, color: colors.textSecondary, textAlign: 'center', maxWidth: 280, marginTop: spacing.sm },
  ctaContainer: { marginTop: spacing.lg },
});