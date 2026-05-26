import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MotiView } from 'moti';
import { Info, ShieldCheck, FileText, EnvelopeSimple, Star, ShareNetwork, CaretRight } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { Card } from '../../components/ui/Card';
import { useTheme } from '../../theme/useTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export default function SettingsScreen() {
  const colors = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const appName = Constants.expoConfig?.name ?? 'Mindful Timer';
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const supportEmail = Constants.expoConfig?.extra?.supportEmail ?? 'support@zionx.ai';
  const privacyUrl = Constants.expoConfig?.extra?.privacyUrl ?? 'https://zionxai5000.github.io/privacy-policies/';
  const termsUrl = Constants.expoConfig?.extra?.termsUrl ?? 'https://zionxai5000.github.io/privacy-policies/terms';

  const handleLink = async (url: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Linking.openURL(url);
  };

  const handleShare = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: `Check out ${appName}!`,
      // Add App Store URL when published
    });
  };

  const items = [
    {
      icon: Info,
      title: 'About',
      subtitle: `Version ${version}`,
      onPress: () => {},
      showChevron: false,
    },
    {
      icon: EnvelopeSimple,
      title: 'Contact Support',
      subtitle: supportEmail,
      onPress: () => handleLink(`mailto:${supportEmail}`),
      showChevron: true,
    },
    {
      icon: ShieldCheck,
      title: 'Privacy Policy',
      subtitle: 'How we protect your data',
      onPress: () => handleLink(privacyUrl),
      showChevron: true,
    },
    {
      icon: FileText,
      title: 'Terms of Service',
      subtitle: 'App usage terms',
      onPress: () => handleLink(termsUrl),
      showChevron: true,
    },
    {
      icon: Star,
      title: 'Rate App',
      subtitle: 'Help others discover us',
      onPress: () => { /* App Store URL when published */ },
      showChevron: true,
    },
    {
      icon: ShareNetwork,
      title: 'Share App',
      subtitle: 'Tell your friends',
      onPress: handleShare,
      showChevron: true,
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'spring', damping: 18, stiffness: 90 }}
        style={{ flex: 1, paddingBottom: tabBarHeight + spacing.lg }}
      >
        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.lg }}>
          <Text style={[typography.displayLg, { color: colors.textPrimary, marginBottom: spacing.lg }]}>
            Settings
          </Text>
          <Card>
            {items.map((item, idx) => (
              <Pressable
                key={item.title}
                onPress={item.onPress}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.subtitle}`}
                style={[
                  styles.row,
                  idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.iconContainer, { backgroundColor: colors.accentSoft }]}>
                  <item.icon size={20} weight="duotone" color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyMd, { color: colors.textPrimary, fontWeight: '600' }]}>
                    {item.title}
                  </Text>
                  <Text style={[typography.bodySm, { color: colors.textSecondary, marginTop: 2 }]}>
                    {item.subtitle}
                  </Text>
                </View>
                {item.showChevron && (
                  <CaretRight size={16} weight="bold" color={colors.textSecondary} />
                )}
              </Pressable>
            ))}
          </Card>
        </View>
      </MotiView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});