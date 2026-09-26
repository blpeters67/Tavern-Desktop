# Tavern Desktop
A dedicated Windows app for [Tavern](https://github.com/blpeters67/Tavern), the self-hosted roleplaying chat. It opens an existing Tavern website in a sandboxed Electron window, with a matching title bar and an in-app update button. The server stays a separate project.

**[Download the latest Windows installer](https://github.com/blpeters67/Tavern-Desktop/releases/latest)** · [Maintainer release guide](RELEASING.md) · [Developer/LLM handoff](handoff.txt)

The default address is https://tavern.benjis.site/. You can change it in the app. You need access to a running Tavern server and a Tavern account; this app does not bundle or start a server.

## Use
Download `Tavern-Setup-VERSION.exe` from Releases (or build it locally into `dist`), then open **Tavern** from your desktop or Start menu. Sign in using your existing Tavern account. The desktop app keeps its own login cookies, separate from your regular browser.

Click **Tavern ⌄** in the navy-and-gold title bar (or press **Alt**) to open the menu. **Tavern → Tavern Address** changes the website. **Ctrl+R** reloads, **F11** toggles fullscreen, and **Ctrl+Q** quits. Closing the window quits and ends calls; there is no hidden tray process.

If the server is unavailable, use **Try Again**. Your server must remain running and reachable. Normal website updates appear on reload; desktop/Electron updates arrive through the update button.

## Updating
Version 0.1.2 adds background update checks on startup and every four hours. You can also click **Check updates** in the title bar. Updates download from [Tavern-Desktop releases](https://github.com/blpeters67/Tavern-Desktop/releases); when verified, the button turns gold and says **Restart & update**. One click closes Tavern, installs the downloaded version, and reopens it. This ends active calls. The app never restarts itself just because an update is available or because you quit normally.

Versions 0.1.0 and 0.1.1 need one manual installation of 0.1.2 or newer to gain the button. Close Tavern, run the installer and keep the same installation folder. No uninstall is needed. Login, server address and settings remain in userData.

Maintainer instructions are in [RELEASING.md](RELEASING.md). Only published stable releases reach clients; drafts and prereleases do not.

## Camera / microphone troubleshooting
Use **Help → Check Camera and Microphone** from the Tavern title-bar menu. It checks the live Tavern page's access to each device, briefly opens and immediately stops each one, and shows the exact errors with a **Copy Results** button. Nothing is recorded or sent to another player. Allow the app's permission prompts.
Successful checks confirm access to the devices; they do not prove that a peer-to-peer call can reach another player. If access works but calls do not, check mute/deafen, selected devices in Tavern, and call/network diagnostics.

## Included
- Tavern navy-and-gold title bar, branded menu, and native minimize/maximize/close controls.
- Persistent sign-in, saved window size, zoom/fullscreen, editing shortcuts and spellcheck.
- Offline recovery and configurable server address.
- Microphone/camera prompts restricted to your Tavern origin (remembered for this app session).
- Screen/window selection for screen sharing, with optional Windows computer audio.
- Native upload dialogs and Save As downloads.
- External HTTP(S) links open in your browser after confirmation.
- One application instance.
- Sandboxed website renderer, no Node integration or desktop IPC exposed to the website.

## Limits / things to test with your group
Version 0.1.1 fixes the screen-picker permission rejection present in 0.1.0. Local checks cover real microphone/camera access on the development PC, a native test-window capture, fake-device WebRTC audio/video transport, cancellation, playback, window layout, isolation and recovery. Multi-person calls across different networks, screen-sharing system audio, and picture-in-picture still need real-session verification. Jukebox and Theater were reported working by the user. No push notification service, global push-to-talk shortcut, or Android app is included. Website features that rely on unusual popup or picture-in-picture behavior may differ from Chrome. The wrapper does not add notification features the website doesn't already implement.

The installer is unsigned; no code-signing certificate is configured. Updates use HTTPS and SHA512 integrity checks. With no configured publisher certificate, Authenticode publisher verification is unavailable; protect the GitHub account that controls releases. Windows may still show a reputation warning. Keep the Electron runtime updated when rebuilding.

## Development
Node.js 22+ on Windows:
```powershell
npm ci
npm run assets
npm start
npm test
npm run test:app
npm run test:updater
npm run dist
npm run release:verify
```
`npm run test:app` opens hidden Electron windows against an isolated local fixture and uses simulated microphone/camera devices; it never signs into the live Tavern site. Screen-capture tests select only a generated test window, never personal screen content. `npm run test:app -- --real-devices` briefly checks real microphone/camera access without recording or transmitting. It writes disposable profiles in `.test-profile`. Policy tests exercise origin/permission checks. Build outputs go in `dist`; `dist/win-unpacked/Tavern.exe` can also run without installation if the entire win-unpacked folder is kept together.

Normal desktop settings, cookies and cache are stored under Electron's userData directory (normally `%APPDATA%/Tavern`), not in the server's data directory. No server credentials are bundled.

## Files
- `src/main.cjs`: window/session lifecycle, permissions, navigation, capture picker, menu, fixture smoke test.
- `src/window-chrome.cjs`, `src/chrome-preload.cjs`, `src/local/chrome.*`: isolated desktop title bar and content layout.
- `src/update-controller.cjs`: background download and explicit restart state; the website cannot access it.
- `scripts/updater-test.cjs`, `src/updater-smoke.cjs`: real local-feed download/checksum tests that never execute an installer.
- `.github/workflows/release.yml`: tagged Windows builds and draft GitHub releases.
- `src/device-check.cjs`: live-page microphone/camera diagnostic.
- `src/media-smoke.cjs`, `src/loopback-check.cjs`: capture and local WebRTC integration tests.
- `src/policy.cjs`: tested URL and permission rules.
- `src/preload.cjs`: minimal bridge used only by local settings/offline/capture pages.
- `src/local/`: offline/settings page and screen chooser.
- `assets/tavern.svg`: copy of Tavern's existing favicon; generated PNG/ICO siblings.
- `scripts/build-icon.cjs`: generates the Windows icon.
- `tests/policy.test.cjs`: policy regression tests.
## License
[PolyForm Noncommercial License 1.0.0](LICENSE.md), the same license used by Tavern. Required Notice: Copyright 2026 Benji. The license is included with the installed app as `LICENSE-Tavern.md`. Third-party components retain their own licenses.
