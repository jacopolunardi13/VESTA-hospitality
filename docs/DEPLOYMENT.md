# DEPLOYMENT

Fonte ufficiale per: deploy, ambienti, branching, applicazione delle migrazioni in fase di rilascio,
protezione dei deploy. Infrastruttura sottostante → [INFRASTRUCTURE.md](INFRASTRUCTURE.md); schema →
[DATABASE.md](DATABASE.md).

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## Parte 1 — Current State

### Pipeline di rilascio
- ✅ **GitHub → Vercel**: il push su GitHub innesca la build su Vercel.
- ◐ **Produzione = branch `main`** (auto-deploy) su `https://vesta-hospitality.vercel.app`.
- ✅ **Preview = ogni altro branch** (verificato: `document-center` → URL di preview dedicato).
- ✅ I Preview sono protetti da Vercel Authentication; automazione via `x-vercel-protection-bypass`
  (→ [INFRASTRUCTURE.md](INFRASTRUCTURE.md), [SECURITY.md](SECURITY.md)).

### Branching (stato attuale)
- ✅ Branch principale: `main`. Branch di lavoro corrente: `document-center` (Document Center MVP +
  hardening fail-fast; non ancora in `main`).
- ✅ Regola: feature branch → merge in `main` **solo a Definition of Done** (PROJECT_RULES §1, §9).

### Migrazioni nel rilascio
- ✅ Le migrazioni **non** vengono applicate dal deploy: sono **manuali** nel Supabase SQL Editor,
  **una alla volta**, verificate con `to_regclass` (procedura → [RUNBOOKS/apply-migration.md](RUNBOOKS/apply-migration.md)).
- ✅ Conseguenza: una nuova migrazione va applicata al DB **prima/insieme** al deploy del codice che la
  usa, altrimenti il codice troverebbe tabelle assenti (mitigato dal Fail-Fast).

### Scheduler
- ✅ I cron sono in **pg_cron** (Supabase), non in Vercel. Gestione → [RUNBOOKS/suspend-resume-cron.md](RUNBOOKS/suspend-resume-cron.md).

### Build (note)
- ✅ Next.js; `next.config.ts` include `outputFileTracingIncludes` per i font pdfkit su `/api/email/poll`.
- ◐ Verifica pre-merge raccomandata: `npx tsc --noEmit` + `npm run build` + test offline verdi.

---

## Parte 2 — Guiding Principles

- **Produzione solo da `main`.** Un solo percorso verso la produzione; tutto il resto è Preview.
- **Preview per testare il rischio.** Il codice che tocca dati/integrazioni reali si verifica su Preview
  prima del merge (es. E2E email).
- **DoD prima del merge.** Niente merge senza codice integrato + migrazioni verificate + E2E
  (PROJECT_RULES §1).
- **Una migrazione funzionale per volta**, applicata e verificata (ADR-0009).
- **Sicuro di default in rilascio.** Autosend OFF, cron sospendibile, protezione preview attiva.
- **Documentation as Code.** Un rilascio che cambia comportamento aggiorna la doc nello stesso ciclo.

---

## Future Evolution
*Coerenti coi principi; non roadmap.*
- Verifiche automatiche pre-merge (CI: tsc + build + test) come gate del DoD.
- Tooling di migrazione versionato (oggi manuale) se il numero di ambienti cresce.
- Separazione ambienti DB (oggi progetto Supabase unico).

---

## Related Documents
- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — Vercel, protezione, cron
- [DATABASE.md](DATABASE.md) — migrazioni e verifica
- [TESTING.md](TESTING.md) — test prima del merge
- [SECURITY.md](SECURITY.md) — protezione deploy, segreti
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — §1 DoD, §8 Deploy, §9 Branching
- [RUNBOOKS/apply-migration.md](RUNBOOKS/apply-migration.md) · [RUNBOOKS/suspend-resume-cron.md](RUNBOOKS/suspend-resume-cron.md)
