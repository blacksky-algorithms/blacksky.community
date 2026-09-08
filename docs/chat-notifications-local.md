# Local chat notification testing

Run Courier locally behind a public HTTPS tunnel so the authorization server can fetch its metadata and JWKS and the browser can reach its callback. Use an isolated Courier database. Configure its normal relay environment variables with that public origin.

For browser testing, add these origins to Courier's configuration:

```dotenv
NODE_ENV=development
CHAT_RELAY_DEV_ORIGINS=http://127.0.0.1:19007,http://localhost:19007
CHAT_RELAY_RETURN_ORIGINS=http://127.0.0.1:19007,http://localhost:19007,community.blacksky:/messages/settings
```

Start the client with the existing web development command:

```sh
EXPO_PUBLIC_CHAT_RELAY_ENABLED=true \
EXPO_PUBLIC_CHAT_RELAY_DEV_URL=https://your-courier.example \
pnpm web --localhost --port 8081
```

Metro uses port 8081; accept the available web port offered by Expo (19007 in this example). Match Courier’s allowed origins to that web port.

Open `http://127.0.0.1:19007/messages/settings` on the computer running the client. Use `127.0.0.1` consistently: the client's existing loopback sign-in flow returns to that origin. Sign in, enable chat notifications, approve access, and confirm that the browser returns to Chat Settings. Test message/request preferences, reconnect, and disconnect there. A device token is not needed for these controls; receiving actual pushes requires a registered test device and matching provider credentials.

The development override gets a short-lived service-auth token from the signed-in account's PDS for each Courier method. It sends that token directly to the configured Courier origin. It does not send the client's login token, refresh token, or a Courier API key to that origin. The override applies only to the chat relay methods and is ignored when `__DEV__` is false. HTTPS is required except for loopback HTTP endpoints. Other community requests keep their usual PDS proxy route.

Leave the override unset for normal `#chatNotif` service discovery. Courier's development CORS origins are disabled in production. This local path tests authentication, settings, and consent without editing the public AppView DID document; it does not validate public service discovery itself.
