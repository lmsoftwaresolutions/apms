# Layout

Flexbox, safe areas, responsive sizing, and lists in React Native.

## Flexbox (the RN defaults differ from web)

- `flexDirection` defaults to **`column`** (web is `row`).
- `flex: 1` = fill available space along the main axis. Use on the root screen `View` to take the full height.
- `alignItems` = cross axis, `justifyContent` = main axis.
- Gap is supported: `gap`, `rowGap`, `columnGap` — prefer over margins between siblings.

```tsx
<View style={{ flex: 1 }}>
  <View style={{ flex: 1 }} />          {/* content grows */}
  <View>{/* footer pinned bottom */}</View>
</View>
```

Common recipes:
- Center a thing: `{ flex: 1, alignItems: 'center', justifyContent: 'center' }`.
- Row with space between: `{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }`.
- Pin to bottom: parent `flex: 1`, spacer `<View style={{ flex: 1 }} />` above, or `justifyContent: 'flex-end'`.

## Safe areas — never hardcode insets

Use `react-native-safe-area-context`. Wrap app in `<SafeAreaProvider>` (Expo Router does this). Then:

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const insets = useSafeAreaInsets();
<View style={{ paddingTop: insets.top, paddingBottom: insets.bottom }} />
```

- Prefer `useSafeAreaInsets()` + manual padding over `<SafeAreaView>` for control (e.g. apply top inset but let a scroll view bleed to the bottom edge).
- A scrollable list: apply `insets.bottom` to `contentContainerStyle.paddingBottom`, NOT the container — so content scrolls under the home indicator but rests above it.
- Headers/tab bars from the navigator already account for insets; don't double-pad.

## Dimensions & responsive

- `useWindowDimensions()` for live width/height (updates on rotation). Avoid the static `Dimensions.get()` snapshot.
- Avoid fixed pixel widths for content; use `flex`, percentages, `gap`, and `maxWidth`.
- Tablets / large screens: cap content width (`maxWidth: 600, alignSelf: 'center'`) so lines aren't absurdly long.
- Pixel-snap with `PixelRatio` only when you need crisp hairlines — use `StyleSheet.hairlineWidth` for 1px separators.
- Orientation/breakpoints: branch on `width` from `useWindowDimensions()`.

## Lists — use the right component

- **`FlatList`** for long/uniform data. Never `.map()` a big array inside a `ScrollView`.
- **`FlashList`** (`@shopify/flash-list`) for best perf on large lists.
- **`SectionList`** for grouped data with headers.
- **`ScrollView`** only for short, finite content (a form, a settings page).

FlatList polish:
- `contentContainerStyle={{ padding: 16, gap: 12 }}` for spacing (gap replaces `ItemSeparatorComponent` in many cases).
- `ListEmptyComponent` — always design the empty state.
- `ListHeaderComponent` / `ListFooterComponent` for non-scrolling-detached headers.
- `keyExtractor` stable ids. `getItemLayout` if rows are fixed height.
- `showsVerticalScrollIndicator={false}` for a cleaner look when appropriate.

## Keyboard

- Wrap forms in `KeyboardAvoidingView` (`behavior="padding"` iOS, often none/`height` Android) or use `react-native-keyboard-controller` for smooth handling.
- `keyboardShouldPersistTaps="handled"` on scroll/list so taps work while keyboard open.
- `keyboardDismissMode="on-drag"` for chat/scroll UIs.
