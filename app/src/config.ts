import { Platform } from 'react-native';

// GitHub Actions 每 30 分鐘更新的資料檔；__GITHUB_REPO__ 在打包 APK 時換成「帳號/倉庫」
const REMOTE = 'https://raw.githubusercontent.com/__GITHUB_REPO__/main/data/latest.json';

// 開發時在瀏覽器預覽，改讀 public/latest.json
export const DATA_URL = __DEV__ && Platform.OS === 'web' ? '/latest.json' : REMOTE;
