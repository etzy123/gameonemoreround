# One More Round: bay picker

Spelers kiezen hun naam en slepen zichzelf in een bay (of tikken op "Join this bay").
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
- de bays op slot zetten (spelers kunnen dan niets meer wijzigen)
- alle bays leegmaken

## Spelerslijst aanpassen

De namen staan in `players.json`. Een nieuwe speler toevoegen: nieuw object met een uniek
`id` (bijv. `p48`) en redeployen. Een bestaand `id` niet hergebruiken voor iemand anders.

## Let op

- Spelers kiezen zelf wie ze zijn. Er is geen login, dus iemand kan zich voordoen als een
  ander. De server laat alleen toe dat je de naam verplaatst die je in "Who are you?" kiest.
- De pagina toont alleen namen, geen e-mailadressen of telefoonnummers. Iedereen met de
  link ziet wel de namen van alle deelnemers.
