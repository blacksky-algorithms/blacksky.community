# Testing instructions

Make sure you've copied `.env.example` to `.env.test` and provided any required
values.

Install dependencies in `/dev-env`

```
cd dev-env && pnpm i
```

## Using Maestro

1. Install Maestro by following [these instructions](https://maestro.mobile.dev/getting-started/installing-maestro). This will help us run the E2E tests.
2. You can write Maestro tests in `/__e2e__/flows/` directory by creating a new `.yml` file or by modifying an existing one.
3. You can also use [Maestro Studio](https://maestro.mobile.dev/getting-started/maestro-studio) which automatically generates commands by recording your actions on the app. Therefore, you can create realistic tests without having to manually write any code. Use the `maestro studio` command to start recording your actions.

### Running on Android

You will need to allow your device access to the port that the mock server is running on.

```
adb reverse tcp:3000 tcp:3000
adb reverse tcp:1986 tcp:1986
adb reverse tcp:8082 tcp:8082
```

### Group invite Maestro suite

The production-shaped group invite flows live in
`__e2e__/flows/group-invite/`. They reset the existing dev-env manager with a
scenario-specific local fixture and use real local feed-generator records.
Point the client at that fixture while starting Metro; the value is read by
the app at runtime and does not change the existing build commands.

```sh
EXPO_PUBLIC_ACORN_SERVICE_URL=http://localhost:1986 pnpm e2e:start
EXPO_PUBLIC_ACORN_SERVICE_URL=http://localhost:1986 pnpm e2e:run __e2e__/flows/group-invite
```

Build the E2E app once with the existing `pnpm e2e:build` command. The local
fixture checks that accept requests carry a Bearer header, but it does not
validate the production service-auth signature. A disposable real Acorn,
OpenFGA, and feed-service journey is still required for that enforcement
boundary.

### Running Maestro tests

- In one tab, run `pnpm e2e:mock-server`
- In a second tab, run `pnpm e2e:build`
- In a third tab, run `pnpm e2e:run __e2e__`

## Using Flashlight for Performance Testing

1. Make sure Maestro is installed (optional: only for automated testing) by following the instructions above
2. Install Flashlight by following [these instructions](https://docs.flashlight.dev/)
3. The simplest way to get started is by running `pnpm perf:measure` which will run a live preview of the performance test results. You can [see a demo here](https://github.com/bamlab/flashlight/assets/4534323/4038a342-f145-4c3b-8cde-17949bf52612)
4. The `pnpm perf:test:measure` will run the `scroll.yaml` test located in `__e2e__/maestro/scroll.yaml` and give the results in `.perf/results.json` which can be viewed by running `pnpm perf:results`
5. You can also run your own tests by running `pnpm perf:test <path_to_test>` where `<path_to_test>` is the path to your test file. For example, `pnpm perf:test __e2e__/maestro/scroll.yaml` will run the `scroll.yaml` test located in `__e2e__/maestro/scroll.yaml`.
