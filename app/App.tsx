import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, Text, ToastAndroid, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TyphoonData } from './src/types';
import { DEFAULT_SETTINGS, cachedData, fetchData, loadSettings, saveSettings, type Settings } from './src/data';
import { checkAndNotify, registerBackground, setupNotifications } from './src/notify';
import { C } from './src/theme';
import { fmtTime } from './src/logic';
import StatusScreen from './src/screens/StatusScreen';
import MapScreen from './src/screens/MapScreen';
import CountiesScreen from './src/screens/CountiesScreen';
import WeatherScreen from './src/screens/WeatherScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const TABS = [
  { k: 'status', label: '現況' },
  { k: 'map', label: '路徑' },
  { k: 'county', label: '縣市' },
  { k: 'weather', label: '風雨' },
  { k: 'settings', label: '設定' },
] as const;
type Tab = (typeof TABS)[number]['k'];

const REFRESH_MS = 5 * 60 * 1000;

function Main() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('status');
  const [data, setData] = useState<TyphoonData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [bgOk, setBgOk] = useState<boolean | null>(null);
  const first = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchData();
      setData(d);
      setError(null);
      // 第一次載入只記錄目前狀態，不發通知
      await checkAndNotify(d, first.current);
      first.current = false;
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setSettings(await loadSettings());
      const c = await cachedData();
      if (c) setData(c);
      refresh();
      await setupNotifications().catch(() => {});
      setBgOk(await registerBackground());
    })();
    const id = setInterval(refresh, REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [refresh]);

  const changeSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };
  const pickCounty = (c: string) => {
    changeSettings({ ...settings, county: c });
    ToastAndroid.show(`已設定我的縣市：${c}`, ToastAndroid.SHORT);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink, paddingTop: insets.top }}>
      <StatusBar style="light" />
      {error ? (
        <View style={{ backgroundColor: '#3a2a12', paddingHorizontal: 16, paddingVertical: 6 }}>
          <Text style={{ color: C.amber, fontSize: 12 }}>無法連線取得最新資料{data ? `，顯示 ${fmtTime(data.updatedAt)} 的資料` : ''}（{error}）</Text>
        </View>
      ) : null}
      {data ? (
        <ScrollView
          key={tab}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={C.cyan} colors={[C.cyan]} progressBackgroundColor={C.panel} />}
        >
          {tab === 'status' && <StatusScreen d={data} myCounty={settings.county} />}
          {tab === 'map' && <MapScreen d={data} />}
          {tab === 'county' && <CountiesScreen d={data} myCounty={settings.county} onPick={pickCounty} />}
          {tab === 'weather' && <WeatherScreen d={data} />}
          {tab === 'settings' && <SettingsScreen settings={settings} onChange={changeSettings} bgOk={bgOk} />}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {error ? (
            <>
              <Text style={{ color: C.fg, fontSize: 15, marginBottom: 12, textAlign: 'center' }}>無法取得資料，請確認網路連線。</Text>
              <Pressable onPress={refresh} style={{ borderWidth: 1, borderColor: C.cyan, paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text style={{ color: C.cyan }}>重試</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={C.cyan} size="large" />
          )}
        </View>
      )}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: C.panel, paddingBottom: insets.bottom }}>
        {TABS.map((t) => (
          <Pressable key={t.k} onPress={() => setTab(t.k)} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }} accessibilityRole="tab" accessibilityState={{ selected: tab === t.k }}>
            <Text style={{ color: tab === t.k ? C.cyan : C.mute, fontSize: 14, fontWeight: tab === t.k ? '700' : '400' }}>{t.label}</Text>
            {tab === t.k ? <View style={{ position: 'absolute', top: 0, left: '25%', right: '25%', height: 2, backgroundColor: C.cyan }} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}
