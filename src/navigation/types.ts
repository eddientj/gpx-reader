import type { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Home: undefined;
  RideDetail: { id: string };
  RoutePlanner: undefined;
};

export type RootTabParamList = {
  Routes: NavigatorScreenParams<RootStackParamList>;
  Record: { navigateRouteId?: string } | undefined;
  Compare: undefined;
};
