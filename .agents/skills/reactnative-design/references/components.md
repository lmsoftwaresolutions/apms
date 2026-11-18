# Reusable component craft

Build a small set of well-made primitives; compose screens from them. All examples consume tokens from `theming.md` (`useTheme()`, `space`, `radius`, `type`).

## Pressable feedback (foundation)

Always give touch feedback. `Pressable` with a function style for pressed state. On Android add `android_ripple`.

```tsx
<Pressable
  android_ripple={{ color: t.border }}
  style={({ pressed }) => [
    styles.base,
    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
  ]}
  hitSlop={8}
/>
```

Use `hitSlop` to reach 44pt targets without bloating layout. Never use bare `TouchableOpacity` for new code — `Pressable` is the modern API.

## Button

One component, variants by prop. Primary = filled accent, secondary = tinted/outline, ghost = text only. Sizes from token scale.

```tsx
function Button({ title, variant = 'primary', onPress, disabled, loading }) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : variant === 'secondary' ? t.surface : 'transparent';
  const fg = variant === 'primary' ? t.accentText : t.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{ color: '#0003' }}
      style={({ pressed }) => [{
        height: 50, borderRadius: radius.md, paddingHorizontal: space.xl,
        alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
        backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.9 : 1,
        borderWidth: variant === 'secondary' ? 1 : 0, borderColor: t.border,
      }]}
    >
      {loading
        ? <ActivityIndicator color={fg} />
        : <Text style={{ ...type.body, fontWeight: '600', color: fg }}>{title}</Text>}
    </Pressable>
  );
}
```

Rules: ONE primary button per screen. 44–52pt tall. Loading state shows a spinner, not a frozen button. Disabled is visibly dimmed.

## Card / surface

```tsx
<View style={{
  backgroundColor: t.surfaceElevated, borderRadius: radius.lg,
  padding: space.lg, ...shadow.card,           // shadow OR border, not both
}} />
```

Don't stack shadow + border + gradient. Pick one depth cue.

## List row

Standard settings/list cell: leading icon, title + subtitle, trailing chevron/value.

```tsx
<Pressable android_ripple={{ color: t.border }} style={{
  flexDirection: 'row', alignItems: 'center', gap: space.md,
  paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 48,
}}>
  <Icon name="bell" size={20} color={t.textMuted} />
  <View style={{ flex: 1 }}>
    <Text style={{ ...type.body, color: t.text }}>Notifications</Text>
    <Text style={{ ...type.footnote, color: t.textMuted }}>Push, email</Text>
  </View>
  <Icon name="chevron-right" size={18} color={t.textMuted} />
</Pressable>
```

Separators: a 1px `StyleSheet.hairlineWidth` line inset to align with text (left padding = icon width + gap), or use `gap` between cards.

## Text input

```tsx
<View>
  <Text style={{ ...type.footnote, color: t.textMuted, marginBottom: space.xs }}>Email</Text>
  <TextInput
    placeholder="you@example.com"
    placeholderTextColor={t.textMuted}
    keyboardType="email-address" autoCapitalize="none" autoComplete="email"
    style={{
      ...type.body, color: t.text, backgroundColor: t.surface,
      borderRadius: radius.md, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: space.lg, height: 48,
    }}
  />
</View>
```

Polish: label above (not just placeholder — placeholders vanish on type). Correct `keyboardType`, `autoCapitalize`, `autoComplete`, `textContentType`. Focus state = accent border. Error state = danger border + message below.

## Bottom sheet

Use `@gorhom/bottom-sheet` (built on Reanimated + Gesture Handler) — don't hand-roll. Snap points, backdrop, gesture-to-dismiss come for free. Wrap app in `GestureHandlerRootView` and `BottomSheetModalProvider`.

```tsx
const ref = useRef<BottomSheetModal>(null);
<BottomSheetModal ref={ref} snapPoints={['50%', '90%']}
  backgroundStyle={{ backgroundColor: t.surfaceElevated }}
  handleIndicatorStyle={{ backgroundColor: t.border }}>
  <BottomSheetView style={{ padding: space.lg }}>{/* content */}</BottomSheetView>
</BottomSheetModal>
```

## Tab bar

Prefer the navigator's built-in tab bar (Expo Router `Tabs`, or `expo-router` native tabs / `react-native-bottom-tabs`) for true native feel + haptics. Custom tab bars: keep 48dp targets, active = accent icon+label, inactive = muted, respect bottom inset.

## Icons

Use one icon set consistently (`@expo/vector-icons`, `lucide-react-native`, or SF Symbols via `expo-symbols` on iOS). Consistent size (usually 20–24) and stroke weight. Never mix emoji and icon sets.

## Avatar, badge, chip, skeleton

- **Avatar:** square image with `borderRadius: radius.full`, fallback to initials on a colored bg.
- **Badge:** small pill, `borderRadius: radius.full`, semantic bg, `type.caption`.
- **Chip:** tappable pill, selected = accent tint.
- **Skeleton:** gray blocks with a subtle shimmer (Reanimated) — better loading UX than a centered spinner.
