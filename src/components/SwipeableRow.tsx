import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme, type Theme } from "../theme/ThemeContext";

const DELETE_WIDTH = 84;
const OPEN_THRESHOLD = DELETE_WIDTH / 2;
const SPRING_CONFIG = { damping: 22, stiffness: 280 };

type Props = {
  children: React.ReactNode;
  onDelete: () => void;
};

export function SwipeableRow({ children, onDelete }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // openOffset tracks the row's resting position (0 = closed, -DELETE_WIDTH
  // = open) between gestures; translateX is what's actually animated.
  const openOffset = useSharedValue(0);
  const translateX = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-8, 8])
    .onUpdate((event) => {
      translateX.value = Math.min(
        0,
        Math.max(-DELETE_WIDTH, openOffset.value + event.translationX)
      );
    })
    .onEnd((event) => {
      const projected = openOffset.value + event.translationX;
      openOffset.value = projected < -OPEN_THRESHOLD ? -DELETE_WIDTH : 0;
      translateX.value = withSpring(openOffset.value, SPRING_CONFIG);
    });

  const foregroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.deleteBackground}>
        <Pressable style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.foreground, foregroundStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      justifyContent: "center",
      overflow: "hidden",
    },
    deleteBackground: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "stretch",
      // Fills the whole row, not just the button's width — otherwise the
      // transparent area behind the sliding foreground can show a seam of
      // whatever's underneath during the animation.
      backgroundColor: colors.danger,
    },
    deleteButton: {
      width: DELETE_WIDTH,
      justifyContent: "center",
      alignItems: "center",
    },
    deleteText: {
      color: colors.dangerText,
      fontWeight: "600",
      fontSize: 13,
    },
    foreground: {
      backgroundColor: colors.background,
    },
  });
}
