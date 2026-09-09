# Installation

Download the latest build from [Releases](../../releases) and pick the file for
your system.

## AppImage (any distribution)

```bash
chmod +x seb-linux-*.AppImage
./seb-linux-*.AppImage --install    # registers seb:// links and .seb files
```

If it refuses to start with a FUSE error, install FUSE 2
(`sudo apt install libfuse2t64`) or run it without installing:
`./seb-linux-*.AppImage --appimage-extract-and-run`.

## .deb (Debian / Ubuntu-based)

```bash
sudo dpkg -i seb-linux-*.deb
sudo apt-get install -f     # only if dependencies are missing
```

## .pacman (CachyOS / Arch-based)

```bash
sudo pacman -U seb-linux-*.pacman
```

## Usage

```bash
seb-linux exam.seb                     # start from a file
seb-linux "sebs://school.edu/exam"     # start straight from a link
```

Or click a `seb://` link in your browser — the client opens it directly.

**Leave an exam anytime with `Ctrl+Shift+Q`.** `Ctrl+Shift+M` releases the
screen without ending the session.

## Encrypted configurations

If a configuration is password-protected, the client asks for the password on
start. For Classtime, this is the exam password you enter at the beginning.

## Automatic updates

The client checks for a new version on start, downloads it in the background, and
installs it **on quit** — never during an exam.

| Format     | Auto-update                                    |
| ---------- | ---------------------------------------------- |
| AppImage   | yes, replaces itself                           |
| `.deb`     | yes, asks for the admin password on quit       |
| `.pacman`  | no — download the new package and reinstall    |

Disable with `--no-update` or `SEB_LINUX_NO_UPDATE=1`.
