# Kompatibilität mit dem offiziellen Safe Exam Browser

Diese Datei hält fest, was aus der offiziellen Referenz-Implementierung übernommen wurde,
wie es überprüft ist, und wo die Grenzen liegen. Referenz ist
[`SafeExamBrowser/seb-win-refactoring`](https://github.com/SafeExamBrowser/seb-win-refactoring)
(Windows-Client, C#/.NET).

## Übernommene Formate und Algorithmen

| Bereich              | Referenz (C#)                                    | Hier                                    | Tests                     |
| -------------------- | ------------------------------------------------ | --------------------------------------- | ------------------------- |
| Kanonisches JSON     | `ConfigurationData/Json.cs`                      | `src/core/crypto/canonicalJson.ts`      | `tests/canonicalJson`     |
| Config Key           | `ConfigurationData/DataProcessor.cs`             | `src/core/crypto/configKey.ts`          | `tests/configKey`         |
| Browser Exam Key     | `Cryptography/KeyGenerator.cs`                   | `src/core/crypto/browserExamKey.ts`     | `tests/configKey`         |
| Passwort-Krypto      | `Cryptography/PasswordEncryption.cs`             | `src/core/crypto/passwordEncryption.ts` | `tests/sebConfig`         |
| `.seb`-Container     | `DataFormats/BinaryParser.cs`, `BinaryBlock.cs`  | `src/core/config/sebConfig.ts`          | `tests/sebConfig`         |
| XML-Plist            | `DataFormats/XmlParser.cs`                       | `src/core/config/plist.ts`              | `tests/plist`             |
| URL-Filter           | `Browser/Filters/SimplifiedRule.cs`, `RegexRule` | `src/core/browser/urlFilter.ts`         | `tests/urlFilter`         |
| Integritäts-Header   | `Browser/Handlers/ResourceHandler.cs`            | `src/main/headers.ts`                   | `tests/headers`           |
| Konfigurationsnamen  | `ConfigurationData/Keys.cs`                      | `src/core/config/appSettings.ts`        | `tests/settings`          |

### Config Key

```
ConfigKey = SHA256( canonicalJson(config) )
```

Kanonische Serialisierung (aus `Json.cs`):

- Schlüssel kulturabhängig sortiert (InvariantCulture — nicht ordinal!)
- `originatorVersion` wird entfernt
- leere Objekte werden komplett weggelassen
- keine Whitespaces
- Booleans klein, `null` als `""`, `data` als Base64
- Strings werden **nicht** escaped (bewusst so in der Referenz)

Pro Request:

```
X-SafeExamBrowser-ConfigKeyHash = SHA256( URL_ohne_Fragment + ConfigKey )
X-SafeExamBrowser-RequestHash   = SHA256( URL_ohne_Fragment + BrowserExamKey )
```

Beide Header gehen nur an Main-Frame-Requests und an Subresources auf demselben Host wie
die aktuelle Seite — genau wie in `ResourceHandler.AppendCustomHeaders`. Gesteuert wird
das über den Konfigurationsschlüssel `sendBrowserExamKey`, der in der Referenz **beide**
Header gemeinsam schaltet.

#### Offener Punkt: Sortier-Reihenfolge

Die Referenz sortiert mit `StringComparer.InvariantCulture`. Hier wird das mit
`Intl.Collator('en', { sensitivity: 'variant', caseFirst: 'lower' })` nachgebildet. Für
die ASCII-camelCase-Schlüssel echter `.seb`-Dateien stimmt das überein (Testfall:
`allowQuit` vor `URLFilterEnable`, was eine ordinale Sortierung genau andersherum
machen würde).

Für exotische Schlüssel mit Sonderzeichen ist das nicht bewiesen. Wer einen Config Key
gegen einen echten Server validiert und eine Abweichung findet: der Vergleich sitzt
isoliert in `compareKeys()` und lässt sich dort einzeln korrigieren.

### Passwortverschlüsselung

RNCryptor-artiges Layout, nach `PasswordEncryption.cs`:

```
[version:1][options:1][encSalt:8][authSalt:8][iv:16][ciphertext:N][hmac:32]
```

- PBKDF2-HMAC-**SHA1**, 10 000 Iterationen, 32-Byte-Schlüssel
- AES-256-CBC mit PKCS7
- HMAC-SHA256 über alles davor, konstant-zeitig verglichen

Getestet ist Round-Trip, Erkennung von Manipulation und Ablehnung falscher Passwörter.

### Container-Präfixe

| Präfix | Bedeutung                        | Status                        |
| ------ | -------------------------------- | ----------------------------- |
| `plnd` | Klartext                         | unterstützt                   |
| `pswd` | passwortverschlüsselt            | unterstützt                   |
| `pwcc` | passwortverschlüsselt (Client)   | unterstützt                   |
| `pkhs` | Public-Key-verschlüsselt         | nicht unterstützt             |
| `phsk` | Public-Key + symmetrisch         | nicht unterstützt             |
| —      | reines XML-Plist                 | unterstützt                   |

Zusätzlich wird gzip auf jeder Ebene erkannt und ausgepackt.

## Bewusst nicht portiert

Der Windows-Client erzwingt seinen Lockdown über das Betriebssystem. Das ist der Teil,
der sich nicht übertragen lässt — und der Grund, warum dieser Client sicherheitstechnisch
nicht mit ihm gleichzusetzen ist.

| Referenz-Projekt                | Was es tut                                     | Warum nicht portiert                                           |
| ------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `SafeExamBrowser.WindowsApi`    | Tastatur-/Maus-Hooks, Fenster-Handles          | Win32-only. X11/Wayland geben einem Userspace-Prozess das nicht |
| `SafeExamBrowser.Lockdown`      | Registry-Policies, Explorer-Shell abschalten   | Windows-spezifisch, kein Linux-Äquivalent                       |
| `SafeExamBrowser.Monitoring`    | Prozess-Whitelist/Blacklist, Fensterüberwachung| Bräuchte root und eine andere Vertrauensarchitektur             |
| `SafeExamBrowser.Service`       | Windows-Dienst mit erhöhten Rechten            | Nicht umgesetzt                                                 |
| `SafeExamBrowser.Proctoring`    | Screen Proctoring                              | Nicht umgesetzt                                                 |
| `SafeExamBrowser.Server`        | SEB-Server-Handshake, Ping, Live-Monitoring    | Nicht umgesetzt                                                 |
| `SafeExamBrowser.Integrity`     | Code-Signatur-Prüfung für den BEK              | Setzt eine signierte Windows-Binärdatei voraus                  |

### Was das praktisch heisst

Der Lockdown hier wirkt **innerhalb des Browserfensters**. Er blockiert DevTools,
Kontextmenü, Popups, Navigation ausserhalb der erlaubten URLs, Tastenkürzel im Fenster.

Was er **nicht** verhindern kann:

- Alt+Tab, Workspace-Wechsel, `Strg+Alt+F<n>` — das entscheidet der Window-Manager
- ein zweites Programm auf einem anderen Workspace
- `kill` von aussen
- ein zweites Gerät neben dem Laptop

Für eine ernsthafte Prüfungsaufsicht unter Linux bräuchte es einen dedizierten
Kiosk-Session-Modus (eigene Wayland-Session bzw. ein X11-Setup ohne WM-Shortcuts) — das
ist Konfiguration des Systems, nicht dieser Anwendung.

## Verifikation

```bash
npm run check   # Format, Lint, Typecheck, 100 Unit-Tests
npm run smoke   # baut und startet die echte App unter Xvfb
```

Der Smoke-Test macht zwei Dinge:

1. `--verify` gegen eine generierte `.seb`-Datei: Config Key wird berechnet, Exit 0.
2. `--self-test` gegen eine lokale HTML-Seite: Fenster öffnet sichtbar, Seite lädt, und
   der gesetzte User-Agent kommt in `navigator.userAgent` an.

Damit ist abgedeckt, dass das Ding nicht nur kompiliert, sondern auf einem Linux-System
tatsächlich startet und rendert.

## Nächste Schritte

- Config Key gegen eine echte `.seb`-Datei und einen echten Moodle-Server validieren
  (der einzige Punkt, der sich nicht offline beweisen lässt)
- `quitURL` auswerten und die Sitzung beim Erreichen sauber beenden
- Toolbar für `enableBrowserWindowToolbar` / `showReloadButton`
- Download-/Upload-Verzeichnisse gemäss Konfiguration
- `.desktop`-Handler für `seb://`-Links registrieren, damit Links aus Moodle direkt
  starten
