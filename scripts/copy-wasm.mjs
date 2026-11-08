// Copies the MediaPipe vision WASM runtime into public/ so the app serves it
// itself (no CDN at runtime for the runtime; the model file is still fetched
// from Google's storage bucket on first load and cached by the browser).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dst = resolve(root, 'public/mediapipe/wasm');

if (!existsSync(src)) {
  console.warn('[copy-wasm] @mediapipe/tasks-vision not installed; skipping');
  process.exit(0);
}
mkdirSync(dirname(dst), { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('[copy-wasm] copied MediaPipe wasm ->', dst);
