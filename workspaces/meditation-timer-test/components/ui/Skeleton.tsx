import React from 'react';
import { StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { colors } from '../../theme/colors';

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
}

export function Skeleton({ width, height, borderRadius = 8 }: SkeletonProps) {
  return (
    <MotiView
      from={{ opacity: 0.4 }}
      animate={{ opacity: 1 }}
      transition={{ loop: true, repeatReverse: true, duration: 1000 }}
      style={[styles.skeleton, { width, height, borderRadius }]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: { backgroundColor: colors.border },
});