import { type ComponentRef, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Notice } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { setSession } from '@/lib/session';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const t = useTheme();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passRef = useRef<ComponentRef<typeof TextInput>>(null);

  const isRegister = mode === 'register';

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError('Rellena el email y la contraseña');
      return;
    }
    setBusy(true);
    try {
      const s = isRegister
        ? await api.register(email.trim(), password, name.trim() || undefined)
        : await api.login(email.trim(), password);
      await setSession(s); // el guard del layout te lleva a la app
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const input = [styles.input, { color: t.text, borderColor: t.border }];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <ThemedText type="title">Workshop</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Matrícula o VIN → toda la información del vehículo
            </ThemedText>
          </View>

          <Card style={{ gap: Spacing.two }}>
            <ThemedText type="subtitle" style={{ fontSize: 24, lineHeight: 30 }}>
              {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </ThemedText>

            {isRegister && (
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nombre (opcional)"
                placeholderTextColor={t.textSecondary}
                autoComplete="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                style={input}
              />
            )}
            <TextInput
              ref={emailRef}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={t.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
              style={input}
            />
            <TextInput
              ref={passRef}
              value={password}
              onChangeText={setPassword}
              placeholder={isRegister ? 'Contraseña (mín. 8 caracteres)' : 'Contraseña'}
              placeholderTextColor={t.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              textContentType={isRegister ? 'newPassword' : 'password'}
              returnKeyType="go"
              onSubmitEditing={submit}
              style={[input, { fontFamily: Fonts?.mono }]}
            />

            {error && <Notice text={error} tone="danger" />}

            <Button title={isRegister ? 'Crear cuenta' : 'Entrar'} onPress={submit} loading={busy} />
          </Card>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode(isRegister ? 'login' : 'register');
              setError(null);
            }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {isRegister ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
              <ThemedText type="smallBold">{isRegister ? 'Inicia sesión' : 'Regístrate'}</ThemedText>
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.three,
    gap: Spacing.four,
    width: '100%',
    maxWidth: Math.min(MaxContentWidth, 440),
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', gap: Spacing.two },
  input: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.three, fontSize: 16 },
});
