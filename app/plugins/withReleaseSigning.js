// 讓 release APK 用固定的簽章金鑰（從環境變數讀取），之後的新版才能直接覆蓋安裝。
// 沒有設定環境變數時維持 Expo 預設（debug 金鑰）。
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
                storeType "pkcs12"
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes('ANDROID_KEYSTORE_PATH')) return cfg;
    // 在 signingConfigs { debug { ... } } 之後加入 release
    g = g.replace(/(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\})/, `$1${SIGNING}`);
    // release buildType 改用 release 簽章（有設定時）
    g = g.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig System.getenv("ANDROID_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug',
    );
    cfg.modResults.contents = g;
    return cfg;
  });
};
