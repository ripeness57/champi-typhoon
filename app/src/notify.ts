import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { Platform } from 'react-native';
import type { TyphoonData } from './types';
import { fetchData, loadSettings } from './data';
import { closureOf } from './logic';

export const TASK = 'champi-background-check';
const SEEN_KEY = 'champi:seen';
const CHANNEL = 'typhoon';

interface Seen { report: string | null; active: boolean; closure: string | null; county: string | null }

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function setupNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: '颱風警報與停班課',
      importance: AndroidImportance.HIGH,
    });
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') await Notifications.requestPermissionsAsync();
}

const notify = (title: string, body: string) =>
  Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null });

// 和上次看過的資料比較，有新的颱風報、警報解除或「我的縣市」停班課變動時發通知
export async function checkAndNotify(d: TyphoonData, silent = false) {
  const settings = await loadSettings();
  const w = d.warning;
  const county = settings.county;
  const closure = county ? closureOf(d, county) : null;
  const now: Seen = {
    report: w?.active ? w.report || null : null,
    active: !!w?.active,
    closure: closure ? `${closure.status}|${closure.items.join('/')}` : null,
    county,
  };
  let prev: Seen | null = null;
  try {
    const s = await AsyncStorage.getItem(SEEN_KEY);
    prev = s ? JSON.parse(s) : null;
  } catch {}
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(now)).catch(() => {});
  if (silent || !prev) return;

  const name = w?.nameC || '颱風';
  if (settings.notifyReports) {
    if (now.active && now.report && now.report !== prev.report) {
      await notify(`${name} 第 ${now.report} 報`, w?.summary || w?.title || '氣象署發布新的颱風警報');
    } else if (prev.active && !now.active) {
      await notify(`${name} 颱風警報解除`, '中央氣象署已解除颱風警報');
    }
  }
  if (settings.notifyClosure && county && closure && prev.county === county && now.closure !== prev.closure && closure.items.length) {
    await notify(`${county} 停班停課`, closure.items.join('\n'));
  }
}

TaskManager.defineTask(TASK, async () => {
  try {
    const d = await fetchData();
    await checkAndNotify(d);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackground() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
      // 單位：分鐘。Android 最短 15 分鐘，實際執行時間由系統決定
      await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
    }
    return true;
  } catch {
    return false;
  }
}
