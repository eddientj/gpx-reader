import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CompareScreen } from "../screens/CompareScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { RecordScreen } from "../screens/RecordScreen";
import { RideDetailScreen } from "../screens/RideDetailScreen";
import { RoutePlannerScreen } from "../screens/RoutePlannerScreen";
import { useTheme } from "../theme/ThemeContext";
import type { RootStackParamList, RootTabParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

// The "Routes" tab owns its own push stack (list -> detail) — Record and
// Compare are each a single screen, so they sit directly on the tab bar
// with no nested stack of their own.
function RoutesStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "My Routes" }}
      />
      <Stack.Screen
        name="RideDetail"
        component={RideDetailScreen}
        options={{ title: "Route" }}
      />
      <Stack.Screen
        name="RoutePlanner"
        component={RoutePlannerScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const { colors, scheme } = useTheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        }}
      >
        <Tab.Screen
          name="Routes"
          component={RoutesStack}
          options={{
            headerShown: false,
            title: "Routes",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "map" : "map-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="Record"
          component={RecordScreen}
          options={{
            title: "Record",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "radio-button-on" : "radio-button-on-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="Compare"
          component={CompareScreen}
          options={{
            title: "Compare Routes",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "swap-horizontal" : "swap-horizontal-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
