# OMEGA Android Runtime

This directory is the native Android application layer for the OMEGA web/runtime engine.

## Architecture

Android APK
-> native Activity
-> AndroidX WebView / WebViewAssetLoader
-> bundled OMEGA HTML/CSS/JavaScript/JSON/assets
-> existing OMEGA simulation and AI runtime

The APK does not embed the Node/Express server or a Gemini API key.

## Build configuration

- Android Gradle Plugin: 9.4.0
- Gradle: 9.6.x
- JDK: 17
- compileSdk: 36
- targetSdk: 35
- minSdk: 24
- AndroidX WebKit: 1.17.1

The repository uses a build-time Sync task to copy the root web runtime into the APK asset set.

## Offline behavior

The Android shell serves the game locally through:

`https://appassets.androidplatform.net/assets/index.html`

Known external visual/library dependencies are intercepted in the native WebView client while the local app is running. The local OMEGA data and JavaScript runtime remain available without a Node server.

The current application therefore has an Android-installed, offline-capable core runtime. Remote Gemini access is intentionally not embedded into the APK. Online AI remains a separate gateway concern.

## Important build note

This repository environment did not contain a complete Android SDK/Gradle installation, so an APK build was not executed here. The Android project files are added, but the final binary build still requires an Android build environment and should be verified with Android Studio/Gradle.

## Android 9 WebView performance qualification

The dedicated `.github/workflows/omega-android-webview-performance.yml` workflow runs the packaged APK on an API 28 (Android 9) x86_64 emulator. It executes an instrumented National Accounts workload inside the real Android WebView rather than Node's browser mock.

The benchmark checks:

- A maximum dirty-country source window of 8,692 rows.
- Cooperative browser yields between 512-row inventory and production slices.
- The 4 ms maximum synchronous accounting-segment target.
- The 100 ms renderer animation-frame-gap guard.
- Zero-row unchanged-turn checkpoints.
- Country invalidation and refresh after an authoritative resource-economy event.

The workflow stores Gradle instrumentation reports and Android WebView logcat diagnostics as artifacts. Emulator results are Android 9 WebView evidence; they are not a substitute for a physical low-end ARM device benchmark. A physical-device result must identify the device, Android System WebView version, memory state and measured frame/synchronous-slice timings.
