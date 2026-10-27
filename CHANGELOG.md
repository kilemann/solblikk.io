# Endringslogg – Solblikk

Formatet følger [Keep a Changelog](https://keepachangelog.com/no/1.1.0/), og versjoneringen følger [semantisk versjonering](https://semver.org/lang/no/).

## [0.2.1] – 2026-10-27

### Endret
- Rolig kartrotasjon: kartet roterer først når fingrene har vridd seg mer enn 15°, og starter da mykt uten hopp. Vanlig knipezoom roterer ikke lenger kartet.
- Opp- og nedgangstidene ligger nå foran timetallene og sola på kartet.
- Kartet viser ikke lenger sommersolverv (rød stiplet) eller terrengflaten (grønn). Begge vises fortsatt i kameraet.

### Rettet
- Soloppgang og solnedgang over terreng kunne hoppe til feil tidspunkt når sola bare tittet fram noen minutter gjennom et smalt skar. Glimt under 10 minutter flytter ikke lenger tidspunktene, men teller fortsatt med i timer med direkte sol.

## [0.2.0] – 2026-10-27

### Lagt til
- Dagsglider under logo og dato som går over hele skjermbredden, med månedsfelt som er like brede som månedene er lange. Pilene flytter fortsatt én dag om gangen.
- Kartet kan roteres med to fingre (leaflet-rotate). Ny kompassknapp viser hvor nord er og retter kartet mot nord ved trykk.
- Liten sol på kartet som følger tidsglideren. Den blir grå når den står bak terrenget.
- Etiketter med klokkeslett for soloppgang og solnedgang på kartet, med minutter (f.eks. «Opp 04:57»).

### Endret
- Større N-, Ø-, S- og V-merker på kartet.
- Teksten under tidsglideren er kortere, mindre og alltid på én linje, så arket ikke endrer høyde.
- Solvervbanene lagres mellom tegninger, så glidere og datoskifte går raskere.
- Solbanediagrammet på kartet er litt mindre, så opp- og nedgangsmerkene får plass.

### Rettet
- Solbaner, ringer og terreng ble ikke tegnet på kartet. En generell CSS-regel for knappeikoner krympet Leaflets tegneflate til 22 px. Regelen gjelder nå bare egne ikoner.

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
