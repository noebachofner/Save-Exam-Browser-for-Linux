# Safe Exam Browser for Linux

An independent, SEB-compatible exam browser for Linux. Optimized for **Moodle**
and **Classtime**.

> Made with love in Switzerland 🇨🇭
>
> **Unofficial.** This project is not affiliated with, endorsed by, or derived
> from the official Safe Exam Browser project, ETH Zürich, or any institution.
> Compatibility with any given exam **cannot be guaranteed**.

## Downloads

Grab the latest build from [Releases](../../releases):

- `*.AppImage`
- `*.deb`
- `*.pacman`

**Currently compatible with:** CachyOS and Debian/Ubuntu-based distributions.
The AppImage runs on any 64-bit Linux.

See [INSTALL.md](INSTALL.md) for installation.

## Features

- Reads `.seb` configurations: XML plist, gzip, and password-encrypted
- Opens `seb://` and `sebs://` links — **start an exam straight from the link**
- Computes the SEB **Config Key** and sends the `X-SafeExamBrowser-*` headers
- Presents the **exact Windows SEB user agent** and client hints
- Kiosk mode: fullscreen, always-on-top, keyboard lockdown, URL filtering
- Interactive sign-in and password prompt for protected configurations
- Emergency exit (`Ctrl+Shift+Q`) and screen recovery (`Ctrl+Shift+M`)
- Automatic background updates, applied only on quit — never mid-exam

## Usage

```bash
seb-linux exam.seb                     # start from a file
seb-linux "sebs://school.edu/exam"     # start straight from a link
```

| Command             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `--password=<pw>`   | password for an encrypted configuration              |
| `--verify`          | load the config, print the Config Key, exit          |
| `--no-kiosk`        | windowed mode (development / practice)               |
| `--allow-switching` | kiosk without always-on-top; Alt+Tab works           |
| `--platform=linux`  | identify honestly as Linux instead of Windows        |
| `--wayland`         | use native Wayland instead of XWayland               |
| `--no-update`       | skip the start-up update check                       |
| `--install`         | register `seb://` links and `.seb` files             |
| `--uninstall`       | remove that registration                             |
| `--verbose`         | verbose logging                                      |
| `--help`            | show help                                            |

## Feedback

Bug reports and suggestions are very welcome — please open an
[issue](../../issues).

## Build

```bash
npm install
npm run dist        # AppImage + deb + pacman in release/
npm run check       # format, lint, typecheck, tests
```

## License

[MIT](LICENSE)
