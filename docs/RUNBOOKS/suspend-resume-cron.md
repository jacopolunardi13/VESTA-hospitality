# RUNBOOK — Sospendere / riattivare un cron (pg_cron)

I cron sono in **pg_cron** (Supabase), non in Vercel. Job: `vesta-followups` (`*/5`), `vesta-ical-sync`
(`*/15`), `vesta-email-poll` (`*/2`). Origine → [../DATABASE.md](../DATABASE.md).

## Vedere lo stato
SQL Editor:
```sql
select jobname, schedule, active from cron.job;
```

## Sospendere (conserva la configurazione)
```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'vesta-email-poll'),
  active := false
);
select jobname, schedule, active from cron.job where jobname = 'vesta-email-poll'; -- atteso: active = f
```

## Riattivare
```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'vesta-email-poll'),
  active := true
);
```

## Quando sospendere
Durante interventi su email/dedup/migrazioni, per evitare re-ingest mentre si lavora (vedi incidente in
[../CHANGELOG.md](../CHANGELOG.md)). **`vesta-email-poll` è attualmente sospeso** (27/06/2026).

## Related Documents
- [../INFRASTRUCTURE.md](../INFRASTRUCTURE.md) · [../DATABASE.md](../DATABASE.md) · [diagnose-duplication.md](diagnose-duplication.md)
