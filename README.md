# SvRvS Rythm

Music listening platform on Cloudflare Workers: lossless WAV catalogue, a browser
listener app, an admin console for the catalogue, and Android and iOS clients.

## Download

Both clients are attached to the [releases](https://github.com/SvRvS3003/rythm/releases)
page with their SHA-256:

- `SvRvS-Rythm-<version>.apk`, signed with the release key, Android 8.0 or newer.
- `SvRvS-Rythm-<version>-unsigned.ipa`, iOS 26 or newer, signed with your own
  Apple ID before installing (Sideloadly, AltStore, ESign).

The web client hides every install and download link once it runs inside an
installed app, on the sign-in screen as well as in the pages behind it.

## What it does

- Catalogue of tracks, artists, albums and genres, stored in D1 with audio and
  covers in R2, served as ordinary HTTP with range requests.
- Listener app: queue, shuffle, repeat, playlists, likes, search, library,
  resume-on-open, home with promoted tracks and ads.
- Offline listening: downloaded tracks are stored encrypted on the device and
  unlocked with a device key, capped per plan.
- Beat maps: the Worker analyses each upload and stores per-second rhythm data;
  the client drives its backdrop, logo and row bars from the real bands.
- Duplicate detection: audio fingerprinting on upload marks tracks that already
  exist in the catalogue.
- Accounts: password auth with PBKDF2, sessions, family plans, payment plans
  (Click), admin roles.
- Notifications: Web Push with VAPID, scheduled notices, reminders, an admin
  sender, and a background check in the Android app.
- API access: admin API keys and per-listener tokens issued through a consent
  page, so scripts and third-party apps can call the API.

## Stack

- Cloudflare Workers, D1, R2, Cron Triggers, Workers Email.
- TypeScript everywhere. The client uses no framework: a small `h()` DOM builder,
  WebGL for the sea and nebula backdrops, a service worker for the app shell and
  offline media.
- esbuild bundles `client/` into `dist/web`, which the Worker serves as assets.
- Android: a WebView shell with a media `PlaybackService`, a polling job and an
  in-app updater. iOS: a native SwiftUI app in `ios/`.

## Layout

```
src/            Worker: API routes, media, auth, mail, push
client/         listener app, admin console, service worker, WebGL backdrops
web/            static shell: index.html, styles.css, icons, headers
migrations/     D1 schema, applied in order
scripts/        build, icons, rhythm backfill, APK build, CI gate
test/           unit tests and integration suites
android/        WebView app (Gradle)
ios/            SwiftUI app (Xcode)
```

## Local development

```sh
npm install
npm run dev          # applies migrations locally, starts wrangler on :8787
npm run typecheck
npm test             # unit tests, no network or browser needed
```

Secrets live in `.dev.vars` for local runs and in Worker secrets for production.
It is not committed.

| Name | Purpose |
| --- | --- |
| `ADMIN_LOGIN` | admin username |
| `ADMIN_PASSWORD` | admin password |
| `SIGNING_SECRET` | HMAC key for sessions and links |
| `VAPID_JWK` | private key for Web Push |

Bindings are declared in `wrangler.jsonc`: `DB` (D1), `BUCKET` (R2), `ASSETS`,
`EMAIL`. A fork has to create its own database and bucket and replace the ids,
the bucket name and the routes in that file.

```sh
npx wrangler d1 migrations apply rythm --remote
npm run deploy
```

Integration suites start a local worker and drive it over HTTP, some of them with
a real browser. `zsh scripts/ci.sh` runs the whole gate.

## Android

```sh
zsh scripts/build-apk.sh https://your.host 8 1.0.8
```

The release keystore and `keystore.properties` are generated on first run and are
gitignored. Keep them: every future update must be signed with the same key.

## iOS

The app needs iOS 26 or newer and Xcode 26. It is a native SwiftUI client, signed
like any other iOS app.

Signing lives in one place. `ios/Config/Signing.xcconfig` sets
`CODE_SIGN_STYLE = Automatic` and reads the team from
`RYTHM_DEVELOPMENT_TEAM`, so the project itself stays free of any account:

```sh
cp ios/Config/Signing.xcconfig ios/Config/Local.xcconfig
```

Put your team id in `ios/Config/Local.xcconfig`. That file is gitignored, so a
fork never publishes someone else's team. In Xcode you can also pick the team
under Signing & Capabilities; the bundle id `uz.svrvs.rythm.ios` has to be unique
in your account, so change it if the id is taken.

```sh
zsh scripts/build-ios.sh signed      # archive and export, needs TEAM_ID
METHOD=ad-hoc TEAM_ID=XXXXXXXXXX zsh scripts/build-ios.sh signed
zsh scripts/build-ios.sh archive     # archive only, open it in Organizer
zsh scripts/build-ios.sh unsigned    # device build without any certificate
zsh scripts/build-ios.sh simulator   # simulator build
```

`signed` archives with automatic signing and lets Xcode create the profile from
your account, then exports an IPA to `dist/`. `unsigned` compiles for a device
with no certificate at all and writes
`dist/SvRvS-Rythm-<version>-unsigned.ipa`: that is the file to hand to Sideloadly,
AltStore or ESign, which sign it with your own Apple ID and install it over the
cable or over Wi-Fi.

The icon set is compiled by the script itself, so an unsigned build does not
depend on a simulator runtime being installed.

## Package

The source tree is also published to GitHub Packages as `@svrvs3003/rythm`, so a
fork can pin it as a dependency of its own tooling:

```sh
npm login --scope=@svrvs3003 --registry=https://npm.pkg.github.com
npm install @svrvs3003/rythm --registry=https://npm.pkg.github.com
```

Authentication is required by the registry even for public packages: a token with
`read:packages` is enough.

## License

MIT, see `LICENSE`.
