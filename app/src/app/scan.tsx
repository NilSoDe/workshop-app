import { detectQuery } from '@workshop/core';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Notice } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';

type Kind = 'plate' | 'vin';

const COPY: Record<Kind, { title: string; tip: string; guide: { aspect: number; width: string } }> = {
  plate: {
    title: 'Matrícula',
    tip: 'Encuadra la placa completa dentro del marco, de frente y sin reflejos.',
    guide: { aspect: 4.7, width: '88%' },
  },
  vin: {
    title: 'VIN / bastidor',
    tip: 'Busca el VIN en la base del parabrisas, en el pilar de la puerta del conductor o en la ficha técnica (campo E).',
    guide: { aspect: 7, width: '92%' },
  },
};

export default function ScanScreen() {
  const t = useTheme();
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = kindParam === 'vin' ? 'vin' : 'plate';
  const copy = COPY[kind];
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ candidates: string[]; text: string; provider: string } | null>(null);
  const [manual, setManual] = useState('');

  const go = (value: string) => {
    const d = detectQuery(value);
    if (!d) {
      setError(kind === 'vin' ? 'Eso no parece un VIN válido de 17 caracteres.' : 'Eso no parece una matrícula española válida.');
      return;
    }
    router.replace({ pathname: '/vehicle', params: d.type === 'vin' ? { vin: d.value } : { plate: d.value } });
  };

  const capture = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9 });
      // Reducimos la imagen: el OCR va igual de bien y la subida es mucho más rápida.
      const rendered = await ImageManipulator.manipulate(photo.uri).resize({ width: 1600 }).renderAsync();
      const saved = await rendered.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
      if (!saved.base64) throw new Error('No se pudo procesar la foto');
      const ocr = await api.ocr(kind, saved.base64);
      setResult(ocr);
      setManual(ocr.candidates[0] ?? '');
      if (ocr.candidates.length === 0) setError('No he encontrado ninguna ' + (kind === 'vin' ? 'secuencia VIN' : 'matrícula') + ' en la foto. Prueba otra vez o escríbelo.');
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: t.background }]}>
        <ThemedText type="smallBold" style={{ textAlign: 'center' }}>
          Necesito acceso a la cámara para leer la {copy.title.toLowerCase()}.
        </ThemedText>
        <Button title="Dar permiso" onPress={requestPermission} />
        <Button title="Cancelar" variant="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (result) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
        <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Resultado</ThemedText>
          {error && <Notice text={error} />}
          {result.candidates.map((c, i) => (
            <Pressable key={c} onPress={() => go(c)}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <ThemedText style={{ fontFamily: Fonts?.mono, fontSize: 20, letterSpacing: 1.5 }}>{c}</ThemedText>
                <ThemedText themeColor="textSecondary">{i === 0 ? 'Mejor opción ›' : '›'}</ThemedText>
              </Card>
            </Pressable>
          ))}
          <Card>
            <ThemedText type="smallBold">Corregir a mano</ThemedText>
            <TextInput
              value={manual}
              onChangeText={setManual}
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={() => go(manual)}
              style={[styles.input, { color: t.text, borderColor: t.border, fontFamily: Fonts?.mono }]}
            />
            <Button title="Buscar" onPress={() => go(manual)} disabled={!manual.trim()} />
          </Card>
          {result.text ? (
            <ThemedText type="small" themeColor="textSecondary">
              Texto leído ({result.provider}): {result.text.slice(0, 300)}
            </ThemedText>
          ) : null}
          <Button title="Repetir foto" variant="secondary" onPress={() => { setResult(null); setError(null); }} />
          <Button title="Cancelar" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ThemedText style={styles.overlayText}>✕ Cerrar</ThemedText>
          </Pressable>
          <ThemedText style={[styles.overlayText, { fontWeight: 700 }]}>{copy.title}</ThemedText>
          <Pressable onPress={() => setTorch((v) => !v)} hitSlop={12}>
            <ThemedText style={styles.overlayText}>{torch ? '🔦 On' : '🔦 Off'}</ThemedText>
          </Pressable>
        </View>

        <View style={styles.guideWrap} pointerEvents="none">
          <View style={[styles.guide, { aspectRatio: copy.guide.aspect, width: copy.guide.width as `${number}%`, borderColor: t.accent }]} />
          <ThemedText style={[styles.overlayText, styles.tip]}>{copy.tip}</ThemedText>
        </View>

        <View style={styles.bottom}>
          {error && <Notice text={error} tone="danger" />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hacer foto"
            onPress={capture}
            disabled={busy}
            style={({ pressed }) => [styles.shutter, { opacity: busy ? 0.5 : pressed ? 0.8 : 1, borderColor: t.accent }]}>
            <View style={[styles.shutterInner, { backgroundColor: busy ? '#999' : '#fff' }]} />
          </Pressable>
          <ThemedText style={styles.overlayText}>{busy ? 'Leyendo…' : 'Toca para capturar'}</ThemedText>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.three },
  overlayText: { color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  guideWrap: { alignItems: 'center', gap: Spacing.three },
  guide: { borderWidth: 3, borderRadius: Radius.sm },
  tip: { textAlign: 'center', paddingHorizontal: Spacing.four, fontSize: 14 },
  bottom: { alignItems: 'center', gap: Spacing.two, padding: Spacing.four },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30 },
  input: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.three, fontSize: 18 },
});
