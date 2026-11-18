# Motion, gestures, haptics

Motion is feedback, not decoration. Animate on the UI thread. Keep it fast (150–300ms) and purposeful.

## Reanimated 3 (default animation lib)

Runs on the UI thread via worklets — no JS-bridge jank. Install `react-native-reanimated`, add the Babel plugin (`react-native-reanimated/plugin`, must be **last**).

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

const scale = useSharedValue(1);
const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
// trigger:
scale.value = withSpring(0.96, { damping: 18, stiffness: 220 });
<Animated.View style={style} />
```

- **Spring** for anything driven by/responding to touch (press, drag, sheet). Feels physical.
- **Timing** with easing for discrete state changes (fade, color, height).
- Durations: micro-feedback 120–180ms, transitions 200–300ms. Longer feels sluggish on mobile.
- Use `Animated.View/Text/ScrollView`. Animate `transform` + `opacity` (cheap); avoid animating layout (`width/height/margin`) when a transform works.

## Entrance / layout animations

Built-in presets — great for lists and mounts:
```tsx
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
<Animated.View entering={FadeInDown.duration(250).delay(i * 40)} layout={Layout.springify()} />
```
Stagger list items with `.delay(index * 40)`. `layout` animates position changes (reorder, add/remove) automatically.

## Gestures (react-native-gesture-handler)

Pair with Reanimated for swipe, drag, pinch, pan. Wrap app root in `GestureHandlerRootView`.

```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
const pan = Gesture.Pan().onUpdate(e => { x.value = e.translationX; })
  .onEnd(() => { x.value = withSpring(0); });
<GestureDetector gesture={pan}><Animated.View style={style} /></GestureDetector>
```

Common: swipe-to-delete rows, draggable sheets (use `@gorhom/bottom-sheet`), pull-to-refresh (`RefreshControl`), swipeable cards.

## Shared element / screen transitions

- Expo Router / React Navigation handle native stack transitions — keep the platform default (iOS slide, Android fade-through) unless there's a reason.
- For hero/shared-element, use Reanimated shared transitions or `react-native-shared-element`.

## Haptics (expo-haptics)

Add tactile feedback to *consequential* actions — it's a huge native-feel multiplier.

```ts
import * as Haptics from 'expo-haptics';
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);   // button/toggle
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // success/error
Haptics.selectionAsync();   // picker/segment change
```

Rules: light impact on primary taps, selection on segmented/picker changes, success/error notification on submit results. Don't haptic-spam every scroll or minor tap.

## Respect reduce-motion

```ts
import { AccessibilityInfo } from 'react-native';
// or useReducedMotion() from react-native-reanimated
```
When reduce-motion is on: drop large movement/parallax, keep simple fades, shorten durations. Reanimated's `useReducedMotion()` hook gates animations cleanly.

## Don't

- No bouncy springs on everything — overshoot reads as toy-like for content UI.
- No animating during scroll on the JS thread (jank). Use `useAnimatedScrollHandler`.
- No 1000ms "cinematic" transitions in a utility app. Speed = quality on mobile.
