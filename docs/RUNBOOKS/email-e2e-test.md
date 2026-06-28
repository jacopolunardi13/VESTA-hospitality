# RUNBOOK — Test E2E del canale email (controllato e sicuro)

Verifica il percorso reale email senza rischio per gli ospiti. Principi → [../SECURITY.md](../SECURITY.md),
[../TESTING.md](../TESTING.md).

## Contesto importante
- Casella **produzione** = `lunartfirenze@gmail.com` (raggiungibile solo dal deploy/Preview, non in
  locale dove il Gmail è `info.lunart.firenze`).
- Il poll processa **tutte** le email non ancora instradate degli ultimi 3 giorni: con autosend ON
  risponderebbe a tutte (non solo all'email di test).

## Procedura sicura
1. **Sospendi il cron** `vesta-email-poll` ([suspend-resume-cron.md](suspend-resume-cron.md)) per
   controllare i poll manualmente.
2. Conferma `email_autosend_enabled = OFF` (kill-switch).
3. **Ispezione preventiva** (nessun invio): valutare cosa processerebbe il poll. Localmente serve il
   Gmail di produzione (non disponibile) → in alternativa, **poll con autosend OFF** sull'endpoint del
   deploy (Preview o prod) e leggere il JSON dei `results`.
4. Verificare che l'unica email "guest" da processare sia quella di test. ⚠️ Attenzione ai **falsi
   positivi del Router L0** (fornitori/Amazon/Poste classificati `guest`): se presenti, NON abilitare
   l'autosend finché non risolti.
5. Solo se sicuro: abilitare autosend, inviare l'email di test, fare **un** poll, verificare il flusso,
   **disabilitare subito** l'autosend.
6. **Verifica dedup**: ripetere il poll → la stessa email deve essere **saltata** (nessun duplicato).

## Comando poll (senza esporre il secret)
```bash
read -rs SECRET   # incolla il CRON_SECRET, Invio
curl -s -X POST "https://<deploy-url>/api/email/poll" -H "Authorization: Bearer $SECRET"; echo
```
Su Preview protetto: aggiungere l'header `x-vercel-protection-bypass: <segreto>` (→ [../INFRASTRUCTURE.md](../INFRASTRUCTURE.md)).

## Strumenti di ispezione (sola lettura)
`app/scripts/inspect-email-poll.mts`, `inspect-routing-log.mts`, `inspect-test-conversation.mts`.

## Related Documents
- [../SECURITY.md](../SECURITY.md) · [../TESTING.md](../TESTING.md) · [../ARCHITECTURE.md](../ARCHITECTURE.md) (Router L0)
