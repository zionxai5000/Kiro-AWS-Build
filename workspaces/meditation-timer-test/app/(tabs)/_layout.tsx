import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Lotus, ChartLine, Wind, Gear } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0 },
        tabBarBackground: () => <BlurView intensity={80} tint="default" style={{ flex: 1 }} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
      screenListeners={{
        tabPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); },
      }}
    >
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Timer', 
          tabBarIcon: ({ color }) => <Lotus size={24} weight="bold" color={color} />,
          tabBarAccessibilityLabel: 'Timer tab',
        }} 
      />
      <Tabs.Screen 
        name="breathing" 
        options={{ 
          title: 'Breathing', 
          tabBarIcon: ({ color }) => <Wind size={24} weight="bold" color={color} />,
          tabBarAccessibilityLabel: 'Breathing tab',
        }} 
      />
      <Tabs.Screen 
        name="history" 
        options={{ 
          title: 'History', 
          tabBarIcon: ({ color }) => <ChartLine size={24} weight="bold" color={color} />,
          tabBarAccessibilityLabel: 'History tab',
        }} 
      />
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: 'Settings', 
          tabBarIcon: ({ color }) => <Gear size={24} weight="bold" color={color} />,
          tabBarAccessibilityLabel: 'Settings tab',
        }} 
      />
    </Tabs>
  );
}