import { Platform } from 'react-native';
import { C } from './theme';

// 網頁版（iPhone 用 Safari 開）：補上深色背景，並讓「加入主畫面」之後有圖示、開起來像一般的 app
export function setupWeb() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.lang = 'zh-Hant';
  document.body.style.backgroundColor = C.ink;
  const add = (tag: 'meta' | 'link', attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  };
  add('meta', { name: 'theme-color', content: C.ink });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' });
  // public/ 底下的檔案會放在網站根目錄，用相對路徑才能適用 GitHub Pages 的子路徑
  add('link', { rel: 'apple-touch-icon', href: 'apple-touch-icon.png' });
}
