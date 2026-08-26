# Installation

Nimm das Paket, das zu deiner Distribution passt. Alle drei enthalten dasselbe
Programm.

| Distribution              | Datei                            |
| ------------------------- | -------------------------------- |
| Ubuntu, Zorin OS, Debian  | `seb-linux-<version>-amd64.deb`   |
| CachyOS, Arch, Manjaro    | `seb-linux-<version>-x64.pacman`  |
| Alles andere              | `seb-linux-<version>-x86_64.AppImage` |

## Ubuntu / Zorin OS

```bash
sudo dpkg -i seb-linux-*-amd64.deb
sudo apt-get install -f          # nur falls Abhängigkeiten fehlen
```

`seb://`-Links und `.seb`-Dateien sind danach registriert.

## CachyOS / Arch / Manjaro

```bash
sudo pacman -U seb-linux-*-x64.pacman
```

## AppImage (alle übrigen Systeme)

```bash
chmod +x seb-linux-*-x86_64.AppImage
./seb-linux-*-x86_64.AppImage --install
```

`--install` registriert die AppImage-Datei für `seb://`-Links und `.seb`-Dateien
— nur für deinen Benutzer, ohne root. Verschiebe die Datei vorher an einen festen
Ort (z. B. `~/Anwendungen/`), denn der Eintrag zeigt auf ihren Pfad. Rückgängig
mit `--uninstall`.

### Wenn das AppImage nicht startet

```
AppImages require FUSE to run.
```

Ubuntu 24.04 und Zorin 17 bringen nur FUSE 3 mit, AppImages brauchen FUSE 2:

```bash
sudo apt install libfuse2t64        # ältere Systeme: libfuse2
```

Ohne Installation geht auch:

```bash
./seb-linux-*.AppImage --appimage-extract-and-run
```

Auf Ubuntu und Zorin ist das `.deb` der einfachere Weg — es braucht kein FUSE.

## Benutzung

```bash
seb-linux ~/Downloads/config.seb        # Prüfung starten
seb-linux ~/Downloads/config.seb --verify   # nur Config prüfen, kein Fenster
```

Oder in Moodle auf den `seb://`-Link klicken.

**Raus kommst du immer mit `Strg` + `Shift` + `Q`.**
`Strg` + `Shift` + `M` gibt den Bildschirm frei, ohne die Prüfung zu beenden.

## Wayland

Unter einer Wayland-Sitzung läuft der Client standardmäßig über **XWayland**, und
das ist Absicht: Wayland-Compositors lassen Anwendungen in der Regel nicht zu,
sich dauerhaft über alle anderen Fenster zu legen. Nativ Wayland würde die
Abschottung also schwächen, die den Kiosk-Modus ausmacht.

Wer natives Wayland braucht (fraktionale Skalierung, HiDPI, Eingabemethoden):

```bash
seb-linux config.seb --wayland
```

oder dauerhaft `SEB_LINUX_WAYLAND=1`.

## Selbst bauen

```bash
npm install
npm run dist            # AppImage + deb + pacman nach release/
```

Für das pacman-Paket wird `bsdtar` benötigt (`libarchive-tools` bzw.
`libarchive`).
