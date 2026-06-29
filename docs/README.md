# Documentazione Vesta Hospitality

Questa cartella è la **fonte ufficiale della conoscenza del progetto**. La documentazione fa parte del
prodotto (PROJECT_RULES §7): se una modifica cambia il comportamento del sistema senza aggiornare la
doc, è incompleta.

## Standard documentale (vincolante)
Ogni documento segue questa struttura (ADR-0005):
1. **Current State** — solo ciò che esiste oggi; ogni affermazione classificata ✅ verificata / ◐ dedotta
   / ○ ipotizzata (PROJECT_RULES §2).
2. **Guiding Principles** — il *perché*: principi, compromessi accettati, cosa non violare.
3. **Future Evolution** (quando applicabile) — evoluzioni *coerenti* coi principi; **non** una roadmap.
4. **Related Documents** — la rete di rimandi.

Principi trasversali: **Single Source of Truth** (ogni argomento un solo documento ufficiale; gli altri
rimandano), **Documentation as Code**, **ADR-driven changes** (vedi [DECISIONS.md](DECISIONS.md)).

## Mappa dei documenti
| Documento | Scopo |
|---|---|
| [../PROJECT_RULES.md](../PROJECT_RULES.md) | La "Costituzione": regole permanenti di sviluppo |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architettura reale + il ragionamento che l'ha generata |
| [BUSINESS.md](BUSINESS.md) | Visione, missione, posizionamento, modello di business |
| [DOMAINS.md](DOMAINS.md) | Verticali applicativi; Core vs specifico di dominio |
| [INFRASTRUCTURE.md](INFRASTRUCTURE.md) | Tutta l'infrastruttura (Supabase, Vercel, Gmail, Anthropic, cron, storage) |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Variabili d'ambiente per-ambiente, segreti |
| [DATABASE.md](DATABASE.md) | Schema, migrazioni, RLS + manuale di evoluzione dello schema |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deploy, branching, preview, applicazione migrazioni |
| [TESTING.md](TESTING.md) | Strategia di test (offline + E2E) |
| [SECURITY.md](SECURITY.md) | RLS, Tier 2, kill-switch, guardrail, segreti da ruotare |
| [AI.md](AI.md) | Modelli, pipeline knowledge-first, prompt/caching, costi, brand voice |
| [KNOWLEDGE.md](KNOWLEDGE.md) | Property Knowledge System e retrieval |
| [ROADMAP.md](ROADMAP.md) | Priorità operative attuali |
| [CHANGELOG.md](CHANGELOG.md) | Cambiamenti notevoli (cronologico) |
| [DECISIONS.md](DECISIONS.md) | Registro ADR (decisioni architetturali e di processo) |
| [RUNBOOKS/](RUNBOOKS/) | Procedure operative passo-passo |
| [archive/](archive/) | Documenti di planning **superati** (sola lettura, storici) |

## Foundations — la Costituzione del prodotto
`docs/foundations/` raccoglie i documenti **fondativi** (fonte di verità del prodotto), distinti dalla conoscenza tecnica (`docs/*`) e dallo stato vivo (`docs/context/`).

| Documento | Scopo |
|---|---|
| [foundations/PRODUCT.md](foundations/PRODUCT.md) | **Costituzione del prodotto**: cos'è Vesta, perché esiste, principi confermati, direzioni creative, open questions |

Futuri e già citati nei confini SSOT di `PRODUCT.md` (non ancora creati): `BRAND.md` (identità di marca), `WORKFLOW.md` (flussi operativi), `ENGINEERING.md` (principi di ingegneria).

## Context — stato vivo (ADR-0018)
`docs/context/` è il **layer di stato vivo**, distinto dal layer di *conoscenza* qui sopra: snapshot
**sintetici e operativi** che **rimandano** alle SSOT (non le duplicano). È la fonte di verità di "dove
siamo adesso" e va aggiornato a ogni milestone (PROJECT_RULES §1.4 e §13). **Non** segue la struttura
ADR-0005 (è snapshot, non conoscenza).

| Documento | Scopo |
|---|---|
| [context/CURRENT_STATE.md](context/CURRENT_STATE.md) | Fotografia: branch, cosa è in main, working tree, milestone corrente |
| [context/NEXT_TASK.md](context/NEXT_TASK.md) | Prossimo passo eseguibile: prerequisiti, comandi/test, criteri DoD |
| [context/OPEN_DECISIONS.md](context/OPEN_DECISIONS.md) | Solo decisioni **non ancora prese** + ADR candidate (decise → DECISIONS.md) |
| [context/KNOWN_ISSUES.md](context/KNOWN_ISSUES.md) | Problemi noti / rischi / workaround con priorità |
| [context/PROJECT_SYNC_REPORT_TEMPLATE.md](context/PROJECT_SYNC_REPORT_TEMPLATE.md) | Template stabile del report di riallineamento |
| [context/PROJECT_SYNC_REPORT.md](context/PROJECT_SYNC_REPORT.md) | **Report vivo** da copiare in una nuova chat ChatGPT/Claude |

## Da dove iniziare
- Nuovo al progetto → [ARCHITECTURE.md](ARCHITECTURE.md) + [../PROJECT_RULES.md](../PROJECT_RULES.md).
- Devi operare (migrazioni, cron, deploy, test) → [RUNBOOKS/](RUNBOOKS/).
- Vuoi capire *perché* una scelta → [DECISIONS.md](DECISIONS.md).
