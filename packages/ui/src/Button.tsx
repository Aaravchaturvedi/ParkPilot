import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  small?: boolean;
  block?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
}

// Press-and-shrink feedback on every button in both apps (single component,
// so the whole product animates consistently). API is backward compatible.
export function Button({ title, onPress, disabled, variant = 'primary', small, block, loading, icon, iconPosition = 'left', style }: Props): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number): void => {
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const labelStyles = {
    primary: styles.primaryLabel,
    secondary: styles.secondaryLabel,
    danger: styles.dangerLabel,
    ghost: styles.ghostLabel,
  } as const;
  const busy = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={busy}
      onPressIn={() => press(0.96)}
      onPressOut={() => press(1)}
      style={[styles.base, styles[variant], small && styles.small, block && styles.block, busy && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'secondary' || variant === 'ghost' ? theme.color.brand : '#fff'} />
      ) : (
        <Animated.View style={[styles.innerRow, { transform: [{ scale }] }]}>
          {icon && iconPosition === 'left' ? <View style={styles.iconLeft}>{icon}</View> : null}
          <Text style={[styles.label, labelStyles[variant], small && styles.smallLabel]}>
            {title}
          </Text>
          {icon && iconPosition === 'right' ? <View style={styles.iconRight}>{icon}</View> : null}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: theme.radius.md, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  small: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: theme.radius.sm },
  primary: { backgroundColor: theme.color.brand },
  secondary: { backgroundColor: theme.color.card, borderWidth: 1, borderColor: theme.color.line },
  danger: { backgroundColor: theme.color.danger },
  ghost: { backgroundColor: 'transparent' },
  block: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  innerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconLeft: { marginRight: 8 },
  iconRight: { marginLeft: 8 },
  label: { fontWeight: '700', fontSize: 16 },
  smallLabel: { fontSize: 14 },
  primaryLabel: { color: '#fff' },
  secondaryLabel: { color: theme.color.ink },
  dangerLabel: { color: '#fff' },
  ghostLabel: { color: theme.color.brand },
});
