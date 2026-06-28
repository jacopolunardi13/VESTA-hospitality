# Vesta Hospitality

SaaS per piccole strutture ricettive (B&B, affittacamere, case vacanze, piccoli hotel): un
**"dipendente virtuale"** che aiuta gli ospiti, aumenta le **prenotazioni dirette** e riduce il lavoro
manuale del gestore. Pilota: **LunArt B&B** (Firenze), poi Bella Vigna.

> Non è un chatbot/FAQ. Visione e posizionamento → [docs/BUSINESS.md](docs/BUSINESS.md).

## Stack (sintesi)
- **App**: Next.js (cartella `app/`), deploy su **Vercel**.
- **Dati**: **Supabase** (Postgres, RLS, Storage, pg_cron).
- **AI**: **Anthropic** (Claude Haiku + Sonnet), pipeline knowledge-first.
- **Canali**: Web chat (live), Email (pilota), WhatsApp (predisposto/inerte).

Dettagli tecnici completi → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).

## Documentazione
La **fonte ufficiale** della conoscenza del progetto è in **[`docs/`](docs/README.md)**.
Le **regole permanenti** di sviluppo sono in **[`PROJECT_RULES.md`](PROJECT_RULES.md)** (Costituzione).
Le **decisioni** in [docs/DECISIONS.md](docs/DECISIONS.md).

⚠️ La documentazione fa parte del prodotto: una modifica che cambia il comportamento del sistema deve
aggiornare anche la doc (PROJECT_RULES §7).

## Setup ed esecuzione
Vedi [`app/README.md`](app/README.md) per i dettagli di sviluppo, e [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)
per le variabili d'ambiente, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) per il rilascio.
