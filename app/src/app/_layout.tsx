import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useSession } from '@/lib/session';

export default function RootLayout() {
  const scheme = useColorScheme();
  const signedIn = !!useSession();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="vehicle" options={{ title: 'Vehículo', headerBackTitle: 'Atrás' }} />
          <Stack.Screen name="upload" options={{ presentation: 'modal', title: 'Añadir PDF' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
