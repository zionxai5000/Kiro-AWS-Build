import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { Canvas, Circle, LinearGradient, vec } from '@shopify/react-native-skia';
import { TimerIcon as Timer, Wind, ChartLine } from 'phosphor-react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useTheme } from '../../theme/useTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { motion } from '../../theme/motion';

export default function OnboardingPermissions() {
  const colors = useTheme();
  const router = useRouter();

  const features = [
    {
      icon: Timer,
      title: 'Meditation Timer',
      description: 'Set your preferred session length and track your practice',
    },
    {
      icon: Wind,
      title: 'Breathing Guides',
      description: 'Follow structured breathing patterns for deeper relaxation',
    },
    {
      icon: ChartLine,
      title: 'Progress Tracking',
      description: 'Monitor your meditation journey and build daily streaks',
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <MotiView
        from={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'spring', ...motion.gentle, delay: 100 }}
        style={styles.content}
      >
        {/* Illustration */}
        <View style={styles.illustrationContainer}>
          <Canvas style={styles.canvas}>
            <Circle cx={80} cy={80} r={80}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(160, 160)}
                colors={[colors.accentSoft, colors.primarySoft]}
              />
            </Circle>
          </Canvas>
          <View style={styles.iconOverlay}>
            <Wind size={96} weight="duotone" color={colors.accent} />
          </View>
        </View>

        {/* Copy */}
        <Text style={[typography.displayLg, { color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.lg }]}>
          Everything You Need
        </Text>

        {/* Features */}
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <MotiView
              key={feature.title}
              from={{ opacity: 0, translateX: -20 }}
              animate={{ opacity: 1, translateX: 0 }}
              transition={{ type: 'spring', ...motion.gentle, delay: 200 + index * 100 }}
            >
              <Card>
                <View style={styles.featureRow}>
                  <View style={[styles.featureIcon, { backgroundColor: colors.accentSoft }]}>
                    <feature.icon size={24} weight="duotone" color={colors.accent} />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={[typography.bodyMd, { color: colors.textPrimary, fontWeight: '600' }]}>
                      {feature.title}
                    </Text>
                    <Text style={[typography.bodySm, { color: colors.textSecondary, marginTop: 2 }]}>
                      {feature.description}
                    </Text>
                  </View>
                </View>
              </Card>
            </MotiView>
          ))}
        </View>
      </MotiView>

      {/* CTA */}
      <View style={styles.footer}>
        <Button
          variant="primary"
          label="Continue"
          onPress={() => router.push('/onboarding/finish')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing['2xl'] },
  illustrationContainer: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.xl },
  canvas: { position: 'absolute', width: 160, height: 160 },
  iconOverlay: { position: 'absolute', width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  featuresContainer: { gap: spacing.md },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  featureIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});