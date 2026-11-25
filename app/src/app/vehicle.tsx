import type { DocumentKind, SourceStatus, SpecSection, VehicleDocument, VehicleReport } from '@workshop/core';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Notice, Row, SectionTitle } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
import { addToHistory } from '@/lib/storage';

type Tab = 'ficha' | 'docs' | 'revisiones' | 'fuentes';

const KIND_LABEL: Record<DocumentKind, string> = {
  esquema_electrico: 'Esquemas eléctricos',
  manual_taller: 'Manuales de taller',
  mantenimiento: 'Mantenimiento',
  boletin_tecnico: 'Boletines técnicos',
  manual_usuario: 'Manual del propietario',
  informe_oficial: 'Informes oficiales',
  recambios: 'Recambios',
  otro: 'Otros',
};
const KIND_ORDER: DocumentKind[] = [
  'esquema_electrico',
  'manual_taller',
  'mantenimiento',
  'boletin_tecnico',
  'manual_usuario',
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

  useEffect(() => {
    let active = true;
    fetchReport().then(
      (r) => active && onLoaded(r),
      (e) => active && onFailed(e),
    );
    return () => {
      active = false;
    };
  }, [fetchReport, onLoaded, onFailed]);

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
          {[s.fuel, s.engine, s.body, s.engineCode && `Motor ${s.engineCode}`, s.ktype && `K-Type ${s.ktype}`]
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
            ['docs', 'Docs'],
            ['revisiones', `Revisiones${report.recalls.length ? ` (${report.recalls.length})` : ''}`],
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

      {tab === 'docs' && <DocumentsTab docs={report.documents} sources={report.sources} />}

      {tab === 'revisiones' &&
        (report.recalls.length ? (
          report.recalls.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
                <ThemedText type="smallBold" style={{ flex: 1 }}>
                  {r.component ?? 'Campaña'}
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
        ))}

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

function DocumentsTab({ docs, sources }: { docs: VehicleDocument[]; sources: VehicleReport['sources'] }) {
  const t = useTheme();
  const licensed = sources.filter((s) => ['haynespro', 'autodata', 'tecdoc'].includes(s.provider));
  const pending = licensed.filter((s) => s.status === 'not_configured');
  return (
    <View style={{ gap: Spacing.two }}>
      {pending.length > 0 && (
        <Notice
          text={`Esquemas eléctricos y manuales oficiales completos requieren un proveedor con licencia (${pending
            .map((p) => p.label)
            .join(', ')}). Mientras tanto se muestran fuentes oficiales y búsquedas dirigidas.`}
        />
      )}
      {KIND_ORDER.filter((k) => docs.some((d) => d.kind === k)).map((kind) => (
        <View key={kind}>
          <SectionTitle>{KIND_LABEL[kind]}</SectionTitle>
          <View style={{ gap: Spacing.two }}>
            {docs
              .filter((d) => d.kind === kind)
              .map((d) => (
                <Pressable key={d.url} onPress={() => WebBrowser.openBrowserAsync(d.url)}>
                  <Card>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
                      <ThemedText type="smallBold" style={{ flex: 1, color: t.text }}>
                        {d.title}
                      </ThemedText>
                      <Badge
                        label={d.trust === 'oficial' ? 'Oficial' : d.trust === 'licencia' ? 'Licencia' : 'Búsqueda'}
                        color={d.trust === 'busqueda' ? 'textSecondary' : 'success'}
                      />
                    </View>
                    {d.note && <ThemedText type="small" themeColor="textSecondary">{d.note}</ThemedText>}
                  </Card>
                </Pressable>
              ))}
          </View>
        </View>
      ))}
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
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
