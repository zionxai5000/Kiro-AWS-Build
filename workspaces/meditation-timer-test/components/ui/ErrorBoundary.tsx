import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Warning } from 'phosphor-react-native';
import { Button } from './Button';
import { useTheme } from '../../theme/useTheme';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // In production, send to crash reporting service
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ onReset }: { onReset: () => void }) {
  const colors = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.iconContainer, { backgroundColor: colors.warningSoft }]}>
        <Warning size={48} weight="duotone" color={colors.warning} />
      </View>
      <Text style={[typography.displayMd, { color: colors.textPrimary, textAlign: 'center', marginTop: spacing.lg }]}>
        Something went wrong
      </Text>
      <Text style={[typography.bodyMd, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, maxWidth: 280 }]}>
        We hit an unexpected error. Please try again.
      </Text>
      <View style={{ marginTop: spacing.xl }}>
        <Button variant="primary" label="Try Again" onPress={onReset} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});