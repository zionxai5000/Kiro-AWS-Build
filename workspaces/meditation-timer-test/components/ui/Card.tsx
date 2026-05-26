import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';

interface CardProps {
  children: React.ReactNode;
  level?: 1 | 2;
}

export function Card({ children, level = 1 }: CardProps) {
  return (
    <View style={[styles.card, level === 2 ? shadows.level2 : shadows.level1]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: spacing.base,
    borderRadius: 16,
  },
});