// Router Training Sprint #1 — SHADOW REPLAY del corpus reale sanitizzato (offline).
// Uso: node --import tsx scripts/router-shadow-replay.mts <evidence.json>
//
// NON tratta le label storiche come ground truth (sono decisioni del router in
// produzione a versioni MISTE del codice). Confronta la classificazione CANDIDATA
// (questo checkout) con quella STORICA e produce i gruppi di review richiesti.
//
// FEDELTÀ E LIMITI (dichiarati):
// - Input disponibili (sanitizzati server-side): sender_domain (fedele a domainOf()),
//   noreply_flag / subj_ota / subj_newsletter (regex ESATTE calcolate nel DB),
//   category/source/method/confidence/suppressed/decided_on. NIENTE header
//   List-Unsubscribe/Precedence/Auto-Submitted (non loggati) e NIENTE testo raw.
// - Il layer DOMINI del candidato è replayato ESATTAMENTE (probe neutro → solo dominio).
// - Il ramo newsletter-da-HEADER è INVARIATO tra storico e candidato: per le righe
//   in cui lo storico ha deciso newsletter deterministica SENZA flag subject/noreply,
//   il candidato è INFERITO uguale SE il layer domini non intercetta prima (inferred).
// - Il layer AI non è replayabile: se il layer deterministico candidato non decide,
//   una riga storica 'ai' resta non confrontabile (needs_human_label se cambierebbe).
import { readFileSync, writeFileSync } from "node:fs";
import { classifyEmailDeterministic, getRoutingRules } from "@/lib/email/routing";
import type { InboundEmail } from "@/lib/email/gmail";

const evidencePath = process.argv[2];
if (!evidencePath) { console.error("uso: router-shadow-replay.mts <evidence.json>"); process.exit(1); }
const ev = JSON.parse(readFileSync(evidencePath, "utf8"));
const rows: any[] = ev.results.corpus_rows.rows;
const propRules = ev.results.property_routing_rules.rows as { ota_domains: string; supplier_domains: string }[];

// Regole per-property dall'evidence (nel pilota: tutte vuote → rules baseline esatte).
const union = { otaDomains: [] as string[], supplierDomains: [] as string[] };
for (const p of propRules) {
  for (const d of JSON.parse(p.ota_domains)) union.otaDomains.push(String(d));
  for (const d of JSON.parse(p.supplier_domains)) union.supplierDomains.push(String(d));
}
const rules = getRoutingRules({ email_routing: union });

// Specchio della lista supplier del candidato SOLO per l'attribuzione di causa
// (la classificazione usa la funzione vera; lo specchio serve a nominare la regola).
const MIRROR_SUPPLIER = ["tonicosrl.it","amazon.it","amazon.com","amazon.de","amazon.fr","amazon.es","amazon.nl","amazon.co.uk","posteitaliane.it","poste.it","brt.it","dhl.com","dhl.it","gls-italy.com","sda.it","ups.com","fedex.com","nexive.it","intesasanpaolo.com","unicredit.it","nexi.it","paypal.it","paypal.com","stripe.com","satispay.com","sumup.com","enel.it","enelenergia.it","hera.it","a2a.it","tim.it","vodafone.it","vodafone.com","fastweb.it","windtre.it","agenziaentrate.gov.it","inps.it"];
const ends = (dom: string, base: string) => dom === base || dom.endsWith("." + base);
const supplierBase = (dom: string) => MIRROR_SUPPLIER.find((b) => ends(dom, b)) ?? null;

const mk = (domain: string, localpart: string, subject: string): InboundEmail => ({
  id: "x", threadId: "t", from: `${localpart}@${domain}`, fromName: "", subject,
  rfcMessageId: "", references: "", inReplyTo: "", body: "",
});

interface Out {
  i: number; domain: string; current: string; method: string; source: string;
  candidate: string; candidateVia: string; replay: "exact" | "inferred" | "non-replayable";
  changed: boolean; cause: string; decided_on: string;
}
const out: Out[] = [];

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const dom = String(r.sender_domain || "").toLowerCase();
  // 1) LAYER DOMINI (esatto): probe neutro — nessun flag subject/noreply.
  const domainHit = classifyEmailDeterministic(mk(dom, "probe", "x"), rules);
  let candidate = "", via = "", replay: Out["replay"] = "exact";
  if (domainHit && (domainHit.category === "ota_pms" || domainHit.category === "supplier_admin")) {
    candidate = domainHit.category; via = domainHit.category === "ota_pms" ? "OTA base domain" : `supplier domain: ${supplierBase(dom) ?? "?"}`;
  } else {
    // 2) LAYER FLAG (esatti dai flag server-side): newsletter-subj → ota-subj → noreply.
    //    Ordine del candidato: newsletter(headers|subj) → OTA subject → noreply.
    const headerNewsletterInferred = r.category === "newsletter_spam" && r.method === "deterministic" && !r.subj_newsletter && !r.noreply_flag;
    if (r.subj_newsletter) { candidate = "newsletter_spam"; via = "newsletter subject"; }
    else if (headerNewsletterInferred) { candidate = "newsletter_spam"; via = "header markers (inferred, branch unchanged)"; replay = "inferred"; }
    else if (r.subj_ota) { candidate = "ota_pms"; via = "OTA subject pattern"; }
    else if (r.noreply_flag) { candidate = "newsletter_spam"; via = "noreply/automated sender"; }
    else if (r.method === "ai") { candidate = "(ai-layer)"; via = "AI layer non replayabile"; replay = "non-replayable"; }
    else { candidate = "guest"; via = "default fail-safe"; }
  }
  const current = String(r.category);
  const changed = replay !== "non-replayable" && candidate !== current;
  let cause = "-";
  if (changed) {
    if (via.startsWith("supplier domain")) cause = "explicit base domain";
    else if (via === "OTA base domain") cause = "OTA rule";
    else if (via === "OTA subject pattern") cause = "OTA rule";
    else if (via === "noreply/automated sender" || via.includes("header markers")) cause = "automated marker";
    else if (via === "newsletter subject") cause = "altro deterministico (newsletter subject)";
    else if (via === "default fail-safe") cause = "altro deterministico (fall-through → guest)";
    else cause = "insufficiente evidence / non riproducibile";
  }
  out.push({ i, domain: dom, current, method: r.method, source: r.source, candidate, candidateVia: via, replay, changed, cause, decided_on: r.decided_on });
}

// ---- Gruppi ----
const replayable = out.filter((o) => o.replay !== "non-replayable");
const nonReplayable = out.filter((o) => o.replay === "non-replayable");
const changedAll = out.filter((o) => o.changed);
const blocksGuest = changedAll.filter((o) => o.current === "guest" && o.candidate !== "guest");
const unblocksNonGuest = changedAll.filter((o) => o.current !== "guest" && o.candidate === "guest");
const needsHuman = [
  ...nonReplayable,
  ...blocksGuest, // priorità massima: sempre review umana
];

const count = (arr: Out[], key: (o: Out) => string) => {
  const m = new Map<string, number>();
  for (const o of arr) m.set(key(o), (m.get(key(o)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`CORPUS RECORDS: ${out.length}`);
console.log(`REPLAYABLE (exact): ${out.filter((o) => o.replay === "exact").length}`);
console.log(`REPLAYABLE (inferred, header branch unchanged): ${out.filter((o) => o.replay === "inferred").length}`);
console.log(`NON-REPLAYABLE (AI layer): ${nonReplayable.length}`);
console.log(`\nCHANGED VS CURRENT: ${changedAll.length}`);
console.log(`BLOCKS CURRENT_GUEST: ${blocksGuest.length}`);
console.log(`UNBLOCKS CURRENT_NON_GUEST: ${unblocksNonGuest.length}`);
console.log(`NEEDS HUMAN LABEL: ${needsHuman.length}`);
console.log(`\nTOP CHANGE CAUSES:`);
for (const [c, n] of count(changedAll, (o) => o.cause)) console.log(`  ${n}× ${c}`);
console.log(`\nCHANGED — dettaglio per (current → candidate | causa | dominio):`);
for (const [k, n] of count(changedAll, (o) => `${o.current} → ${o.candidate} | ${o.cause} | ${o.domain}`)) console.log(`  ${n}× ${k}`);
console.log(`\nBLOCKS CURRENT_GUEST — OGNI riga (PRIORITÀ MASSIMA REVIEW):`);
for (const o of blocksGuest) console.log(`  #${o.i} ${o.decided_on} ${o.domain} | current=guest(${o.method}) → candidate=${o.candidate} via ${o.candidateVia}`);
console.log(`\nNON-REPLAYABLE (AI) — current per dominio:`);
for (const [k, n] of count(nonReplayable, (o) => `${o.current} | ${o.domain}`)) console.log(`  ${n}× ${k}`);

writeFileSync(process.argv[3] ?? "/tmp/shadow-replay-detail.json", JSON.stringify(out, null, 1));
console.log(`\ndettaglio completo → ${process.argv[3] ?? "/tmp/shadow-replay-detail.json"}`);
