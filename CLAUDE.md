# Solblikk
Solbane for valgt dato i kart (Kartverket topo) og kamera med solbane over bildet. Laget for Chrome på Android.
Flere filer: `index.html`, `css/app.css`, `js/*.js` (ES-moduler), `sw.js`, `manifest.webmanifest`, `icons/`.
Nettside: https://kilemann.github.io/solblikk.io/

## Regler for alt arbeid i dette repoet
- Svar brukeren på norsk. Commit-meldinger på norsk, med versjon først (f.eks. «Appnavn 1.4.0: kort beskrivelse»).
- Hver endring får nytt versjonsnummer (MAJOR.MINOR.PATCH) og en linje i endringsloggen. Versjonen skal være lik på alle stedene under.
- Lever rett på `main` når resultatet er godt nok og testene er grønne. Kjør `git fetch origin main` og rebase før push.
- Testdrevet utvikling (TDD) bare når brukeren ber om det. Eksisterende tester kjøres alltid før push.
- Tekniske påstander skal sjekkes mot dokumentasjon eller kilde, ikke gjettes.
- Appen står på samlesida (kilemann.github.io). Den skal vise navn, versjon og en (i)-knapp øverst til venstre. (i) åpner info-vinduet med bruksanvisning og versjonsliste. Oppdater versjonslista der ved hver ny versjon.
- Publiseres med GitHub Pages fra `main` (rot). Det tar noen minutter før endringen er ute.

## Versjon står her
- `js/version.js` (`VERSION`, vises i appen øverst og nederst)
- `package.json`
- `sw.js` (`VERSION`, styrer cachen)
- `CHANGELOG.md` (øverste oppføring) og versjonslista i info-vinduet i `index.html`

## Tester
`npm test` (Node 22). Solberegning (NOAA/Meeus), horisont, kartgeometri, projeksjon. `tests/release.test.js` sjekker versjon, service worker-filer og ikoner.
Kan ikke testes automatisk: kompass, kamera og GPS på ekte telefon.
