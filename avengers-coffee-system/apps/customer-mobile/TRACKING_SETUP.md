# Customer mobile: maps and tracking

- `EXPO_PUBLIC_API_URL`: gateway reachable from the phone (port 3000 locally). Use the LAN address on a device, not 127.0.0.1.
- `EXPO_PUBLIC_SOCKET_URL`: order-service origin (port 3005 locally). Otherwise the app replaces the API port with 3005.
- Web store maps use a Google Maps embed with the selected public branch name/address. No browser JavaScript Maps SDK key is needed for this embed. Directions open Google Maps.
- `EXPO_PUBLIC_VIETMAP_TILE_KEY`: existing public client tile key, matching web-customer. The browser delivery map uses Vietmap tiles; without it, it uses OpenStreetMap Deutschland tiles with attribution. These are client keys and must have provider restrictions suitable for the deployed origins/apps.
- `EXPO_PUBLIC_VIETMAP_API_KEY`: existing public client routing key. Web/native fetch actual motorcycle route geometry, distance and duration. A missing/failed route request shows a retry/empty state rather than a made-up ETA. Before pickup, the route includes driver/store/recipient when coordinates exist; after pickup, driver/recipient.
- Android standalone: set `GOOGLE_MAPS_ANDROID_API_KEY` before generating/building the app. Enable Maps SDK for Android and restrict to package `com.avengers.coffee.customer` and its signing certificate. Native store/tracking maps use react-native-maps.
- iOS uses Apple Maps without a Google Maps SDK key.
- Rebuild the native app after adding react-native-maps/expo-image; an older development build cannot load new native modules. Public environment changes also require a new export/build.

The order screen uses the existing delivery tracking REST API and `/notifications` socket namespace. It preserves successful data on network errors, reconciles through REST when the socket is silent, and releases subscriptions on screen exit/background. Missing GPS shows a waiting banner and real store/recipient points where available, without fabricating a driver location or contact.

Run `node --test tests/*.test.mjs`. On a native device, check marker movement, route refresh, reconnect, background/foreground, safe area, permission refusal and completion before release. JavaScript exports do not verify native SDK/signing configuration or device permissions. Keep secret server keys out of EXPO_PUBLIC variables and version control.
