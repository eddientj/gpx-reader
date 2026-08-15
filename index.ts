// Must be the very first import — gesture-handler needs to install its
// native event handling before anything else in the app initializes.
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

// Registers the background location TaskManager task as a load-time side
// effect. Must happen unconditionally at startup, not only once the Record
// tab is opened — Android can relaunch the JS engine headlessly to deliver
// a queued location update while the app is killed, and that only works if
// the task was already defined before the event arrives.
import './src/lib/tracking';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
