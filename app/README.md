# Vesta Hospitality — app (Next.js)

Applicazione Next.js (App Router) di Vesta Hospitality. La documentazione ufficiale del progetto è in
[`../docs/`](../docs/README.md); le regole permanenti in [`../PROJECT_RULES.md`](../PROJECT_RULES.md).

> ⚠️ **Non è il Next.js standard**: questo progetto ha convenzioni proprie — leggere [`AGENTS.md`](AGENTS.md)
> prima di scrivere codice.

## Sviluppo locale
```bash
npm run dev      # dev server su http://localhost:3000
```
Richiede `app/.env.local` con le variabili descritte in [../docs/ENVIRONMENT.md](../docs/ENVIRONMENT.md)
(in locale il Gmail è la casella **dev** `info.lunart.firenze`, non la produzione).

## Test e script
Script in `app/scripts/` (eseguibili con `node --env-file=.env.local --import tsx scripts/<file>.mts`).
Strategia di test → [../docs/TESTING.md](../docs/TESTING.md).

## Build e deploy
`npm run build` per la build; deploy su Vercel (produzione da `main`) → [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).

## Riferimenti rapidi
- Architettura → [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- Database/migrazioni → [../docs/DATABASE.md](../docs/DATABASE.md)
- Infrastruttura → [../docs/INFRASTRUCTURE.md](../docs/INFRASTRUCTURE.md)
