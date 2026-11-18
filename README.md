# SvRvS Rythm

Music listening platform on Cloudflare Workers: lossless WAV catalogue, a browser
listener app, an admin console for the catalogue, and Android and iOS clients.

## Download

Android builds are attached to the [releases](https://github.com/SvRvS3003/rythm/releases)
page. Each release carries the signed APK and its SHA-256. The iOS app is built
from source, see below.

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
zsh scripts/build-apk.sh https://your.host 7 1.0.7
```

The release keystore and `keystore.properties` are generated on first run and are
gitignored. Keep them: every future update must be signed with the same key.

## iOS

Open `ios/SvRvSRythm.xcodeproj`, set the host in the app settings, build to a
device or simulator.

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
