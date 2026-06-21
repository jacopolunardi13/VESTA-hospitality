# Branding per-property (verso gli ospiti)

Identità delle **strutture clienti** (LunArt, Bella Vigna, …) usata nelle **comunicazioni
verso gli ospiti** (email — step successivo). Distinta dal branding **Vesta** della
piattaforma (`/public/brand/vesta`, dashboard/login/app).

## Come si risolve
`getPropertyBrand(property)` in `src/lib/brand.ts` legge `properties.settings.brand`:

```jsonc
// properties.settings
{ "brand": { "name": "LunArt B&B", "logo": "<URL pubblico>", "primaryColor": "#000000" } }
```

- **Produzione (multi-tenant, scala 1000)**: `logo` è un **URL pubblico** (es. Supabase
  Storage) caricato dal gestore — nessun deploy per cambiare logo.
- **Dev / pilota**: fallback su file committato qui, convenzione `properties/<slug>/logo.(svg|png)`.

## Strutture pilota
- `lunart/` — LunArt B&B (Firenze). Logo definitivo da inserire qui (o via settings.brand.logo).
- `bella-vigna/` — futura.

Le email avranno il logo della **struttura** in testa e una dicitura discreta
"Powered by Vesta Hospitality" nel footer.
