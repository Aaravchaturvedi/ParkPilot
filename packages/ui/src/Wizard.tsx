import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { theme } from './theme';

// Minimal stepped-flow chrome: back arrow + title + "Step x of y" + progress
// bar. Screens keep a `step` number in state; pushing a page = setStep(+1).
export function WizardHeader({
  title,
  step,
  total,
  onBack,
}: {
  title: string;
  step: number;
  total: number;
  onBack?: () => void;
}): React.JSX.Element {
  return (
    <View>
      <View style={styles.row}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.titleCol}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.step}>
            Step {step + 1} of {total}
          </Text>
        </View>
        <View style={styles.backSpacer} />
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { flex: step + 1 }]} />
        <View style={{ flex: total - step - 1 }} />
      </View>
    </View>
  );
}

// Page body with a slide-and-fade entrance. Remount per step via `pageKey`
// (parent passes the step number) so the animation replays on every push.
// `fromLeft` makes Back feel like going back.
export function WizardPage({ pageKey, fromLeft, children }: { pageKey: string | number; fromLeft?: boolean; children: React.ReactNode }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    const t = Animated.timing(v, { toValue: 1, duration: 240, useNativeDriver: true });
    t.start();
    return () => t.stop();
  }, [v, pageKey]);
  const dir = fromLeft ? -1 : 1;
  return (
    <Animated.View
      style={{
        flex: 1,
        gap: 14,
        opacity: v,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [28 * dir, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.card, borderWidth: 1, borderColor: theme.color.line, alignItems: 'center', justifyContent: 'center' },
  backSpacer: { width: 40 },
  backGlyph: { fontSize: 26, fontWeight: '700', color: theme.color.ink, marginTop: -3 },
  titleCol: { flex: 1, alignItems: 'center', gap: 1 },
  title: { fontSize: theme.type.title, fontWeight: '800', color: theme.color.ink },
  step: { fontSize: theme.type.small, color: theme.color.sub, fontWeight: '600' },
  track: { flexDirection: 'row', height: 4, borderRadius: 2, backgroundColor: theme.color.line, overflow: 'hidden', marginTop: 10 },
  fill: { backgroundColor: theme.color.brand, borderRadius: 2 },
});
