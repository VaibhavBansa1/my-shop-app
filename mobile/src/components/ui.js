// Small UI kit: themed text, buttons, inputs, cards, list rows and a searchable picker.
import { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const light = { bg: '#f6f7f9', surface: '#ffffff', line: '#e3e6ea', ink: '#111827', text: '#374151', muted: '#6b7280',
  brand: '#0f766e', onBrand: '#ffffff', brandSoft: '#e6f4f2', danger: '#b91c1c', dangerSoft: '#fdecec', warn: '#b45309', warnSoft: '#fef3e2' };
const dark = { bg: '#0d1117', surface: '#151b23', line: '#2a313c', ink: '#f0f3f6', text: '#c9d1d9', muted: '#8b949e',
  brand: '#2dd4bf', onBrand: '#04201d', brandSoft: '#10302d', danger: '#f87171', dangerSoft: '#3a1717', warn: '#fbbf24', warnSoft: '#3a2a10' };

export function useTheme() { return useColorScheme() === 'dark' ? dark : light; }

export function Screen({ children }) {
  const t = useTheme();
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.bg }}>{children}</SafeAreaView>;
}

export function T({ style, muted, h1, h2, small, bold, children, ...rest }) {
  const t = useTheme();
  return (
    <Text style={[{ color: muted ? t.muted : h1 || h2 ? t.ink : t.text, fontSize: h1 ? 22 : h2 ? 17 : small ? 13 : 15 },
      (h1 || h2 || bold) && { fontWeight: '700' }, style]} {...rest}>{children}</Text>
  );
}

export function Card({ children, style }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }, style]}>{children}</View>;
}

export function Button({ title, onPress, kind = 'primary', disabled, busy, style, small }) {
  const t = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [{
        minHeight: small ? 36 : 46, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        backgroundColor: primary ? t.brand : t.surface, borderWidth: 1, borderColor: primary ? t.brand : kind === 'danger' ? t.danger : t.line,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }, style]}>
      {busy ? <ActivityIndicator color={primary ? t.onBrand : t.brand} />
        : <Text style={{ color: primary ? t.onBrand : kind === 'danger' ? t.danger : t.ink, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...input }) {
  const t = useTheme();
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {label ? <Text style={{ color: t.text, fontWeight: '600', fontSize: 13, marginBottom: 4 }}>{label}</Text> : null}
      <TextInput placeholderTextColor={t.muted} {...input}
        style={{ minHeight: 46, borderWidth: 1, borderColor: error ? t.danger : t.line, borderRadius: 10, paddingHorizontal: 12,
          color: t.ink, backgroundColor: t.surface, fontSize: 16 }} />
      {error ? <Text style={{ color: t.danger, fontSize: 12, marginTop: 3 }}>{error}</Text>
        : hint ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 3 }}>{hint}</Text> : null}
    </View>
  );
}

export function Note({ kind = 'error', children }) {
  const t = useTheme();
  if (!children) return null;
  const bg = kind === 'error' ? t.dangerSoft : kind === 'warn' ? t.warnSoft : t.brandSoft;
  const fg = kind === 'error' ? t.danger : kind === 'warn' ? t.warn : t.brand;
  return <View accessibilityRole="alert" style={{ backgroundColor: bg, padding: 10, borderRadius: 10, marginBottom: 10 }}><Text style={{ color: fg }}>{children}</Text></View>;
}

export function ErrorNote({ error }) { return error ? <Note>{error.message || String(error)}</Note> : null; }

export function Loading() {
  const t = useTheme();
  return <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={t.brand} /></View>;
}

export function Row({ title, subtitle, right, onPress, danger }) {
  const t = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line, gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? t.danger : t.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {typeof right === 'string' ? <Text style={{ color: t.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{right}</Text> : right}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable> : body;
}

export function Chips({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {options.map(([k, label]) => {
        const active = k === value;
        return (
          <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="button" accessibilityState={{ selected: active }}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? t.brand : t.line, backgroundColor: active ? t.brand : t.surface }}>
            <Text style={{ color: active ? t.onBrand : t.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A field that opens a searchable list. options: [{value, label, sub}] */
export function Picker({ label, value, options, onChange, placeholder = 'Choose…', allowClear }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(s)) : options;
  }, [q, options]);
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={{ color: t.text, fontWeight: '600', fontSize: 13, marginBottom: 4 }}>{label}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)}
        style={{ minHeight: 46, borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: t.surface }}>
        <Text style={{ color: selected ? t.ink : t.muted, fontSize: 16 }} numberOfLines={1}>{selected ? selected.label : placeholder}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search…" placeholderTextColor={t.muted}
              style={{ flex: 1, minHeight: 46, borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, color: t.ink, backgroundColor: t.surface }} />
            <Button small kind="secondary" title="Close" onPress={() => setOpen(false)} />
          </View>
          {allowClear && <Row title={placeholder} onPress={() => { onChange(null); setOpen(false); }} />}
          <FlatList data={filtered} keyExtractor={(o) => String(o.value)} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <Row title={item.label} subtitle={item.sub} onPress={() => { onChange(item.value); setOpen(false); setQ(''); }} />}
            ListEmptyComponent={<T muted style={{ padding: 20, textAlign: 'center' }}>Nothing found.</T>} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function Totals({ lines }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 8 }}>
      {lines.map(([label, value, grand]) => (
        <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3,
          borderTopWidth: grand ? 1 : 0, borderColor: t.line, marginTop: grand ? 6 : 0, paddingTop: grand ? 8 : 3 }}>
          <Text style={{ color: grand ? t.ink : t.text, fontWeight: grand ? '800' : '400', fontSize: grand ? 18 : 15 }}>{label}</Text>
          <Text style={{ color: grand ? t.ink : t.text, fontWeight: grand ? '800' : '500', fontSize: grand ? 18 : 15, fontVariant: ['tabular-nums'] }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}
