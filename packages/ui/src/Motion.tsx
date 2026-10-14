import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from './theme';
import { Button } from './Button';

// Fade-and-rise entrance for overlay screens and profile roots.
export function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: object }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = Animated.timing(v, { toValue: 1, duration: 280, delay, useNativeDriver: true });
    t.start();
    return () => t.stop();
  }, [v, delay]);
  return (
    <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

// Consistent empty inbox/list state (glyph + title + hint + optional action).
export function EmptyState({ title, hint, actionTitle, onAction }: { title: string; hint: string; actionTitle?: string; onAction?: () => void }): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={styles.glyph}>
        <Text style={styles.glyphText}>○</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {actionTitle && onAction ? <Button title={actionTitle} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

// Pulsing placeholder block for loading stats/wallets.
export function SkeletonBlock({ height = 88 }: { height?: number }): React.JSX.Element {
  const v = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(v, { toValue: 0.4, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[styles.skel, { height, opacity: v }]} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, paddingVertical: 24, paddingHorizontal: 24 },
  glyph: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.brandSoft, alignItems: 'center', justifyContent: 'center' },
  glyphText: { fontSize: 26, color: theme.color.brand, fontWeight: '700' },
  title: { fontSize: theme.type.h, fontWeight: '700', color: theme.color.ink, textAlign: 'center' },
  hint: { fontSize: theme.type.body, color: theme.color.sub, textAlign: 'center' },
  skel: { borderRadius: theme.radius.md, backgroundColor: theme.color.line },
});
