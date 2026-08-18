import type { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Home: undefined;
  RideDetail: { id: string };
  RoutePlanner: { editRideId?: string } | undefined;
};

export type RootTabParamList = {
  Routes: NavigatorScreenParams<RootStackParamList>;
  MyRides: NavigatorScreenParams<RootStackParamList>;
  Record: { navigateRouteId?: string } | undefined;
  Compare: undefined;
};
