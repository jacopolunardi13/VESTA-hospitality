// Combinatore camere: data una lista di camere disponibili+prezzate e il numero di
// letti richiesti, trova le migliori combinazioni che COPRONO almeno la capienza
// richiesta. La capienza per camera è il limite MASSIMO, non obbligatorio: una camera
// può restare sotto-occupata. Ranking: meno camere → prezzo più basso → meno spreco.
//
// Progettato estensibile: `opts.minRooms` consente in futuro modalità "forza più camere"
// (gruppi che vogliono camere separate pur entrando in una sola), e nuovi criteri si
// aggiungono senza riscrivere il nucleo. Il combinatore NON conosce il "superamento della
// camera più grande": è il chiamante a decidere quando invocarlo.

export interface CombinableRoom {
  roomId: string
  roomName: string
  maxGuests: number       // limite SUPERIORE di capienza
  offerTotalCents: number // prezzo del soggiorno per quella camera
}

export interface RoomCombination {
  rooms: CombinableRoom[]
  totalCapacity: number
  totalCents: number
  waste: number           // capienza sprecata = totalCapacity - requiredBeds
}

export interface CombineOptions {
  maxOptions?: number  // quante combinazioni restituire (default 2: Opzione A + B)
  minRooms?: number    // numero minimo di camere per combinazione (default 1)
}

/**
 * Restituisce le migliori combinazioni (al più `maxOptions`) di camere DISTINTE la cui
 * capienza totale è ≥ requiredBeds. Vuoto se nessuna combinazione copre la capienza.
 */
export function selectRoomCombinations(
  rooms: CombinableRoom[],
  requiredBeds: number,
  opts: CombineOptions = {}
): RoomCombination[] {
  const maxOptions = opts.maxOptions ?? 2
  const minRooms = opts.minRooms ?? 1
  const n = rooms.length
  if (n === 0 || requiredBeds <= 0 || n > 24) return [] // guardia anti-esplosione (2^24)

  const combos: RoomCombination[] = []
  for (let mask = 1; mask < (1 << n); mask++) {
    const subset: CombinableRoom[] = []
    let cap = 0
    let cents = 0
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) { subset.push(rooms[i]); cap += rooms[i].maxGuests; cents += rooms[i].offerTotalCents }
    }
    if (subset.length >= minRooms && cap >= requiredBeds) {
      combos.push({ rooms: subset, totalCapacity: cap, totalCents: cents, waste: cap - requiredBeds })
    }
  }

  combos.sort((a, b) =>
    a.rooms.length - b.rooms.length || // 1) meno camere possibili
    a.totalCents - b.totalCents ||     // 2) prezzo totale più basso
    a.waste - b.waste                   // 3) minor capienza sprecata
  )

  return combos.slice(0, maxOptions)
}
