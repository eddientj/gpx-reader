import { type ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const PRESSED_SCALE = 0.96;
const DURATION_MS = 100;

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

type Props = {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A Pressable that scales down slightly while held — the same tactile
 * press feedback used throughout the app's primary buttons, without every
 * call site re-implementing the scale animation.
 */
export function AnimatedPressable({
  children,
  onPress,
  disabled,
  style,
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableBase
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withTiming(PRESSED_SCALE, { duration: DURATION_MS });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: DURATION_MS });
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressableBase>
  );
}
