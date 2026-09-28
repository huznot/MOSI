import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../theme';
import { TactileButton } from './ui/TactileButton';
import { Text } from './ui/Text';

type Props = { children: React.ReactNode; title?: string };
type State = { error: Error | null };

/** Keeps a failure inside one screen from closing the whole app. */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ScreenErrorBoundary]', error);
  }

  render() {
    if (this.state.error) {
      return <Fallback title={this.props.title} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function Fallback({ title, onRetry }: { title?: string; onRetry: () => void }) {
  const { colors: c, spacing: sp, typography: ty } = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: sp.md, padding: sp.xl, backgroundColor: c.background }}>
      <MaterialCommunityIcons name="alert-circle-outline" size={44} color={c.textSoft} />
      <Text style={{ ...ty.heading, color: c.text, textAlign: 'center' }}>{title ?? 'Something went wrong'}</Text>
      <Text style={{ ...ty.body, color: c.textMuted, textAlign: 'center' }}>
        This screen hit a problem. The rest of the app still works.
      </Text>
      <TactileButton label="Try again" icon="refresh" variant="secondary" onPress={onRetry} />
    </View>
  );
}

/** Wraps a screen component in an error boundary. */
export function withScreenBoundary<P extends object>(Screen: React.ComponentType<P>, title?: string) {
  return function BoundedScreen(props: P) {
    return (
      <ScreenErrorBoundary title={title}>
        <Screen {...props} />
      </ScreenErrorBoundary>
    );
  };
}
