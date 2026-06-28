# TESTING

Fonte ufficiale per la strategia di test: test offline (deterministici) e test end-to-end sul percorso
reale. Definizione di "completato" → [../PROJECT_RULES.md](../PROJECT_RULES.md) §1.

> **Legenda** (PROJECT_RULES §2): ✅ verificata · ◐ dedotta · ○ ipotizzata.

---

## Parte 1 — Current State

### Dove vivono i test
- ✅ Script in **`app/scripts/`** (nessun framework formale tipo Jest: sono script eseguibili che
  stampano `✓/✗` e contano pass/fail).
- ✅ Esecuzione tipica: `node --env-file=.env.local --import tsx scripts/<file>.mts`
  (gli script `@/`-alias devono stare in `app/scripts/`).

### Test offline (deterministici, logica pura)
- ✅ Esempi: `test-doc-attachments.mts` (allegati/recognizer, 22/22), `test-room-combinations.mts`,
  `test-classify-temporal.mts`, `test-extract-fixes.mts`, `test-bambini-culle.mts`,
  `test-room-count.mts`, `test-matrimoniale.mts`. Verificano funzioni pure senza rete.

### Test E2E / integrazione (toccano servizi reali)
- ✅ Esempi: `test-chat-e2e.mjs`, `test-commercial-flow-e2e.mjs`, `test-booking-flow-definitive-e2e.mjs`,
  `test-gruppi-e2e.mts`, `test-quote-e2e.mjs`, `test-concierge*.mts`, `test-email-*.mts`,
  `test-gmail-auth.mts`, `test-whatsapp.mts`, `test-deliver.mts`. Usano Supabase/Anthropic/Gmail reali
  (richiedono `.env.local`).

### Diagnostica (sola lettura, non test)
- ✅ `inspect-email-poll.mts`, `inspect-routing-log.mts`, `inspect-test-conversation.mts`: ispezione
  read-only usata durante l'incidente del 27/06 (→ [CHANGELOG.md](CHANGELOG.md)).

### E2E del pilota (procedura)
- ✅ Il test E2E email reale (poll controllato, autosend, dedup) ha una procedura dedicata →
  [RUNBOOKS/email-e2e-test.md](RUNBOOKS/email-e2e-test.md).

---

## Parte 2 — Guiding Principles

- **Offline prima, reale poi.** I test deterministici (logica pura) girano sempre; l'E2E sul percorso
  reale è obbligatorio prima di dichiarare "completato" (Definition of Done).
- **Niente "sembra funzionare".** Un test deve produrre una prova oggettiva (PROJECT_RULES §2).
- **E2E controllato e sicuro.** I test che toccano canali reali rispettano i guardrail del pilota
  (autosend OFF, cron sospeso, casella dev) per non contattare ospiti reali.
- **Verifica del DB col catalogo, non con l'app.** L'app può "sembrare" funzionante con tabelle assenti
  (errori storicamente ingoiati): per le migrazioni vale `to_regclass` (ADR-0009).

---

## Future Evolution
*Coerenti coi principi; non roadmap.*
- CI che esegue tsc + build + test offline come gate automatico del merge.
- Harness offline per i canali (WhatsApp/email) senza rete, già parzialmente presente.
- Separazione formale `test:offline` vs `test:e2e` (script npm).

---

## Related Documents
- [../PROJECT_RULES.md](../PROJECT_RULES.md) — §1 Definition of Done, §10 Testing
- [DEPLOYMENT.md](DEPLOYMENT.md) — verifiche pre-merge
- [DATABASE.md](DATABASE.md) — verifica migrazioni
- [RUNBOOKS/email-e2e-test.md](RUNBOOKS/email-e2e-test.md)
