# Maintaining Tavern Desktop

The desktop repository is https://github.com/blpeters67/Tavern-Desktop. It is separate from the Tavern website/server. Normal website changes appear on reload and do **not** require a desktop release. Release the desktop when changing its window, permissions, updater, Electron runtime, or other wrapper code.

## Normal release: build automatically on GitHub
1. Make and test your changes. Update RELEASE-NOTES.md for the upcoming version, then commit the changes in this repository.
2. From a clean working tree, run:
   ```powershell
   npm version patch
   git push origin main --follow-tags
   ```
   Use `npm version minor` for a larger release. Never reuse a published version number.
3. GitHub Actions tests the updater, builds the Windows installer and checks its metadata/checksum. It uploads the build and creates a **draft release** containing the installer, its blockmap, and latest.yml.
4. Download and test the draft installer when convenient. On GitHub's Releases page, open the draft and click **Publish release**. That is the step that makes the update available to clients.

Friends do not need GitHub accounts or tokens. Their clients check on startup and every four hours, download the update and display **Restart & update**. They can request a check immediately. Restart is always their choice and ends active calls. The settings/login directory is preserved.

The workflow can also be started manually from Actions → Build desktop release → Run workflow. A manual run creates downloadable build artifacts without publishing a release.

## Build locally
```powershell
npm ci
node node_modules/electron/install.js
npm test
npm run test:updater
npm run test:app
npm run dist -- --config.electronDist=node_modules/electron/dist
npm run release:verify
```
The last command ensures latest.yml names the correct version and installer, and verifies SHA512, size and the presence of the blockmap. `npm run dist` never uploads files.

A local release must include all three files from the **same build**:
- Tavern-Setup-VERSION.exe
- Tavern-Setup-VERSION.exe.blockmap
- latest.yml

If publishing manually with GitHub CLI, create a draft and attach all three files before publishing it. Use RELEASE-NOTES.md with `--notes-file`. Tag the exact source commit used for the build. Do not replace assets on an already published release: release a higher version instead. Keep prior releases available.

## What changes for the maintainer?
- One extra release step for desktop changes: bump/tag the version, then publish the generated draft.
- No changes to Docker, the Tavern database, server uploads, or the Tavern website.
- No separate update server to operate; GitHub hosts the release files.
- Keep the repository/account accessible and the Electron/updater dependencies maintained.
- A bad desktop release is fixed by publishing a **higher** version with the correction (or reverted code). Clients deliberately refuse automatic downgrades.
- Existing 0.1.0/0.1.1 installs need one manual update to obtain this updater.

## Signing and trust
The current app is unsigned. Downloads use the fixed public GitHub release source and SHA512 verification; publisher-certificate verification is not available without a signing certificate. Windows may still warn about reputation. Never embed a GitHub token or signing private key in the app. GitHub Actions uses its temporary built-in GITHUB_TOKEN to create the draft.

If signing is added later, configure electron-builder's supported certificate mechanism in GitHub secrets and local environment variables. Keep the certificate publisher identity consistent and test an upgrade from the current unsigned version. Do not disable signature validation.

## Test boundaries
Unit tests check duplicate clicks, failure/retry handling, and that downloads cannot silently restart the app. The real updater integration test serves harmless fixture bytes from localhost, verifies the download and checksum rejection, and never launches an installer. The app smoke test exercises the trusted title-bar IPC. These checks do not replace testing an actual installed-version upgrade on Windows; the user's existing install is never overwritten by the test suite.
