# Weekly QA releases

The train is disabled unless `RELEASE_TRAIN_ENABLED=true`. Merging these workflows does not configure credentials, approve a release, or activate the schedule.

## Workflows

- `release-weekly.yml` cuts one release branch on Mondays at 14:17 UTC (10:17 EDT / 09:17 EST), or on manual `cut`. It chooses the current passing main SHA, or an explicitly supplied passing main ancestor, and keeps an unresolved train instead of cutting another.
- Pushes to the release branch prepare its exact head for QA: CI, an immutable OTA branch, a web image, and native binaries when required. Staging follows this candidate; main remains free for next week's features.
- `build-submit-ios.yml` and `build-submit-android.yml` build the specified SHA and upload to TestFlight QA / Play internal testing. Native versions, build numbers, app identifiers, and binary checksums are recorded before approval.
- `release-promote.yml` requests one `production` environment approval covering the manifest's mobile artifacts and web image. It rechecks the latest candidate, hashes the actual OTA assets, promotes the recorded image digest, and verifies the production channel and live web identity.

Native candidates include an OTA bundle for their new runtime. This gives the next OTA release a tested rollback target; promotion never rebuilds a bundle or binary.

## One-time setup

Keep the train disabled until the initial production baseline and a complete QA rehearsal are verified.

1. Protect main and `release/**` with required CI and human review. Require squash merges for QA fixes; protect `.release/train.json` from manual edits and prohibit force pushes to release branches. Limit workflow edits and release credentials to trusted maintainers.
2. Create GitHub environments: `production` with required human reviewers; `release-build` for trusted main/release branch builds; and `release-publishing`, restricted to main, for production credentials. `release-publishing` has no second reviewer gate because the controller checks the saved manifest-specific approval.
3. Configure `RELEASE_BOT_TOKEN` as a repository secret with repository contents, workflows/actions, pull requests, deployments, and environment-read access. Use a dedicated bot token that triggers subsequent push workflows; the default `GITHUB_TOKEN` cannot replace it for release cuts and forward-port pushes.
4. Create OTA channels `release-qa` and `production`. Configure the existing self-hosted OTA server and app update URL consistently, with production signing and same-origin HTTPS manifest/assets access.
5. Bootstrap production with a digest-pinned image exposing `/_release`, and an immutable OTA branch containing exactly one iOS and one Android update for that same SHA/runtime. The controller refuses to promote without this rollback baseline.
6. Install a `release-qa` profile build on the QA devices for OTA testing. After a native-runtime change, update the QA installation to that runtime as well as testing the exact production-profile binaries in the store QA tracks; a QA-profile binary is never promoted to production.
7. Configure existing EAS signing/submission credentials, complete store listings/compliance, and create the QA TestFlight group. Verify native uploads, OTA signing, staging identity, approval, and rollback with the configured services before enabling the schedule.

Repository variables:

| Variable | Value |
| --- | --- |
| `RELEASE_TRAIN_ENABLED` | `false` until activation is approved |
| `RELEASE_REQUIRED_CHECKS` | JSON array of exact successful check names, e.g. `["Run linters","Run tests","Release controller tests","build-and-test","lint"]`; use checks that run on main and release branches |
| `RELEASE_NATIVE_BASELINE` | Initial installed runtime and native-source SHA: `{"sha":"<40-character SHA>","runtimeVersion":"1.2.3"}`; later releases use the recorded published baseline |
| `RELEASE_BUILD_NUMBER_BASE` | Integer offset above every previously uploaded iOS/Android build number; the workflow adds `run_number * 100 + run_attempt` |
| `RELEASE_IMAGE_REPOSITORY` | Full DOCR repository without a tag |
| `RELEASE_STAGING_TARGETS`, `RELEASE_PRODUCTION_TARGETS` | JSON arrays listing every deployment target (examples below) |
| `RELEASE_OTA_URL` | HTTPS OTA origin or manifest URL matching the app's configured update server |
| `ASC_APP_ID` | App Store Connect numeric app ID; must match `eas.json`'s `release-qa` submission profile |
| `RELEASE_APP_IDENTIFIER` | Installed iOS bundle ID / Android package name |
| `RELEASE_IOS_DESTINATION` | `app-store` or `testflight` |
| `RELEASE_QA_TESTFLIGHT_GROUP` | QA tester group |
| `RELEASE_PUBLIC_TESTFLIGHT_GROUP` | Public group, required for `testflight` destination |

Example target arrays (use real approved values):

```json
[{"kind":"app","name":"web","appId":"<app-id>","component":"web","urls":["https://example.com"]}]
```

```json
[{"kind":"kubernetes","name":"web","namespace":"<namespace>","deployment":"<deployment>","container":"<container>","urls":["https://example.com"]}]
```

Target names must be unique. Include every public hostname requiring verification. Use separate staging and production targets, with image autodeploy disabled so only an approved digest changes production.

`release-build` secrets: `EXPO_TOKEN`, `DIGITALOCEAN_ACCESS_TOKEN`, existing build environment/signing values (`ENV_TOKEN`, `GOOGLE_SERVICES_TOKEN`, Sentry and other application variables referenced in the YAML), plus `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`. Add staging-scoped `RELEASE_KUBECONFIG` when Kubernetes targets are configured; the runner needs `kubectl`.

`release-publishing` secrets: `EXPO_TOKEN`, `DIGITALOCEAN_ACCESS_TOKEN`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, `GPLAY_SERVICE_ACCOUNT_JSON`, and production-scoped `RELEASE_KUBECONFIG` when needed. Store credentials must be able to act on the configured app; do not put secrets in target JSON or candidate manifests.

## QA fixes and approval

Open fix PRs against the active release branch and squash-merge them. Each resulting push prepares a replacement QA candidate and creates forward-port PRs to main for merged fixes; review and merge those PRs normally, resolving conflicts before dependent fixes. Do not merge the entire release branch back to main: its train metadata and runtime bookkeeping stay on the release branch.

The QA release page lists the SHA, runtime, notes, checklist, staging URLs, and manifest hash. Approve the pending `production` environment job only after checking mobile and web together. New QA artifacts invalidate previous approval requests even if their source SHA is unchanged.

For native releases, the approved workflow submits existing builds and holds web until store readiness. Resume `release-promote.yml` on main with the same release ID, asset name and hash, operation `finish-native`, and an HTTPS storefront/device verification evidence link. The original approval is reused; iOS release processing may require another resume. Store review/availability and device update adoption are asynchronous, so one approval does not imply simultaneous availability on all devices. Keep cross-version behavior compatible during rollout.

## Recovery

- Failed cut after branch creation: manually run `release-weekly.yml` with `operation=prepare` and the active branch. Train metadata and runtime are committed together before the branch exists, and preparation recreates a missing draft QA record.
- Failed native preparation: use **Re-run all jobs** or dispatch a new `prepare` run, which allocates a fresh build number. Re-running only failed jobs is rejected when it would reuse an earlier native number. Manual bootstrap builds require an explicitly unused number.
- Failed promotion: rerun the promotion workflow for the same manifest. Per-store and per-target receipts preserve completed work; store reconciliation handles success followed by a lost receipt. If QA changed, prepare and approve its replacement instead.
- Failed forward-port PR creation: the next release-branch push reconciles merged fixes and reuses the already-pushed patch branch. For a conflict, manually cherry-pick the indicated fix to main and resolve it before subsequent dependent fixes; close the corresponding forward-port PR when superseded manually.
- OTA/web rollback: dispatch `release-promote.yml` with `operation=rollback` and the affected manifest identity, then approve. It restores the prior recorded image and OTA artifacts, including after partial promotion, without requiring staging to still run the old candidate. It refuses unrelated production drift or a newer promotion. Keep the old OTA branch/assets and DOCR digest available.
- Native rollback requires store intervention or a replacement binary. The automated rollback operation deliberately refuses native candidates.
- After an unpublished candidate is rolled back, prepare a replacement and approve it again. Do not delete receipt records or mutate candidate assets to reuse an approval.

All automation runs in GitHub runners and the existing build/update/store services. Human work is QA, one release approval, store readiness confirmation when needed, conflict resolution, and exceptional recovery; no laptop daemon is required.

## Local checks

```sh
node --test scripts/release/*.test.mjs
pnpm exec prettier --check scripts/release/*.mjs app.config.js
ruby -c fastlane/Fastfile
actionlint .github/workflows/release-weekly.yml .github/workflows/release-promote.yml .github/workflows/build-submit-ios.yml .github/workflows/build-submit-android.yml
```

The controller tests exercise simulated service responses and failures. They do not replace signed device builds or a configured staging/store rehearsal.
