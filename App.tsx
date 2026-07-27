import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootStackParamList } from './types/navigation';
import { startSyncListener } from './services/syncService';
import { registerBackgroundSync } from './services/backgroundSyncTask'; // must be top-level import
import HomeScreen from './screens/HomeScreen';
import VerificationScreen from './screens/VerificationScreen';
import ResultScreen from './screens/ResultScreen';
import RegistrationFormScreen from './screens/RegistrationFormScreen';
import FaceRegistrationCameraScreen from './screens/FaceRegistrationCameraScreen';
import RegisteredUsersScreen from './screens/RegisteredUsersScreen';
import AdminLoginScreen from './screens/AdminLoginScreen';
import UserLoginScreen from './screens/UserLoginScreen';
import DashboardScreen from './screens/DashboardScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  React.useEffect(() => {
    startSyncListener();
    registerBackgroundSync();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0F1117' },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="Home"                    component={HomeScreen} />
          <Stack.Screen name="Verification"            component={VerificationScreen} />
          <Stack.Screen name="Result"                  component={ResultScreen} />
          <Stack.Screen name="RegistrationForm"        component={RegistrationFormScreen} />
          <Stack.Screen name="FaceRegistrationCamera"  component={FaceRegistrationCameraScreen} />
          <Stack.Screen name="RegisteredUsers"         component={RegisteredUsersScreen} />
          <Stack.Screen name="AdminLogin"              component={AdminLoginScreen} />
          <Stack.Screen name="UserLogin"              component={UserLoginScreen} />
          <Stack.Screen name="Dashboard"              component={DashboardScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
