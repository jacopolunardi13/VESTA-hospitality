#!/usr/bin/env node
// ============================================================================
// Hook PreToolUse — guard-secrets  (Vesta Autonomous Engineering, F1)
// ============================================================================
// Difesa in profondità sulla Autonomy Boundary (docs/foundations/ENGINEERING.md).
// Riceve su stdin il JSON dell'hook, ispeziona i comandi Bash e BLOCCA (exit 2)
// le azioni RED che non portano il flag di intento esplicito.
//
// Esito:
//   exit 0  → consentito
//   exit 2  → bloccato (il messaggio su stderr torna a Claude come motivazione)
//
// RED bloccati:
//   - stampa/lettura di segreti: cat/less/head/tail/printenv/env su file .env*, echo di *_KEY/_SECRET/_TOKEN
//   - git push            (bypass: ALLOW_PUSH=1 nel comando, solo dopo ok del PO)
//   - deploy PRODUZIONE: vercel --prod / promote / alias / rollback  (bypass: ALLOW_PROD_DEPLOY=1)
//   - deploy PREVIEW: vercel deploy / vercel (bare) → richiede ALLOW_PREVIEW_DEPLOY=1 (non è GREEN silenzioso)
//     read-only vercel (ls/inspect/logs/env/whoami/…) = sempre GREEN
//   - distruttivi: rm -rf /  ·  git reset --hard su origin/main  ·  git push --force
// ============================================================================

let raw = ''
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  let cmd = ''
  let tool = ''
  try {
    const j = JSON.parse(raw || '{}')
    tool = j.tool_name ?? j.toolName ?? ''
    cmd = j.tool_input?.command ?? j.input?.command ?? j.command ?? ''
  } catch {
    process.exit(0) // input non parsabile → non bloccare (fail-open sul parsing, non sui pattern)
  }
  if (tool && tool !== 'Bash') process.exit(0)
  if (!cmd) process.exit(0)

  // Rimuove il "rumore" (corpi heredoc + stringhe quotate) prima di applicare i pattern,
  // così una menzione di "git push"/".env" dentro un messaggio di commit o un echo non
  // genera falsi positivi. I comandi RED reali (non quotati) restano intatti.
  const scan = cmd
    .replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?\n\s*\2\b/g, ' ') // corpi heredoc
    .replace(/'[^']*'/g, ' ')   // stringhe single-quote
    .replace(/"[^"]*"/g, ' ')   // stringhe double-quote

  const block = (msg) => {
    process.stderr.write(`⛔ guard-secrets: ${msg}\n(Autonomy Boundary → azione RED. Vedi docs/foundations/ENGINEERING.md §3.)\n`)
    process.exit(2)
  }

  // 1) Segreti: mai stampare/leggere file .env* o variabili sensibili.
  if (/\b(cat|less|more|head|tail|bat|xxd|od|strings)\b[^|;&]*\.env(\.[\w.]+)?\b/.test(scan))
    block('lettura/stampa di un file .env* non consentita (segreti).')
  if (/\bprintenv\b/.test(scan) || /(^|[;&|]\s*)env\s*($|[|;&])/.test(scan))
    block('dump completo delle env non consentito (potrebbe contenere segreti).')
  if (/\becho\b[^|;&]*\$\{?[A-Za-z_]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)/i.test(scan))
    block('echo di una variabile sensibile non consentito.')

  // 2) git push → RED, richiede intento esplicito (il flag di bypass si cerca sul comando reale).
  if (/\bgit\s+push\b/.test(scan) && !/\bALLOW_PUSH=1\b/.test(cmd))
    block('git push è RED. Richiede approvazione PO → riesegui con "ALLOW_PUSH=1 git push …".')
  if (/\bgit\s+push\b.*(--force|--force-with-lease|-f\b)/.test(scan))
    block('git push --force non consentito su questo progetto.')

  // 3) Deploy Vercel. Read-only (ls/inspect/logs/env/…) = GREEN anche con `--prod` come filtro.
  //    PRODUZIONE (--prod/--production/promote/alias/rollback/redeploy) = RED → ALLOW_PROD_DEPLOY=1.
  //    PREVIEW (`vercel deploy` / `vercel` bare) NON è GREEN silenzioso → richiede ALLOW_PREVIEW_DEPLOY=1.
  {
    const usesVercel = /\bvercel\b/.test(scan)
    const roVercel   = /\bvercel\s+(ls|list|inspect|logs?|env|whoami|projects?|pull|link|teams|certs|domains|dns|git|help|--version|-v)\b/.test(scan)
    const prodMarker = /\bvercel\b[^|;&]*(--prod\b|--production\b)/.test(scan) || /\bvercel\b[^|;&]*\b(promote|alias|rollback|redeploy)\b/.test(scan)
    const deployVerb = /\bvercel\s+deploy\b/.test(scan)
    const bareVercel = /(?:^|[|;&]\s*)(?:npx\s+)?vercel(?:\s+--[\w-]+)*\s*(?:$|[|;&])/.test(scan)
    const allowProd    = /\bALLOW_PROD_DEPLOY=1\b/.test(cmd)
    const allowPreview = /\bALLOW_PREVIEW_DEPLOY=1\b/.test(cmd)
    if (usesVercel && !roVercel) {
      if (prodMarker && !allowProd)
        block('deploy/promote in PRODUZIONE via Vercel è RED. Con ok PO: "ALLOW_PROD_DEPLOY=1 …".')
      else if ((deployVerb || bareVercel) && !prodMarker && !allowPreview && !allowProd)
        block('deploy Vercel (anche Preview) richiede approvazione esplicita → "ALLOW_PREVIEW_DEPLOY=1 …" (o ALLOW_PROD_DEPLOY=1 per prod). ls/inspect/logs restano ok.')
    }
  }

  // 4) Distruttivi.
  if (/\brm\s+-rf?\s+(\/(\s|$)|\/\*|~\/?\s*$)/.test(scan))
    block('rm -rf su path pericoloso non consentito.')
  if (/\bgit\s+reset\s+--hard\b[^|;&]*origin\/main\b/.test(scan))
    block('git reset --hard su origin/main non consentito.')

  process.exit(0)
})
