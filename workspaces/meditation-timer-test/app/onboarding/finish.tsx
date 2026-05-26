import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { Canvas, Circle, LinearGradient, vec } from '@shopify/react-native-skia';
import { CheckCircle } from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../../components/ui/Button';
import { useTheme } from '../../theme/useTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { motion } from '../../theme/motion';

export default function OnboardingFinish() {
  const colors = useTheme();
  const router = useRouter();

  const handleFinish = async () => {
    await AsyncStorage.setItem('hasOnboarded', 'true');
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <MotiView
        from={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'spring', ...motion.gentle }}
        style={styles.content}
      >
        {/* Illustration */}
        <View style={styles.illustrationContainer}>
          <Canvas style={styles.canvas}>
            <Circle cx={100} cy={100} r={100}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(200, 200)}
                colors={[colors.successSoft, colors.accentSoft]}
              />
            </Circle>
          </Canvas>
          <View style={styles.iconOverlay}>
            <CheckCircle size={120} weight="duotone" color={colors.success} />
          </View>
        </View>

        {/* Copy */}
        <Text style={[typography.displayLg, { color: colors.textPrimary, textAlign: 'center' }]}>
          You're All Set
        </Text>
        <Text style={[typography.bodyLg, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, paddingHorizontal: spacing.lg }]}>
          Start your mindfulness journey with your first meditation session.
        </Text>
      </MotiView>

      {/* CTA */}
      <View style={styles.footer}>
        <Button
          variant="primary"
          label="Begin Journey"
          onPress={handleFinish}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  illustrationContainer: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  canvas: { position: 'absolute', width: 200, height: 200 },
  iconOverlay: { position: 'absolute', width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});