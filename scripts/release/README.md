# Weekly QA releases

The weekly train freezes a passing main SHA onto one `release/YYYY-MM-DD-N` branch. Main remains open for next week's development; staging follows the QA candidate only. Nothing deploys until `RELEASE_TRAIN_ENABLED=true` is configured.

## Workflows

- `release-weekly.yml`: Monday 14:17 UTC, or manual `cut` with an optional full main SHA. If a release branch exists, it leaves that train in QA. Otherwise it selects the current main head and requires its configured checks to have succeeded; it never silently picks an older commit. Release-branch pushes or manual `prepare` run reusable lint/Go checks, publish one candidate OTA branch, build one DOCR image, and build both store binaries only when native inputs changed. The final job deploys staging, hashes the OTA bytes actually served to QA, saves the manifest and native artifacts to a draft GitHub release, and requests production approval.
- `release-promote.yml`: presents the exact candidate for one GitHub `production` environment approval. The publishing job itself is gated; it rechecks branch head, the current candidate pointer, configuration, staging image identity and OTA bytes, then promotes the recorded artifacts and publishes the GitHub release. It deletes the release branch on success. QA and production use separate concurrency groups so an approval wait cannot block QA fixes. There are no separate approval receipts or resume operations.
- `build-submit-ios.yml` / `build-submit-android.yml`: reusable native QA builders, also manually dispatchable for a dedicated `release-qa` installation. EAS builds locally on GitHub runners, allocates remote build numbers, and submits to TestFlight / Play internal testing. The workflows record actual binary identity and checksums; production does not rebuild.
- `lint.yml` / `golang-test-lint.yml`: continue checking PRs and main; the release workflow calls them once with the candidate SHA before building it.

## QA and fixes

1. Install the dedicated `release-qa` app for the current runtime; keep it for ordinary OTA QA. For a native train, also test the exact production-profile TestFlight and Play internal binaries. These use an unpublished runtime and initially run their embedded bundle, so the tested binary can ship unchanged. Dedicated QA installs exercise subsequent OTA updates.
2. Test the candidate on iOS, Android and staging using the draft release checklist. Compare its commit identity with the app and staging `/_release` response.
3. Squash-merge QA fix PRs into the release branch. Each push automatically prepares a replacement candidate; previous approval requests fail their head/pointer checks. Forward-port PRs to main are opened automatically, in merge order, and require normal CI/review. Conflicts, non-squash merges, and forward-ports closed without merging fail visibly and require manual repair.
4. Approve the matching pending `production` job once QA passes, then hold further QA merges until publishing finishes. OTA and web use the same approved SHA. Native releases request distribution of the recorded binaries; app-store processing and client OTA adoption are asynchronous, so this is coordinated artifact selection, not an atomic switch on every device.

Expo fingerprints detect native inputs for both platforms, excluding version/build-number changes. Local modules, plugin templates and assets are explicit fingerprint inputs because custom config plugins copy files that Expo cannot discover automatically; asset changes conservatively require a binary. A native train bumps the app/runtime version before QA; OTA trains retain the last shipped native runtime. The latest published manifest supplies the next baseline, so main does not need release metadata or a version-only merge-back. Changes to credentials or build-environment configuration outside git require an explicitly forced native cut.

## Native store preparation

Before approving a native train for the App Store, select its exact recorded iOS build in App Store Connect, complete metadata/review, and leave it in **Pending Developer Release**. Fastlane checks that exact version/build before releasing it. For public TestFlight distribution, configure the group and complete any required beta review before approval.

Android is uploaded to internal testing during QA, then Fastlane promotes the recorded version code to production after approval. Resolve any Play review, policy, or managed-publishing requirements in the console; the workflow does not poll or automate that process. Do not approve if store preparation is incomplete. Check storefront/device availability after native releases. There is no custom store-review queue, readiness-link receipt, or automatic recovery from a partially completed native release.

## Activation

Complete configuration and a supervised rehearsal before enabling the schedule:

- Repository variable `RELEASE_TRAIN_ENABLED`: initially `false`.
- `RELEASE_REQUIRED_CHECKS`: JSON array of stable, mandatory GitHub Actions check names on main, e.g. `["Run linters","Run tests","Release controller tests","build-and-test","lint"]`. Optional/path-filtered checks must not be listed: missing, skipped, cancelled, or failed required checks block the cut.
- `RELEASE_NATIVE_BASELINE`: initial production baseline JSON `{"sha":"<full SHA>","runtimeVersion":"1.2.3","fingerprint":"<hash>"}`. In a disposable checkout of the installed production binary's source, using the same pinned Linux/Node/pnpm toolchain as selection, install dependencies and run `node scripts/release/build.mjs fingerprint`; it prints that baseline JSON. Use the current fingerprint helper when measuring a source revision from before these workflows existed. Later baselines come from published manifests.
- `RELEASE_IMAGE_REPOSITORY`: full `registry.digitalocean.com/<registry>/<repository>`.
- `RELEASE_STAGING_TARGETS` / `RELEASE_PRODUCTION_TARGETS`: JSON arrays listing every web surface. They must have distinct components and HTTPS origins. Example App Platform target: `{"kind":"app","name":"web","appId":"<id>","component":"web","urls":["https://example.com"]}`. Example Kubernetes target: `{"kind":"kubernetes","name":"acorn-web","namespace":"<namespace>","deployment":"<deployment>","container":"<container>","urls":["https://community.example"]}`. Include Acorn when it is an active web target; both deploy workflows install kubectl when configured.
- `RELEASE_OTA_URL`: self-hosted expo-open-ota URL. Create `release-qa` and `production` channels in that server. The pipeline uses its channel-mapping API, not EAS-hosted Update.
- `RELEASE_IOS_DESTINATION`: `app-store` or `testflight`; `RELEASE_APP_IDENTIFIER`, `ASC_APP_ID`, `RELEASE_QA_TESTFLIGHT_GROUP`, and (for public TestFlight) `RELEASE_PUBLIC_TESTFLIGHT_GROUP`.
- `RELEASE_BOT_TOKEN`: fine-grained repository bot token able to create release branches/PRs/releases and read CI checks/environment settings. It must trigger workflows when pushing branches. Configure Actions permissions to allow the final QA job to dispatch `release-promote.yml` using its GitHub token.
- Environment **`release-build`**: build/OTA/staging credentials (`EXPO_TOKEN`, `DIGITALOCEAN_ACCESS_TOKEN`, optional `RELEASE_KUBECONFIG`), existing client build variables/secrets, and Apple API credentials for QA grouping. Configure EAS signing and the `release-qa` submit profile for the correct app and internal tracks. Initialize EAS remote build numbers above all previously uploaded store builds.
- Environment **`production`**: required human reviewers and production credentials (`EXPO_TOKEN`, `DIGITALOCEAN_ACCESS_TOKEN`, optional `RELEASE_KUBECONFIG`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, `GPLAY_SERVICE_ACCOUNT_JSON`). Restrict deployment branches to main. Publishing runs here directly; there is no `release-publishing` environment.
- Protect main and release branches, require squash merges for QA fixes, and restrict release-branch writes to trusted maintainers/bot. Promotion checks out main; reusable QA build/check workflows must be present at the selected commit.
- Bootstrap web images with the `/_release` endpoint and disable other image autodeploy mechanisms. Verify all configured staging and production targets, credentials, QA installs, initial runtime/fingerprint, and store destinations before activation.

The old nightly native builds, main-following staging deployment, ad-hoc `testflight` OTA workflow and universal APK output are not part of the train. Existing `testflight`-channel installs need a dedicated QA install; updates to older runtimes and signed sideload APKs remain manual operations.

## Failures and manual recovery

Before production starts, re-run all QA jobs or dispatch `prepare` to create a fresh candidate, then repeat affected QA and approve that candidate. Cancel obsolete pending approval runs. A failed forward-port must be resolved on main before dependent fixes. To abandon a train, cancel its runs and delete its release branch/draft manually.

If promotion fails after any production change, stop and inspect the stores, OTA channel and every web target. Do not assume re-running the workflow is safe or that rollback covers native binaries. Reconcile the release manually, including GitHub release/tag/branch cleanup, before starting another train.

For OTA/web rollback, cancel active release runs, choose the previous published manifest, manually repoint the production OTA channel to its recorded branch ID and restore each web target to its recorded DOCR digest. Verify served OTA bytes, web `/_release` and health, and confirm native runtime compatibility. Post-map OTA verification waits up to 90 seconds for the server channel cache to converge; a persistent mismatch still fails. Store rollout intervention or a new native build is manual. There is no automatic rollback or recovery controller.
