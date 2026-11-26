import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { hostname, networkInterfaces } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run explicitly when setting up this machine or after its LAN address changes.
// This script only generates certificates; it never starts a server.
const root = fileURLToPath(new URL('../', import.meta.url))
const directory = resolve(root, '.certs')
const portable = resolve(root, '.tools', process.platform === 'win32' ? 'mkcert.exe' : 'mkcert')
const mkcert = existsSync(portable) ? portable : 'mkcert'

function run(args, capture = false) {
  const result = spawnSync(mkcert, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: true })
  if (result.error) throw new Error('mkcert was not found. Install mkcert or place it in .tools, then rerun npm run setup:https.', { cause: result.error })
  if (result.status !== 0) throw new Error(`mkcert ${args[0]} failed. ${result.stderr ?? ''}`)
  return result.stdout?.trim()
}

const ips = [...new Set(Object.values(networkInterfaces()).flat()
  .filter(item => item && item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))
  .map(item => item.address))]
const names = [...new Set(['localhost', '127.0.0.1', '::1', hostname(), ...ips])]

mkdirSync(directory, { recursive: true })
run(['-cert-file', resolve(directory, 'dev-cert.pem'), '-key-file', resolve(directory, 'dev-key.pem'), ...names])
// Only the public CA certificate is copied for trust setup on other devices.
// The CA's private key stays in mkcert's per-user CA store.
const caRoot = run(['-CAROOT'], true)
copyFileSync(resolve(caRoot, 'rootCA.pem'), resolve(directory, 'rootCA.crt'))
console.log('\nHTTPS certificate ready. Start the development server yourself with npm run dev.')
for (const ip of ips) console.log(`Network: https://${ip}:5174/`)
console.log('Trust .certs/rootCA.crt on connecting devices. Never share dev-key.pem or rootCA-key.pem.')
console.log('To trust this CA on the development PC, run mkcert -install (use .tools/mkcert.exe if installed locally).')
