// Unit test combinatore camere (deterministico, no AI, no DB).
// Uso: node --import tsx scripts/test-room-combinations.mts
import { selectRoomCombinations, type CombinableRoom } from '@/lib/quote/roomCombinations'

let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

// Inventario tipo LunArt (prezzo = soggiorno per camera, valori fittizi coerenti).
const R: CombinableRoom[] = [
  { roomId: '301', roomName: '301', maxGuests: 2, offerTotalCents: 19000 },
  { roomId: '302', roomName: '302', maxGuests: 2, offerTotalCents: 21500 },
  { roomId: '303', roomName: '303', maxGuests: 3, offerTotalCents: 28900 },
  { roomId: '304', roomName: '304', maxGuests: 2, offerTotalCents: 21500 },
  { roomId: '305', roomName: '305', maxGuests: 3, offerTotalCents: 28000 },
]
const names = (c: { rooms: CombinableRoom[] }) => c.rooms.map((r) => r.roomName).sort().join('+')

console.log('— requiredBeds = 5 (nessuna singola basta) —')
const c5 = selectRoomCombinations(R, 5)
ok(c5.length === 2, `max 2 opzioni (A+B), trovate ${c5.length}`)
ok(c5.every((c) => c.totalCapacity >= 5), 'tutte coprono ≥5')
ok(c5[0].rooms.length === 2, `A usa 2 camere (${names(c5[0])})`)
ok(c5[0].totalCents <= c5[1].totalCents, `A non più cara di B (${c5[0].totalCents} ≤ ${c5[1].totalCents})`)
ok(names(c5[0]) === '301+305', `A = 301+305 (la più economica a 2 camere): ${names(c5[0])}`)

console.log('\n— requiredBeds = 4 —')
const c4 = selectRoomCombinations(R, 4)
ok(c4[0].rooms.length === 2 && c4[0].totalCapacity >= 4, `A = 2 doppie che coprono 4 (${names(c4[0])})`)
ok(c4[0].totalCents === 19000 + 21500, `A più economica = 301+302/304 (€${c4[0].totalCents / 100})`)

console.log('\n— requiredBeds = 13 (oltre capienza totale 12) —')
ok(selectRoomCombinations(R, 13).length === 0, 'nessuna combinazione → []')

console.log('\n— under-fill: requiredBeds = 1 (uso singolo ammesso) —')
const c1 = selectRoomCombinations(R, 1)
ok(c1[0].rooms.length === 1 && names(c1[0]) === '301', `A = singola più economica (301), capienza non obbligatoria: ${names(c1[0])}`)

console.log('\n— estensibilità: minRooms = 2 (forza più camere anche se una basterebbe) —')
const cForce = selectRoomCombinations(R, 2, { minRooms: 2 })
ok(cForce[0].rooms.length >= 2, `con minRooms=2 niente combinazioni a 1 camera (${names(cForce[0])})`)

console.log(`\n════ ${pass} passati, ${fail} falliti ════`)
process.exit(fail > 0 ? 1 : 0)
