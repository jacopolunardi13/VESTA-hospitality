// Genera le icone app (favicon.ico, icon.svg, apple-icon.png) dal simbolo Vesta.
// Sorgente unica: public/brand/vesta/mark.svg → quando arriva l'SVG definitivo basta
// sostituire mark.svg e rieseguire questo script (nessuna modifica al codice).
// Uso: node scripts/gen-brand-icons.mjs
import sharp from 'sharp'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const markPath = join(root, 'public/brand/vesta/mark.svg')
const appDir = join(root, 'src/app')
const svg = readFileSync(markPath)

function buildIco(entries) {
  const count = entries.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4)
  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  const bodies = []
  entries.forEach((e, i) => {
    const b = e.buffer
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, i * 16 + 0)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, i * 16 + 1)
    dir.writeUInt16LE(1, i * 16 + 4)   // color planes
    dir.writeUInt16LE(32, i * 16 + 6)  // bits per pixel
    dir.writeUInt32LE(b.length, i * 16 + 8)
    dir.writeUInt32LE(offset, i * 16 + 12)
    offset += b.length
    bodies.push(b)
  })
  return Buffer.concat([header, dir, ...bodies])
}

const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()

// icon.svg: copia diretta del simbolo (Next la serve come <link rel="icon">).
copyFileSync(markPath, join(appDir, 'icon.svg'))

// apple-icon.png 180×180.
writeFileSync(join(appDir, 'apple-icon.png'), await png(180))

// favicon.ico multi-size (16 + 32, PNG-in-ICO, supportato dai browser moderni).
const ico = buildIco([
  { size: 16, buffer: await png(16) },
  { size: 32, buffer: await png(32) },
])
writeFileSync(join(appDir, 'favicon.ico'), ico)

console.log('Icone generate: icon.svg, apple-icon.png, favicon.ico')
