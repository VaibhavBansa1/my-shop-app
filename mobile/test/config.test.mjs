// Guards the Android permission setup (see docs/MOBILE.md → Permissions).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url))).expo;
const libManifest = readFileSync(new URL('../node_modules/expo-image-picker/android/src/main/AndroidManifest.xml', import.meta.url), 'utf8');

test('camera permission is requested with a clear explanation and merged from the image picker', () => {
  const picker = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
  assert.ok(picker, 'expo-image-picker plugin configured');
  assert.match(picker[1].cameraPermission, /scan supplier invoices/);
  assert.notEqual(picker[1].cameraPermission, false, 'camera must not be disabled');
  assert.match(libManifest, /android\.permission\.CAMERA/, 'CAMERA comes from the library manifest');
  assert.ok(!app.android.blockedPermissions.includes('android.permission.CAMERA'));
});

test('privacy: no microphone, storage or overlay permissions; no cloud backup of app data', () => {
  for (const p of ['RECORD_AUDIO', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SYSTEM_ALERT_WINDOW']) {
    assert.ok(app.android.blockedPermissions.includes(`android.permission.${p}`), `${p} blocked`);
  }
  assert.equal(app.android.allowBackup, false);
});
