import type { DocumentKind, SourceStatus, SpecSection, VehicleDocument, VehicleReport } from '@workshop/core';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Notice, Row, SectionTitle } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, resolveUrl } from '@/lib/api';
import { componentEs } from '@/lib/nhtsa-es';
import { addToHistory } from '@/lib/storage';

type Tab = 'ficha' | 'esquemas' | 'docs' | 'revisiones' | 'fuentes';

const KIND_LABEL: Record<DocumentKind, string> = {
  esquema_electrico: 'Esquemas eléctricos',
  manual_taller: 'Manuales de taller',
  mantenimiento: 'Mantenimiento',
  boletin_tecnico: 'Boletines técnicos',
  manual_usuario: 'Manual del propietario',
  informe_oficial: 'Informes oficiales',
  recambios: 'Recambios',
  ficha_rescate: 'Fichas de rescate',
  otro: 'Otros',
};
const KIND_ORDER: DocumentKind[] = [
  'manual_taller',
  'mantenimiento',
  'boletin_tecnico',
  'manual_usuario',
  'ficha_rescate',
  'informe_oficial',
  'recambios',
  'otro',
];

const STATUS: Record<SourceStatus, { label: string; color: ThemeColor }> = {
  ok: { label: 'OK', color: 'success' },
  empty: { label: 'Sin datos', color: 'warning' },
  error: { label: 'Error', color: 'danger' },
  not_configured: { label: 'No configurado', color: 'textSecondary' },
  skipped: { label: 'No aplica', color: 'textSecondary' },
};

export default function VehicleScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ vin?: string; plate?: string }>();
  const [report, setReport] = useState<VehicleReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('ficha');

  const fetchReport = useCallback(
    () => (params.vin ? api.byVin(params.vin) : api.byPlate(params.plate ?? '')),
    [params.vin, params.plate],
  );

  const onLoaded = useCallback(
    (r: VehicleReport) => {
      setReport(r);
      setError(null);
      setLoading(false);
      addToHistory({
        type: params.vin ? 'vin' : 'plate',
        value: params.vin ?? params.plate ?? '',
        vin: r.query.vin,
        plate: r.query.plate ?? params.plate,
        summary: r.summary,
        at: new Date().toISOString(),
      }).catch(() => {});
    },
    [params.vin, params.plate],
  );

  const onFailed = useCallback((e: unknown) => {
    setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    setLoading(false);
  }, []);

  // Se recarga al volver a la pantalla (p. ej. tras subir un PDF a la biblioteca).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchReport().then(
        (r) => active && onLoaded(r),
        (e) => active && onFailed(e),
      );
      return () => {
        active = false;
      };
    }, [fetchReport, onLoaded, onFailed]),
  );

  const load = () => {
    setLoading(true);
    setError(null);
    fetchReport().then(onLoaded, onFailed);
  };

  const title = report ? [report.summary.make, report.summary.model].filter(Boolean).join(' ') || 'Vehículo' : 'Buscando…';

  if (loading && !report) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator size="large" color={t.accent} />
        <ThemedText themeColor="textSecondary">Consultando fuentes…</ThemedText>
      </View>
    );
  }

  if (error || !report) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Stack.Screen options={{ title: 'Error' }} />
        <Notice text={error ?? 'Sin datos'} tone="danger" />
        <Button title="Reintentar" onPress={load} />
      </View>
    );
  }

  const s = report.summary;
  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Stack.Screen options={{ title }} />

      <Card style={{ gap: Spacing.three }}>
        <View>
          <ThemedText style={{ fontSize: 26, lineHeight: 32, fontWeight: 800 }}>{title}</ThemedText>
          {(s.variant || s.year) && (
            <ThemedText themeColor="textSecondary">{[s.variant, s.year].filter(Boolean).join(' · ')}</ThemedText>
          )}
        </View>
        <View style={styles.chips}>
          {[s.platform && `Plataforma ${s.platform}`, s.fuel, s.engine, s.body, s.engineCode && `Motor ${s.engineCode}`, s.ktype && `K-Type ${s.ktype}`]
            .filter((x): x is string => !!x)
            .map((c) => (
              <Badge key={c} label={c} />
            ))}
        </View>
        {report.query.plate && <IdLine label="Matrícula" value={report.plate?.display ?? report.query.plate} />}
        {report.query.vin && <IdLine label="VIN" value={report.query.vin} />}
      </Card>

      {report.warnings.map((w) => (
        <Notice key={w} text={w} />
      ))}

      <View style={[styles.segment, { backgroundColor: t.backgroundElement }]}>
        {(
          [
            ['ficha', 'Ficha'],
            ['esquemas', 'Esquemas'],
            ['docs', 'Docs'],
            ['revisiones', `Avisos${report.recalls.length ? ` (${report.recalls.length})` : ''}`],
            ['fuentes', 'Fuentes'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={[styles.segmentItem, tab === id && { backgroundColor: t.background }]}>
            <ThemedText type="smallBold" themeColor={tab === id ? 'text' : 'textSecondary'}>
              {label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {tab === 'ficha' && (report.specs.length ? report.specs.map((sec) => <SpecCard key={sec.id} section={sec} />) : <Notice text="Sin especificaciones disponibles." />)}

      {tab === 'esquemas' && <WiringTab report={report} onChanged={load} />}

      {tab === 'docs' && (
        <DocumentsTab report={report} docs={report.documents.filter((d) => d.kind !== 'esquema_electrico')} onChanged={load} />
      )}

      {tab === 'revisiones' && <AlertsTab report={report} />}

      {tab === 'fuentes' && (
        <Card>
          {report.sources.map((src) => (
            <View key={src.provider} style={[styles.sourceRow, { borderBottomColor: t.border }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText type="smallBold">{src.label}</ThemedText>
                {src.message && <ThemedText type="small" themeColor="textSecondary">{src.message}</ThemedText>}
              </View>
              <Badge label={STATUS[src.status].label} color={STATUS[src.status].color} />
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            Generado {new Date(report.generatedAt).toLocaleString('es-ES')}
          </ThemedText>
        </Card>
      )}
    </ScrollView>
  );
}

function IdLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={{ fontFamily: Fonts?.mono, letterSpacing: 1 }}>
        {value} <ThemedText type="small" themeColor="textSecondary">{copied ? '✓ copiado' : '⧉'}</ThemedText>
      </ThemedText>
    </Pressable>
  );
}

function SpecCard({ section }: { section: SpecSection }) {
  const [open, setOpen] = useState(true);
  return (
    <Card>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold">{section.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Fuente: {section.source}
          </ThemedText>
        </View>
        <ThemedText themeColor="textSecondary">{open ? '▾' : '▸'}</ThemedText>
      </Pressable>
      {open && section.items.map((i, idx) => <Row key={`${i.label}-${idx}`} label={i.label} value={i.value} mono={i.label === 'VIN'} />)}
    </Card>
  );
}

function AlertsTab({ report }: { report: VehicleReport }) {
  const t = useTheme();
  const c = report.complaints;
  const max = c?.byComponent[0]?.count ?? 1;
  return (
    <View style={{ gap: Spacing.two }}>
      <SectionTitle>Llamadas a revisión</SectionTitle>
      {report.recalls.length ? (
        report.recalls.map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
              <ThemedText type="smallBold" style={{ flex: 1 }}>
                {r.component ? componentEs(r.component) : 'Campaña'}
              </ThemedText>
              <Badge label={r.id} />
            </View>
            {r.date && <ThemedText type="small" themeColor="textSecondary">{r.date} · {r.source}</ThemedText>}
            <ThemedText type="small">{r.summary}</ThemedText>
            {r.consequence && <ThemedText type="small" themeColor="textSecondary">Riesgo: {r.consequence}</ThemedText>}
            {r.remedy && <ThemedText type="small" themeColor="textSecondary">Solución: {r.remedy}</ThemedText>}
          </Card>
        ))
      ) : (
        <Notice
          tone="success"
          text={
            report.sources.find((x) => x.provider === 'nhtsa-recalls')?.message ??
            'No hay llamadas a revisión registradas en las fuentes consultadas.'
          }
        />
      )}

      <SectionTitle right={c ? <Badge label={`${c.total} quejas`} /> : undefined}>Averías reportadas</SectionTitle>
      {!c ? (
        <Notice
          text={
            report.sources.find((x) => x.provider === 'nhtsa-complaints')?.message ??
            'Sin datos de quejas para este vehículo.'
          }
        />
      ) : (
        <>
          {c.note && <Notice text={c.note} />}
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              Componentes con más quejas
            </ThemedText>
            {c.byComponent.map((b) => (
              <View key={b.component} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
                  <ThemedText type="small" style={{ flex: 1 }}>
                    {componentEs(b.component)}
                  </ThemedText>
                  <ThemedText type="smallBold">{b.count}</ThemedText>
                </View>
                <View style={[styles.barTrack, { backgroundColor: t.backgroundSelected }]}>
                  <View style={[styles.barFill, { width: `${(b.count / max) * 100}%`, backgroundColor: t.accent }]} />
                </View>
              </View>
            ))}
          </Card>
          <SectionTitle>Últimas quejas</SectionTitle>
          {c.recent.map((q) => (
            <Card key={q.id}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one }}>
                {q.components.map((comp) => (
                  <Badge key={comp} label={componentEs(comp)} />
                ))}
                {q.fire && <Badge label="Incendio" color="danger" />}
                {q.crash && <Badge label="Accidente" color="danger" />}
              </View>
              <ThemedText type="small" numberOfLines={6}>
                {q.summary}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {q.date} · ODI {q.id}
              </ThemedText>
            </Card>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            Fuente: {c.source}. Los textos son de los propios usuarios (en inglés).
          </ThemedText>
        </>
      )}
    </View>
  );
}

async function openDocument(d: VehicleDocument) {
  if (d.copyValue) await Clipboard.setStringAsync(d.copyValue);
  await WebBrowser.openBrowserAsync(resolveUrl(d.url));
}

function confirmDelete(d: VehicleDocument, onDeleted: () => void) {
  if (!d.libraryId) return;
  const run = () => api.deletePdf(d.libraryId!).then(onDeleted, (e) => Alert.alert('No se pudo borrar', String(e?.message ?? e)));
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`¿Borrar "${d.title}" de tu biblioteca?`)) run();
    return;
  }
  Alert.alert('Borrar PDF', `¿Borrar "${d.title}" de tu biblioteca?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Borrar', style: 'destructive', onPress: run },
  ]);
}

const TRUST_BADGE: Record<VehicleDocument['trust'], { label: string; color: ThemeColor }> = {
  propio: { label: 'Tuyo', color: 'accent' },
  oficial: { label: 'Oficial', color: 'success' },
  licencia: { label: 'Licencia', color: 'success' },
  busqueda: { label: 'Búsqueda', color: 'textSecondary' },
};

function DocCard({ d, onChanged }: { d: VehicleDocument; onChanged?: () => void }) {
  return (
    <Pressable
      onPress={() => openDocument(d)}
      onLongPress={d.libraryId && onChanged ? () => confirmDelete(d, onChanged) : undefined}
      accessibilityRole="link"
      accessibilityHint={d.libraryId ? 'Mantén pulsado para borrarlo' : undefined}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
          <ThemedText type="smallBold" style={{ flex: 1 }}>
            {d.libraryId ? '📄 ' : ''}
            {d.title}
          </ThemedText>
          <Badge label={TRUST_BADGE[d.trust].label} color={TRUST_BADGE[d.trust].color} />
        </View>
        {d.note && <ThemedText type="small" themeColor="textSecondary">{d.note}</ThemedText>}
        {d.copyValue && (
          <ThemedText type="small" themeColor="accent">
            ⧉ Copia {d.copyValue} y abre
          </ThemedText>
        )}
        {d.libraryId && (
          <ThemedText type="small" themeColor="textSecondary">
            Mantén pulsado para borrarlo
          </ThemedText>
        )}
      </Card>
    </Pressable>
  );
}

function openUpload(report: VehicleReport, kind: DocumentKind) {
  router.push({
    pathname: '/upload',
    params: {
      kind,
      ...(report.query.vin ? { vin: report.query.vin } : {}),
      ...(report.summary.make ? { make: report.summary.make } : {}),
      ...(report.summary.model ? { model: report.summary.model } : {}),
    },
  });
}

function DocGroup({ title, docs, onChanged }: { title: string; docs: VehicleDocument[]; onChanged: () => void }) {
  if (!docs.length) return null;
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      {docs.map((d) => (
        <DocCard key={d.libraryId ?? d.url} d={d} onChanged={onChanged} />
      ))}
    </>
  );
}

function WiringTab({ report, onChanged }: { report: VehicleReport; onChanged: () => void }) {
  const wiring = report.documents
    .filter((d) => d.kind === 'esquema_electrico')
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  if (!report.query.vin) {
    return (
      <View style={{ gap: Spacing.three }}>
        <Notice text="Los esquemas eléctricos se buscan con el VIN: así salen los de esa unidad exacta (motor, equipamiento, año). Escanea el bastidor para continuar." />
        <Button title="Escanear VIN" onPress={() => router.push({ pathname: '/scan', params: { kind: 'vin' } })} />
      </View>
    );
  }
  return (
    <View style={{ gap: Spacing.two }}>
      <DocGroup title="Tus PDFs" docs={wiring.filter((d) => d.trust === 'propio')} onChanged={onChanged} />
      <DocGroup title="Portal oficial del fabricante" docs={wiring.filter((d) => d.trust === 'oficial' || d.trust === 'licencia')} onChanged={onChanged} />
      <DocGroup title="Búsquedas dirigidas" docs={wiring.filter((d) => d.trust === 'busqueda')} onChanged={onChanged} />
      <Button title="＋ Añadir esquema en PDF" variant="secondary" onPress={() => openUpload(report, 'esquema_electrico')} />
    </View>
  );
}

function DocumentsTab({ report, docs, onChanged }: { report: VehicleReport; docs: VehicleDocument[]; onChanged: () => void }) {
  const mine = docs.filter((d) => d.trust === 'propio');
  const rest = docs.filter((d) => d.trust !== 'propio');
  return (
    <View style={{ gap: Spacing.two }}>
      <DocGroup title="Tus PDFs" docs={mine} onChanged={onChanged} />
      {KIND_ORDER.filter((k) => rest.some((d) => d.kind === k)).map((kind) => (
        <View key={kind}>
          <SectionTitle>{KIND_LABEL[kind]}</SectionTitle>
          <View style={{ gap: Spacing.two }}>
            {rest
              .filter((d) => d.kind === kind)
              .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
              .map((d) => (
                <DocCard key={d.url} d={d} />
              ))}
          </View>
        </View>
      ))}
      {(report.query.vin || report.summary.make) && (
        <Button title="＋ Añadir PDF a la biblioteca" variant="secondary" onPress={() => openUpload(report, 'manual_taller')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: Radius.md - 3 },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
