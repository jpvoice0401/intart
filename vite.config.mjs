import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import sixflagsPlugin from './server/sixflags-plugin.mjs'
import compressedAssets from './server/compressed-assets.mjs'

function developmentHttps() {
  try {
    return {
      cert: readFileSync(new URL('./.certs/dev-cert.pem', import.meta.url)),
      key: readFileSync(new URL('./.certs/dev-key.pem', import.meta.url)),
    }
  } catch (error) {
    throw new Error('Development HTTPS certificates are missing or unreadable. Run npm run setup:https first.', { cause: error })
  }
}

export default defineConfig(({ command, isPreview }) => ({
  // Pages supplies /intart/ in CI; local development keeps the root URL.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [sixflagsPlugin(), compressedAssets()],
  build: { target: ['chrome80','edge80','firefox78','safari15'], cssTarget: 'safari15', minify: true },
  worker: { format: 'es' },
  // MediaPipe ships a self-contained ESM bundle. Serve it directly so on-demand
  // camera startup cannot reference a stale Vite dependency-cache URL.
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
  server: {
    host: '0.0.0.0', port: 5174, strictPort: true,
    https: command === 'serve' && !isPreview ? developmentHttps() : undefined,
    // Preserve Vite's default sensitive-file rules and deny the local setup folders.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.certs/**', '**/.tools/**'] },
  },
  preview: { host: '0.0.0.0', port: 4174, strictPort: true },
}))
