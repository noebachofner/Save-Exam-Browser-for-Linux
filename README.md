# Safe Exam Browser for Linux (inoffiziell)

Ein eigenständiger, SEB-kompatibler Prüfungsbrowser für Linux (Ubuntu, ZorinOS und
Derivate).

Der offizielle [Safe Exam Browser](https://github.com/SafeExamBrowser) gibt es nur für
Windows, macOS und iOS. Der Windows-Client ist C#/.NET mit tief verdrahteten Win32-APIs
(Registry-Policies, Explorer-Shell, Prozess-Whitelists) — der lässt sich nicht portieren.
Dieses Projekt ist deshalb eine **Neuimplementierung der Kompatibilitäts-Schicht**: die
Konfigurations- und Krypto-Formate von SEB sind hier 1:1 aus der offiziellen
Referenz-Implementierung nachgebaut, das Browser-Frontend ist Electron/Chromium.

> **Wichtig:** Dies ist kein offizielles Produkt des SEB-Projekts oder der ETH Zürich.
> Ob eine konkrete Prüfung diesen Client akzeptiert, entscheidet die Konfiguration der
> Prüfung — siehe [Wird das bei meiner Prüfung funktionieren?](#wird-das-bei-meiner-prüfung-funktionieren).

## Schnellstart

```bash
git clone https://github.com/noebachofner/Save-Exam-Browser-for-Linux.git
cd Save-Exam-Browser-for-Linux
npm install
npm run build

# Konfiguration aus einer Datei
npm start -- pfad/zur/exam.seb

# Konfiguration über einen seb://-Link der Schule
npm start -- "seb://moodle.example.edu/exam.seb"

# Verschlüsselte Konfiguration
npm start -- exam.seb --password=geheim
```

Erst mal nur prüfen, ob die Konfiguration korrekt gelesen wird — ohne Fenster:

```bash
npm start -- exam.seb --verify
```

Ausgabe:

```
Config Key : 4d90e6aac78afaf39cd8251c9ad1ed67cff929e22a1d6901a8696f154f33c14b
Start URL  : https://moodle.example.edu/mod/quiz/view.php?id=42
Headers    : enabled
URL filter : 3 rule(s)
```

## Installieren und per seb://-Link starten

So musst du nichts mehr eintippen — Link in Moodle anklicken, Prüfung startet.

```bash
npm run dist:deb                            # → release/seb-linux_0.1.0_amd64.deb
sudo apt install ./release/seb-linux_*.deb  # installiert nach /opt und registriert den Handler
```

Danach einmalig als Standard-Handler setzen (auf manchen Desktops passiert das schon
automatisch):

```bash
update-desktop-database ~/.local/share/applications 2>/dev/null
xdg-mime default seb-linux.desktop x-scheme-handler/seb
xdg-mime default seb-linux.desktop x-scheme-handler/sebs
xdg-mime default seb-linux.desktop application/x-seb
```

Prüfen, ob es sitzt:

```bash
xdg-mime query default x-scheme-handler/seb   # → seb-linux.desktop
xdg-open "seb://moodle.example.edu/exam.seb"  # muss die App starten
```

Ab jetzt startet ein Klick auf einen `seb://`-Link im Browser direkt die Prüfung, und
ein Doppelklick auf eine `.seb`-Datei ebenfalls.

Alternativ als AppImage (ohne Installation, dann aber auch ohne Link-Handler):

```bash
npm run dist:appimage
./release/*.AppImage exam.seb
```

## Aktualisieren

Nach einem `git pull` die installierte App neu bauen und ersetzen:

```bash
pkill -f seb-linux                          # laufende Sitzung beenden
git pull
npm install                                 # nur nötig, wenn sich Abhängigkeiten geändert haben
npm run dist:deb
sudo dpkg -i ./release/seb-linux_*.deb
```

`dpkg -i` installiert auch dann, wenn dieselbe Version schon installiert ist —
`apt install` würde bei gleicher Versionsnummer kommentarlos nichts tun.

Prüfen, welche Version läuft:

```bash
dpkg -l seb-linux | tail -1
```

### Konfiguration hinter einem Login

Manche Moodle-Instanzen (z. B. mit aktivem `forcelogin`) leiten den
Konfigurations-Endpunkt auf die Anmeldeseite um. Der Client öffnet dann ein
Anmeldefenster; nach dem Login lädt er die Konfiguration mit deiner Session und
startet die Prüfung. Die Anmeldung bleibt gespeichert, du musst sie also nicht
bei jedem Start wiederholen.

Falls das Anmeldefenster nicht zum Ziel führt, funktioniert immer noch der
manuelle Weg: `.seb`-Datei im Browser herunterladen und den Client damit starten.

### Wegtabben und festhängende Fenster

Unter Linux ist Alt+Tab Sache des Window-Managers, nicht der Anwendung. Was ein
Wegtabben praktisch verhindert, ist das Always-on-Top-Fenster im Kiosk-Modus —
und wenn der Window-Manager zickt, kann das den Rechner unbenutzbar machen.
Dafür gibt es zwei Wege:

**Strg + Shift + M** gibt den Bildschirm frei, ohne die Sitzung zu beenden:
Always-on-Top wird abgeschaltet, Vollbild und Kiosk verlassen, das Fenster
minimiert. Immer verfügbar, auch ohne Flags — also auch beim Start über einen
`seb://`-Link.

**`--allow-switching`** behält den Kiosk-Modus, verzichtet aber von Anfang an auf
Always-on-Top und lässt Alt+Tab durch:

```bash
seb-linux config.seb --allow-switching
```

Dauerhaft, auch für Link-Starts:

```bash
SEB_LINUX_ALLOW_SWITCHING=1
```

Beides schwächt die Abschottung, die deine Schule mit SEB durchsetzt. Auf deinem
eigenen Rechner ist das deine Entscheidung; in einer bewerteten Prüfung solltest
du wissen, dass du damit von den Prüfungsbedingungen abweichst.

## Optionen

| Option                | Bedeutung                                                           |
| --------------------- | ------------------------------------------------------------------- |
| `--password=<pw>`     | Passwort für eine verschlüsselte `.seb`-Datei                        |
| `--verify`            | Konfiguration laden, Config Key ausgeben, beenden                    |
| `--self-test`         | Fenster öffnen, Start-URL laden, Ergebnis melden, beenden            |
| `--platform=windows`  | User-Agent-Plattform-Token (Standard: `windows`, alternativ `linux`) |
| `--no-kiosk`          | Normales Fenster statt Kiosk-Modus (Entwicklung)                     |
| `--allow-switching`   | Kiosk-Modus ohne Always-on-Top, Alt+Tab funktioniert                 |
| `--verbose`           | Ausführliches Logging                                                |
| `-h`, `--help`        | Hilfe                                                                |

## Wird das bei meiner Prüfung funktionieren?

Das hängt davon ab, **wie** dein Prüfungssystem SEB überprüft. Bei Moodle
(`quizaccess_seb`) gibt es zwei unabhängige Mechanismen:

### 1. Config Key — funktioniert ohne Zutun der Schule

Der Config Key ist ein SHA-256 über die kanonisch serialisierte Konfigurationsdatei.
Er ist **deterministisch und plattformunabhängig**: Windows-, macOS- und iOS-Client
berechnen aus derselben `.seb`-Datei denselben Wert, und dieser Client auch. Der Server
rechnet ihn selbst nach. Es steckt kein maschinen- oder OS-spezifisches Geheimnis drin.

Dieser Client implementiert den Algorithmus aus der offiziellen Referenz
(`Json.cs` + `DataProcessor.cs`) und sendet ihn als
`X-SafeExamBrowser-ConfigKeyHash: SHA256(URL + ConfigKey)`.

**Wenn deine Prüfung nur den Config Key prüft, sollte dieser Client durchkommen.**

### 2. Browser Exam Key (BEK) — braucht die Schule

Der BEK hängt an der Code-Signatur der Windows-Binärdatei. Er lässt sich nicht aus einer
Konfiguration ableiten und nicht von einem anderen Client reproduzieren. Wer ihn prüft,
muss die erlaubten Schlüssel vorher in Moodle eintragen.

Dieser Client geht damit ehrlich um:

- Steht ein `browserExamKey` in der Konfiguration, wird er verwendet.
- Sonst wird aus `examKeySalt` + Config Key ein eigener Schlüssel abgeleitet — der ist
  nur sinnvoll, wenn die Institution ihn freischaltet.
- Sonst wird der Header weggelassen.

Es wird **kein** Schlüssel einer signierten Windows-Installation nachgebaut. Das ist der
Punkt, an dem Kompatibilität in das Umgehen einer Prüfungssicherung kippen würde, und
technisch ginge es ohne die Signatur ohnehin nicht.

**Wenn deine Prüfung einen BEK erzwingt und die Schule keinen freischaltet, funktioniert
dieser Client dort nicht.** Das lässt sich nicht wegprogrammieren.

### 3. User-Agent

Moodle erkennt eine SEB-Sitzung unter anderem am `SEB`-Token im User-Agent. Dieser Client
hängt `SEB/3.9.0` an und präsentiert standardmäßig ein Windows-Plattform-Token
(`--platform=windows`), weil `.seb`-Konfigurationen für den Windows-Client geschrieben
sind. Mit `--platform=linux` identifiziert er sich als das, was er ist. Das Token ist
reine Kennung — auf Config Key und BEK hat es keinen Einfluss.

## Was der Client kann — und was nicht

Ehrliche Bestandsaufnahme in [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).
Kurzfassung:

**Umgesetzt**

- `.seb`-Dateien lesen: XML-Plist, gzip, passwortverschlüsselt (`pswd`, `pwcc`, `plnd`)
- `seb://` und `sebs://` Links herunterladen
- Config Key berechnen und als Header senden
- BEK-Header, wenn ein Schlüssel bekannt ist
- Kiosk-Modus: Vollbild, always-on-top, kein Menü, keine Popups, keine externen Programme
- Tastatur-Lockdown: DevTools, F-Tasten, Escape, Strg+N/T/W/P/R, Alt+F4, Alt+Pfeil
- URL-Filter mit SEB-Ausdrücken und Regex, Block-vor-Allow-Präzedenz
- Quit-Passwort (`hashedQuitPassword`)

**Nicht umgesetzt — und auf Linux teils prinzipiell nicht möglich**

- Kein OS-weiter Lockdown. Ein Linux-Userspace-Prozess kann den Window-Manager nicht
  entmachten; Alt+Tab, virtuelle Desktops und `Strg+Alt+F<n>` bleiben dem WM überlassen.
- Keine Prozess-Whitelist/Blacklist, keine Registry-Policies, kein Explorer-Shell-Kill
- Kein Screen Proctoring, keine SEB-Server-Anbindung
- Keine Public-Key-verschlüsselten `.seb`-Dateien (dafür bräuchte es das Zertifikat der
  Institution)

## Entwicklung

```bash
npm run check   # Format + Lint + Typecheck + Unit-Tests
npm test        # nur Unit-Tests
npm run smoke   # baut und startet die echte App unter Xvfb
```

Die Kern-Logik unter `src/core/` ist bewusst frei von Electron-Importen, damit sie ohne
Display testbar ist. `npm run smoke` startet zusätzlich die echte Anwendung headless und
prüft, dass Fenster, Rendering und User-Agent tatsächlich funktionieren.

### Aufbau

```
src/core/          Plattformunabhängige SEB-Kompatibilität (ohne Electron)
  config/          Plist-Parser, .seb-Container, Settings-Mapping
  crypto/          Config Key, Browser Exam Key, Passwort-Krypto
  browser/         URL-Filter, User-Agent
  net/             seb://-Links
src/main/          Electron-Hauptprozess: Fenster, Lockdown, Header-Injection
src/preload/       Minimale Bridge (nur Quit-Passwort)
src/renderer/      Quit-Dialog, Fehlerseite
tests/             Unit-Tests (Vitest)
```

## Rechtliches und Fairness

Dieser Client ist dafür gedacht, Prüfungen auf einem Linux-Gerät **regulär** schreiben zu
können — nicht, um Prüfungsauflagen zu unterlaufen. Der Lockdown ist auf Linux
nachweislich schwächer als unter Windows. Kläre den Einsatz mit deiner Schule ab, bevor
du damit in eine bewertete Prüfung gehst.

MIT-Lizenz, siehe [`LICENSE`](LICENSE). Nicht mit dem SEB-Projekt oder der ETH Zürich
verbunden. „Safe Exam Browser" ist ein Projekt der ETH Zürich.

## Beenden und Übungsmodus

### Immer rauskommen: Strg + Shift + Q

Diese Kombination beendet die Sitzung **immer** — auch im Kiosk-Modus und auch
wenn die Konfiguration ein Quit-Passwort setzt, das du nicht kennst. In einer
Anwendung festzustecken, die deinen Bildschirm übernommen hat, ist ein
Sicherheitsproblem; deshalb ist dieser Ausstieg bewusst nicht abschaltbar.

Beenden heisst: die Prüfungssitzung endet sichtbar. Es verschafft dir keinen
verdeckten Vorteil — Moodle sieht, dass du die Sitzung verlassen hast.

Falls die App gar nicht mehr reagiert:

```bash
pkill -f seb-linux
```

### Übungsmodus: `--no-kiosk`

```bash
seb-linux config.seb --no-kiosk
```

Normales Fenster statt Vollbild, Alt-Tab funktioniert, Schliessen jederzeit
möglich. Gedacht zum Einrichten und Ausprobieren.

**Das ist keine gültige Prüfungssitzung.** Der Kiosk-Modus ist genau die
Kontrolle, die deine Schule mit SEB durchsetzt. Wenn du eine bewertete Prüfung
schreibst, starte ohne `--no-kiosk`; andernfalls verstösst du gegen die
Prüfungsbedingungen deiner Schule.

