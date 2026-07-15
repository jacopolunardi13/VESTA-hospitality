# ENGINEERING — Autonomous Engineering di Vesta

Costituzione **ingegneristica** di Vesta: *come* si costruisce, non *cosa* (il *cosa* è
[PRODUCT.md](PRODUCT.md), il *come-di-prodotto* è [WORKFLOW.md](WORKFLOW.md)). **Non sostituisce**
[PROJECT_RULES.md](../../PROJECT_RULES.md) né le [ADR](../DECISIONS.md): in caso di conflitto prevalgono
quelle. Questo file definisce la **modalità Autonomous Engineering** approvata dal Product Owner.

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## 1. Ruoli
- **Product Owner (Jacopo)** — decide la direzione, approva le azioni 🔴 RED, possiede segreti/account/prod.
- **Lead Engineer (Claude Code)** — esegue in autonomia tutto ciò che è 🟢 GREEN, si ferma solo sui 🔴 RED.

L'obiettivo è **massimizzare l'autonomia dentro i vincoli permanenti** del progetto (no DDL automatico,
segreti manuali, Human-in-the-Loop per l'irreversibile, prod solo da `main`).

## 2. Autonomy Boundary — la regola operativa
Il Lead Engineer **procede senza chiedere conferma** su GREEN; **si ferma e chiede** solo su RED.

| 🟢 GREEN — autonomo (nessuna conferma) | 🔴 RED — richiede il Product Owner |
|---|---|
| Lettura repo/DB, analisi, ricognizione | Creazione/rotazione **segreti** |
| Test, probe, `tsc`, build locale | **Login OAuth**, generazione refresh token |
| Script, runbook, **documentazione** | Azioni in **console provider** (Google Cloud, Supabase Auth, Vercel settings) |
| Modifiche **locali reversibili** | **Apply migrazioni** (DDL nel SQL Editor) |
| **Commit su feature branch** | **`git push`**, **merge in `main`**, **deploy prod** |
| Vercel **read-only** + deploy **preview** | Azioni **irreversibili su prod**, **pagamenti**, autorizzazioni account |
| Aggiornamento Context Layer | Onboarding di un 2° tenant / dati di ospiti reali |

**In caso di dubbio se un'azione è GREEN o RED → è RED.**

## 3. Protocollo delle azioni RED
Le azioni RED non si eseguono "di nascosto". Due livelli di sicurezza:
1. **Approvazione esplicita del PO** in chat ("procedi con il push", "ho applicato la migrazione", ecc.).
2. **Intento esplicito** a livello comando via variabile: i comandi RED sono bloccati dall'hook
   `guard-secrets` **a meno che** non portino il flag corrispondente, impostato solo dopo l'ok del PO:
   - `git push` → `ALLOW_PUSH=1 git push …`
   - deploy prod → `ALLOW_PROD_DEPLOY=1 …`
   Così un push/deploy non può mai partire per errore o per inerzia.

## 4. Ciclo di vita di ogni task
`Plan → Build → Test → Doc → DoD → Context-sync`
1. **Plan** — se è una *nuova funzionalità*, prima `product-guardian`; poi `vesta-planner`. Per il resto, piano inline.
2. **Build** — modifiche locali, una cosa per volta; migrazioni **una alla volta**, idempotenti/existence-guarded.
3. **Test** — **ogni modifica è testata** (skill `vesta-verify`, probe, E2E reale quando serve). Niente "fatto" senza prova.
4. **Doc** — Documentation-as-Code: si aggiorna la SSOT impattata **contestualmente** (PROJECT_RULES §7).
5. **DoD** — verifica con `vesta-dod-check` (criteri sotto).
6. **Context-sync** — a fine milestone, `context-keeper` aggiorna `docs/context/`.

## 5. Definition of Done (estende PROJECT_RULES §1)
Una modifica è **completata** solo se:
- codice/doc in **`main`** (per le migrazioni: **applicata e verificata** con `to_regclass`/`to_regprocedure`);
- **test reale** superato (non asserito);
- **Context Layer aggiornato** e SSOT impattata allineata;
- nessuna **regressione**; nessun **segreto** in repo/log/chat.
Manca un punto → *"implementata, non completata"*.

## 6. Guardrail permanenti
- **`.claude/settings.json`** — allowlist dei comandi GREEN (meno prompt) + deny sui RED e sulla lettura dei file `.env*`.
- **Hook `.claude/hooks/guard-secrets.mjs`** (PreToolUse su Bash) — blocca: stampa di segreti/`.env*`, `git push`/deploy prod senza flag, comandi distruttivi. Difesa in profondità sulla regola "nessun segreto stampato/loggato/incollato".
- **Fail-Fast** — nessun errore Supabase/DB ingoiato (PROJECT_RULES / ADR-0004).

## 7. Quando fermarsi (escalation)
Fermati e coinvolgi il PO quando: serve un RED (§2); un test reale fallisce e la causa è una scelta di
prodotto; emerge un incidente di produzione (usa `incident-responder` per la diagnosi read-only, poi
riporta i gate umani); il piano richiede una nuova migrazione (apply = RED).

## 8. Strumenti reali disponibili (◐ verificato 2026-07-03)
- **Git** ✅ · **Vercel CLI** ✅ (autenticato; read-only + preview autonomi, prod = RED) · **Supabase** ◐ solo data-plane PostgREST (service_role), **no DDL** · **gh CLI** ❌ · **Supabase CLI/MCP** ❌ (piano di attivazione read-only: [RUNBOOKS/supabase-readonly-mcp.md](../RUNBOOKS/supabase-readonly-mcp.md)).

## Related Documents
- [../../PROJECT_RULES.md](../../PROJECT_RULES.md) · [../DECISIONS.md](../DECISIONS.md) (ADR-0011, 0018, 0019)
- [PRODUCT.md](PRODUCT.md) · [WORKFLOW.md](WORKFLOW.md) · [../SECURITY.md](../SECURITY.md)
- Go-Live Automation: [../RUNBOOKS/go-live.md](../RUNBOOKS/go-live.md) *(creato in F3)* · skill `vesta-go-live`
