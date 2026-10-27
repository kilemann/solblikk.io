# Solblikk

Se solbanen for en valgt dato – i kart og live gjennom kameraet. Laget for Android (Chrome) som installerbar web-app.

## Funksjoner
- **Kartmodus** (Kartverket topo): solbanediagram rundt valgt punkt, sommer- og vintersolverv, timeperler, retning mot soloppgang og solnedgang, og terrenghorisonten som grønn flate. Hold inne i kartet for å flytte punktet. Vri kartet med to fingre, og trykk på kompasset for å rette det mot nord. Dagsglideren øverst blar raskt gjennom året.
- **Kameramodus**: solbanene, timeperlene, opp- og nedgangsmerker, terrenglinje og kompassmerker lagt over kamerabildet mens du panorerer.
- **Terreng**: horisonten regnes ut fra Kartverkets høydedata (30 km radius) med jordkrumning og refraksjon. Opp- og nedgang vises både over terreng og flat horisont, sammen med antall timer med direkte sol.

## Kalibrering
Telefonens kompass viser magnetisk nord og kan ha sensorfeil. Trykk **Kalibrer kompass** i kameramodus, sett krysset på sola eller på et landemerke du har valgt i kartet, og trykk på knappen for målet. Juster synsfeltet til timeperlene følger landskapet når du snur deg.

## Utvikling
Testdrevet: all logikk i `js/sun.js`, `js/horizon.js`, `js/projection.js`, `js/mapgeo.js` og `js/format.js` er dekket av tester.

```
npm test
```

Krever Node 18+. Ingen avhengigheter.

## Datakilder
- Kart: Kartverket, topografisk norgeskart (WMTS-cache), CC BY 4.0
- Kartrotasjon: [leaflet-rotate](https://github.com/Raruto/leaflet-rotate) 0.5.0
- Høyde: Kartverket, høyde-API (`ws.geonorge.no/hoydedata/v1/punkt`), CC BY 4.0
- Solberegning: NOAA Solar Calculator / Jean Meeus, *Astronomical Algorithms*

Se [CHANGELOG.md](CHANGELOG.md) for versjoner.
