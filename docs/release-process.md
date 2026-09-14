# QA release process

## Cut

Run the **Cut QA release branch** workflow with a full commit SHA from main. It creates
`release/YYYY-MM-DD` and starts a QA publish: an OTA update to the `testflight` channel, or
TestFlight / Play internal builds automatically when native code changed since the last build.

## QA

Existing TestFlight and Play internal installs (the `testflight` update channel) receive the
candidate. Merge fixes into the release branch; every push publishes a fresh QA OTA update
automatically. Cherry-pick fixes back to main through normal review.

## Promote

Run the **Promote release to production** workflow *on the release branch* and paste the release
description. It builds production binaries from the branch head, submits iOS for App Store review
with automatic release, releases Android to Play production, publishes the same JS to the
`production` OTA channel, and records a GitHub release (`v<version>`) with your notes.

App review timing is Apple's; the Play release and OTA update go live immediately. Delete the
release branch whenever the train is done.

## Notes

- Bump `package.json` version on main before cutting when a release should be a new store version;
  build numbers auto-increment via EAS.
- Play Store descriptions are limited to 500 characters.
- One-time setup: `GPLAY_SERVICE_ACCOUNT_JSON` repository secret (the Play service-account key
  already used by EAS submit). All other credentials are the existing build secrets.
