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
