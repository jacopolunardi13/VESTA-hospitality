# CHANGELOG

Registro cronologico dei **cambiamenti notevoli** (comportamento del sistema, schema, infrastruttura,
documentazione). Le **decisioni** vivono in [DECISIONS.md](DECISIONS.md); le date sono quelle note
(◐ se approssimate). Più vecchio in basso. La storia di dettaglio resta in `git log`.

---

## 2026-06-28
- **Riorganizzazione documentazione** (`docs/` + `PROJECT_RULES.md`): introdotta documentazione tecnica
  ufficiale con standard *Current State / Guiding Principles / Future Evolution / Related Documents*,
  registro ADR ([DECISIONS.md](DECISIONS.md)), e archiviazione dei documenti di planning superati in
  `docs/archive/`. Codificate le regole: Product First, Documentation as Code, Single Source of Truth,
  classificazione delle affermazioni (verificata/dedotta/ipotizzata), ADR-driven changes.

## 2026-06-27
- **Incidente: desync repo↔DB scoperto.** Le migrazioni 0011/0012/0013 risultavano "applicate" (da
  memoria/sintesi) ma **non esistevano** sul DB (`to_regclass` = NULL). Causa-radice: codice che
  **ingoiava gli errori Supabase** → dedup inerte → **re-ingest massivo** (cron `vesta-email-poll` ogni
  2 min × dedup no-op → 27.881 messaggi, email duplicate centinaia di volte).
- **Mitigazione**: cron `vesta-email-poll` **sospeso** (`active=false`).
- **Fix migrazioni**: 0011, 0012, 0013 **applicate e verificate** (`to_regclass` + PostgREST, 29 tabelle).
- **Fix codice — Fail-Fast** (commit `d15b87a`): introdotto `src/lib/supabase/guard.ts` (`dbThrow`); ogni
  scrittura/lettura DB ora controlla `.error` (dati core lanciano, telemetria logga).
- **Test E2E email (preparazione)**: scoperti **falsi positivi del Router L0** (fornitori/Amazon/Poste
  classificati `guest`) → da risolvere prima dell'autosend per ospiti reali. Nessuna email inviata
  (autosend OFF).
- **Storage**: creato bucket privato `documents`.

## 2026-06-25 ◐
- **Document Center MVP (Booking)** + **seam Registry/Recognizer** (commit `1548c89`, `85c72f8`) sul
  branch `document-center`: archiviazione automatica email+PDF Booking, stato "Pronto per il
  commercialista", storico invii. NON in `main`.

## 2026-06 ◐ (da git log)
- **Fase B** consegnata e mergiata in `main` (commit `2c6e729`): `deliverToGuest`, `pending_actions`,
  PDF preventivo/conferma all'approvazione, testi IT+EN.
- **Canale email pilota**: Router L0 + `ota_inbox`/`reservations_staging` + kill-switch (`4624caf`);
  hardening rete-sicurezza + vista monitoraggio (`e94cc13`); endpoint diagnostico `/api/email/diag`
  (`f34045a`); email HTML brandizzata + PDF allegato (`0edb12e`); motore documenti per-property (`8644f2f`).

---

## Related Documents
- [DECISIONS.md](DECISIONS.md) — perché di questi cambiamenti
- [DATABASE.md](DATABASE.md) — stato migrazioni
- [ARCHITECTURE.md](ARCHITECTURE.md) — stato tecnico
- [ROADMAP.md](ROADMAP.md) — priorità attuali
