# One More Round: bay picker

Iedereen staat bij de start al willekeurig in een bay (zie `seed.json`). Spelers slepen hun
naam op iemand anders om van plek te ruilen, of naar een bay met een open plek. Werkt met
muis en touch.

Tevreden met je groep? Met "Lock this bay" zet je een bay op slot: niemand kan er dan nog in,
uit of mee ruilen. Iedereen kan een bay op slot zetten, alleen de organisator kan hem weer
openen.
12 bays, 4 spelers per bay. Wijzigingen zijn live zichtbaar voor iedereen.

## Deployen op Railway

1. Zet deze map in een nieuwe GitHub-repo (of gebruik `railway up` vanuit de map).
2. In Railway: New Project > Deploy from GitHub repo.
3. Voeg een **Volume** toe aan de service, mount path `/data`.
   Zonder volume ben je de indeling kwijt bij elke redeploy.
4. Variables:
   - `DATA_DIR` = `/data`
   - `ADMIN_TOKEN` = een lange willekeurige string (alleen voor jou en Marc)
   - optioneel: `EVENT_NAME`, `EVENT_INFO`, `BAYS` (standaard 12), `PER_BAY` (standaard 4)
5. Settings > Networking > Generate Domain. Die link stuur je naar de spelers.

## Organisatormodus

Open eenmalig `https://<jouw-domein>/?admin=<ADMIN_TOKEN>`. De token wordt in je browser
onthouden en uit de URL gehaald. Daarna kun je:
- iedereen verslepen
- iedereen opnieuw willekeurig indelen (Shuffle everyone). Bays die op slot staan blijven
  zoals ze zijn.
- losse bays weer openen (Unlock bay)
- spelers verwijderen met het kruisje naast hun naam. Verwijderde spelers staan onder
  "Removed players" en kun je met Restore terugzetten (ze komen dan in "Not in a bay")
- nieuwe spelers toevoegen met "Add player". Ze komen in "Not in a bay"; sleep ze daarna
  in een bay. Toegevoegde spelers worden in `state.json` op het volume bewaard, dus
  `players.json` hoef je niet aan te passen.
- de bays op slot zetten (spelers kunnen dan niets meer wijzigen)
- alle bays leegmaken (haalt ook alle sloten eraf)

## Spelerslijst aanpassen

De namen staan in `players.json`. Een nieuwe speler toevoegen: nieuw object met een uniek
`id` (bijv. `p48`) en redeployen. Een bestaand `id` niet hergebruiken voor iemand anders.

## Let op

- Er is geen login: iedereen met de link kan elke naam verslepen. Zet de bays na de deadline
  op slot via de organisatormodus, dan kan alleen jij nog wijzigen.
- De pagina toont alleen namen, geen e-mailadressen of telefoonnummers. Iedereen met de
  link ziet wel de namen van alle deelnemers.

## Startindeling

De live indeling staat in `/data/state.json` op het Railway-volume en blijft staan bij elke
redeploy, zolang het volume op `/data` gemount is en `DATA_DIR=/data` is gezet.

`seed.json` bevat de indeling van 16 oktober (bay 12 op slot) en wordt alleen gebruikt als er
nog geen `state.json` op het volume staat, bijvoorbeeld als het volume ontbreekt.

## Updaten vanaf de vorige versie

Vervang de bestanden in je repo en push. De bestaande indeling op het volume blijft staan;
`seed.json` wordt bij een update niet opnieuw gebruikt.
