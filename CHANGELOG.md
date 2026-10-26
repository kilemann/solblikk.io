# Endringslogg – Solblikk

Formatet følger [Keep a Changelog](https://keepachangelog.com/no/1.1.0/), og versjoneringen følger [semantisk versjonering](https://semver.org/lang/no/).

## [0.1.1] – 2026-10-26

### Endret
- Nytt app-ikon: kamera med sola i linsen og solbanen som prikket bue over.

### Lagt til
- Tester som sjekker at PNG-ikonene har størrelsen manifestet oppgir.

## [0.1.0] – 2026-10-26

Første versjon. Bygget med testdrevet utvikling (55+ automatiske tester, `npm test`).

### Lagt til
- Solberegning etter NOAA/Meeus: posisjon, soloppgang, solnedgang, høyeste punkt og tidslikning. Håndterer midnattssol og mørketid.
- Terrenghorisont fra Kartverkets høyde-API (32 avstander ut til 30 km, hver 3. grad), med jordkrumning og refraksjon. Lagres lokalt per punkt.
- Soloppgang og solnedgang både over terrenget og over flat horisont, og antall timer med direkte sol.
- Kartmodus med Kartverkets topografiske kart: solbanediagram for valgt dato, sommer- og vintersolverv, timeperler, terrenghorisont og retning mot sola på valgt klokkeslett.
- Live kameramodus: solbaner, timeperler, opp- og nedgangsmerker, terrenglinje, kompassmerker og sola på valgt klokkeslett lagt over kamerabildet.
- Kompasskalibrering mot sola eller et selvvalgt landemerke i kartet. Retter misvisning og sensorfeil i én operasjon.
- Justerbart kamerasynsfelt, med korrekt beskjæring av videobildet.
- Datovelger, tidsglidebryter og «I dag».
- PWA: kan installeres på Android og virker uten nett for app-skall og besøkte kartfliser.

### Kjente begrensninger
- Misvisning beregnes ikke automatisk. Kalibrer kompasset før bruk.
- Høydedata er terrengmodell uten bygninger og trær.
- Smale topper mellom 3°-strålene kan bli oversett.
