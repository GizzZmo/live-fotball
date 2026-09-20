# LiveFotball

Norsk live-resultatside som viser fotballkamper fortløpende.

## Hva den gjør

- Henter dagens og gårsdagens kamper fra Free Football Live Scores API
- Viser live minutt, stilling, form og stadion
- Grupperer etter liga
- Auto-oppdaterer hvert 25. sekund mens kamper pågår
- Tabeller for valgt liga
- Kampsammendrag med statistikk og nøkkelhendelser

## Slik kjører du den

Åpne `index.html` i nettleseren, eller start en enkel server:

```bash
python3 -m http.server 8080
```

Gå til http://localhost:8080

## Repo og deploy

- GitHub: https://github.com/GizzZmo/live-fotball
- Vercel: importer repoet eller `npx vercel --prod`
- GitHub Pages: workflowen `.github/workflows/pages.yml` publiserer `main`

Data: [worldcup26.ir soccer API](https://worldcup26.ir/football-api)
