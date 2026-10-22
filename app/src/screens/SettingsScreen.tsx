import { Linking, Pressable, Switch, Text, View } from 'react-native';
import type { Settings } from '../data';
import { C, S } from '../theme';
import { Btn, Card, CardHead } from '../ui';
import { COUNTIES } from '../logic';

const LINKS = [
  ['中央氣象署 颱風警報', 'https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_WARN.html'],
  ['中央氣象署 颱風消息', 'https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html'],
  ['中央氣象署 風雨預報', 'https://www.cwa.gov.tw/V8/C/P/Typhoon/WPPS.html'],
  ['人事行政總處 停班停課', 'https://www.dgpa.gov.tw/typh/daily/nds.html'],
];

export default function SettingsScreen({ settings, onChange, bgOk }: { settings: Settings; onChange: (s: Settings) => void; bgOk: boolean | null }) {
  return (
    <View>
      <Card>
        <CardHead label="我的縣市" />
        <Text style={[S.note, { marginBottom: 8 }]}>用來排序縣市清單、計算颱風最接近的時間，以及發送停班課通知。</Text>
        <View style={[S.row, { flexWrap: 'wrap' }]}>
          <Btn label="不設定" on={!settings.county} onPress={() => onChange({ ...settings, county: null })} />
          {COUNTIES.map((c) => (
            <Btn key={c.n} label={c.n} on={settings.county === c.n} onPress={() => onChange({ ...settings, county: c.n })} />
          ))}
        </View>
      </Card>

      <Card>
        <CardHead label="通知" />
        <Row label="新的颱風報、警報解除" value={settings.notifyReports} onChange={(v) => onChange({ ...settings, notifyReports: v })} />
        <Row label="我的縣市停班停課變動" value={settings.notifyClosure} onChange={(v) => onChange({ ...settings, notifyClosure: v })} />
        <Text style={[S.note, { marginTop: 8 }]}>
          {bgOk === false
            ? '這支手機不允許背景更新，只有打開 app 時才會檢查新資料。'
            : 'app 關閉時會在背景定期檢查（Android 最短約 15 分鐘，實際時間由系統決定，省電模式下可能更久）。若通知不準時，請到手機設定把本 app 的電池用量設為「不限制」。'}
        </Text>
      </Card>

      <Card>
        <CardHead label="官方資料來源" />
        {LINKS.map(([n, u]) => (
          <Pressable key={u} onPress={() => Linking.openURL(u)} style={{ paddingVertical: 6 }}>
            <Text style={{ color: C.cyan, fontSize: 14 }}>{n}</Text>
          </Pressable>
        ))}
        <Text style={[S.note, { marginTop: 8 }]}>本 app 整理公開資料供參考，非官方發布。地圖使用 g0v 台灣縣市邊界與 Natural Earth 海岸線。</Text>
      </Card>
    </View>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[S.between, { alignItems: 'center', paddingVertical: 4 }]}>
      <Text style={S.text}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.cyan, false: C.line2 }} />
    </View>
  );
}
