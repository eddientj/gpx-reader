import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { CompareScreen } from "../screens/CompareScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { MyRidesScreen } from "../screens/MyRidesScreen";
import { RecordScreen } from "../screens/RecordScreen";
import { RideDetailScreen } from "../screens/RideDetailScreen";
import { RoutePlannerScreen } from "../screens/RoutePlannerScreen";
import { listRides } from "../lib/storage";
import { prefetchWeather } from "../lib/weather";
import { useTheme } from "../theme/ThemeContext";
import type { RootStackParamList, RootTabParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const MyRidesTabStack = createNativeStackNavigator<RootStackParamList>();
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

// A separate stack (not just another screen inside RoutesStack) so "My
// Rides" and "Routes" are independent bottom tabs with their own back
// stacks — a ride's detail screen is the one component shared between the
// two, reused as-is since its behavior already keys off `ride.origin`.
function MyRidesStack() {
  const { colors } = useTheme();
  return (
    <MyRidesTabStack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <MyRidesTabStack.Screen
        name="Home"
        component={MyRidesScreen}
        options={{ title: "My Rides" }}
      />
      <MyRidesTabStack.Screen
        name="RideDetail"
        component={RideDetailScreen}
        options={{ title: "Ride" }}
      />
    </MyRidesTabStack.Navigator>
  );
}

export function RootNavigator() {
  const { colors, scheme } = useTheme();

  // Runs once regardless of which tab the user opens first — living inside
  // a single tab's screen would leave the other tab's rides never
  // backfilled until that tab happened to be visited.
  useEffect(() => {
    listRides().then((all) => {
      for (const r of all) prefetchWeather(r.id);
    });
  }, []);

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
            // Without this, leaving a drilled-into screen (ride detail,
            // route planner) and coming back to this tab later resumes
            // exactly where you left off rather than the route list — easy
            // to mistake for a stuck/broken back button.
            popToTopOnBlur: true,
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
          name="MyRides"
          component={MyRidesStack}
          options={{
            headerShown: false,
            title: "My Rides",
            popToTopOnBlur: true,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "bicycle" : "bicycle-outline"}
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
