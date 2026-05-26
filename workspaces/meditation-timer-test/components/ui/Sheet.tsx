import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SPRING_CONFIG = { damping: 18, stiffness: 90 };

interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  snapPoint?: number;
  children: React.ReactNode;
}

export function Sheet({ visible, onDismiss, snapPoint = 50, children }: SheetProps) {
  const sheetHeight = (SCREEN_HEIGHT * snapPoint) / 100;
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const context = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(visible ? SCREEN_HEIGHT - sheetHeight : SCREEN_HEIGHT, SPRING_CONFIG);
    backdropOpacity.value = withSpring(visible ? 1 : 0, SPRING_CONFIG);
  }, [visible, sheetHeight]);

  const gesture = Gesture.Pan()
    .onStart(() => { context.value = translateY.value; })
    .onUpdate((event) => {
      translateY.value = Math.max(context.value + event.translationY, SCREEN_HEIGHT - sheetHeight);
    })
    .onEnd((event) => {
      if (event.translationY > sheetHeight * 0.3) {
        translateY.value = withSpring(SCREEN_HEIGHT, SPRING_CONFIG, (finished) => {
          'worklet';
          if (finished) { runOnJS(onDismiss)(); }
        });
      } else {
        translateY.value = withSpring(SCREEN_HEIGHT - sheetHeight, SPRING_CONFIG);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <>
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.sheet, { height: sheetHeight }, sheetStyle]}>
          <View style={styles.handle} />
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 101, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.sm },
  content: { flex: 1, paddingHorizontal: spacing.base, paddingTop: spacing.base },
});