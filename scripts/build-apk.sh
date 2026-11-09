#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
BUILD_DIR="/tmp/phillips-pixel10-apk-build"
SDK_DIR="${ANDROID_SDK_ROOT:-/tmp/android-sdk}"
BUILD_TOOLS_DIR="$SDK_DIR/build-tools/android-15"
PLATFORM_DIR="$SDK_DIR/platforms/android-35"

echo "==> Building Phillips WhatsApp Notifier (Google Pixel 10 Edition) APK..."

# 1. Ensure Android SDK build-tools and platform 35 are present
if [ ! -x "$BUILD_TOOLS_DIR/aapt2" ] || [ ! -f "$PLATFORM_DIR/android.jar" ]; then
  echo "==> Downloading Android SDK build-tools 35 and platform android-35..."
  mkdir -p "$SDK_DIR/build-tools" "$SDK_DIR/platforms"
  if [ ! -x "$BUILD_TOOLS_DIR/aapt2" ]; then
    curl -sL https://dl.google.com/android/repository/build-tools_r35_linux.zip -o /tmp/build-tools.zip
    unzip -q -o /tmp/build-tools.zip -d "$SDK_DIR/build-tools"
  fi
  if [ ! -f "$PLATFORM_DIR/android.jar" ]; then
    curl -sL https://dl.google.com/android/repository/platform-35_r01.zip -o /tmp/platform.zip
    unzip -q -o /tmp/platform.zip -d "$SDK_DIR/platforms"
  fi
fi

AAPT2="$BUILD_TOOLS_DIR/aapt2"
D8="$BUILD_TOOLS_DIR/d8"
ZIPALIGN="$BUILD_TOOLS_DIR/zipalign"
APKSIGNER="$BUILD_TOOLS_DIR/apksigner"
ANDROID_JAR="$PLATFORM_DIR/android.jar"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/compiled_res" \
         "$BUILD_DIR/gen" \
         "$BUILD_DIR/classes" \
         "$BUILD_DIR/dex" \
         "$BUILD_DIR/assets/public"

# 2. Bundle web application assets into APK assets/public/
cp "$ROOT_DIR/public/index.html" "$BUILD_DIR/assets/public/"
cp "$ROOT_DIR/public/styles.css" "$BUILD_DIR/assets/public/"
cp "$ROOT_DIR/public/app.js" "$BUILD_DIR/assets/public/"
cp "$ROOT_DIR/public/manifest.json" "$BUILD_DIR/assets/public/"
cp "$ROOT_DIR/public/icon-pixel10.svg" "$BUILD_DIR/assets/public/"

# 3. Compile Android resources with aapt2
echo "==> Compiling Android resources with aapt2..."
"$AAPT2" compile --dir "$ANDROID_DIR/res" -o "$BUILD_DIR/compiled_res/res.zip"

# 4. Link resources, AndroidManifest.xml, and assets into base APK
echo "==> Linking resources and AndroidManifest.xml for Google Pixel 10..."
"$AAPT2" link \
  -I "$ANDROID_JAR" \
  --manifest "$ANDROID_DIR/AndroidManifest.xml" \
  -A "$BUILD_DIR/assets" \
  --java "$BUILD_DIR/gen" \
  --min-sdk-version 26 \
  --target-sdk-version 35 \
  --version-code 100200 \
  --version-name "2.0.0-pixel10" \
  -o "$BUILD_DIR/unaligned.apk" \
  "$BUILD_DIR/compiled_res/res.zip"

# 5. Compile Java sources + generated R.java against Android 35 SDK
echo "==> Compiling Pixel 10 Java sources (MainActivity, Pixel10Bridge, WhatsAppNotificationService)..."
find "$ANDROID_DIR/src" "$BUILD_DIR/gen" -name "*.java" > "$BUILD_DIR/sources.txt"
javac \
  -source 8 \
  -target 8 \
  -encoding UTF-8 \
  -bootclasspath "$ANDROID_JAR" \
  -classpath "$ANDROID_JAR" \
  -d "$BUILD_DIR/classes" \
  @"$BUILD_DIR/sources.txt"

# 6. Convert JVM .class files to Dalvik bytecode (classes.dex) using d8
echo "==> Running d8 DEX compiler..."
CLASS_FILES=$(find "$BUILD_DIR/classes" -name "*.class")
"$D8" \
  --lib "$ANDROID_JAR" \
  --min-api 26 \
  --output "$BUILD_DIR/dex" \
  $CLASS_FILES

# 7. Package classes.dex into unaligned APK
echo "==> Packaging classes.dex into APK..."
zip -q -j "$BUILD_DIR/unaligned.apk" "$BUILD_DIR/dex/classes.dex"

# 8. Align APK on 4-byte boundaries using zipalign
echo "==> Running zipalign..."
"$ZIPALIGN" -p -f 4 "$BUILD_DIR/unaligned.apk" "$BUILD_DIR/aligned.apk"

# 9. Generate signing keystore and sign with APK Signature Scheme v1 + v2 + v3
KEYSTORE="$BUILD_DIR/pixel10-release-key.jks"
keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE" \
  -alias pixel10key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass pixel10pass \
  -keypass pixel10pass \
  -dname "CN=Phillips WhatsApp Notifier Pixel 10, OU=Mobile Engineering, O=Phillips, L=Mountain View, ST=CA, C=US" \
  >/dev/null 2>&1

FINAL_APK_ROOT="$ROOT_DIR/Phillips-WhatsApp-Notifier-Pixel10.apk"
FINAL_APK_PUBLIC="$ROOT_DIR/public/phillips-whatsapp-notifier-pixel10.apk"

echo "==> Signing APK with apksigner (v1 + v2 + v3 signatures)..."
"$APKSIGNER" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias pixel10key \
  --ks-pass pass:pixel10pass \
  --key-pass pass:pixel10pass \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$FINAL_APK_ROOT" \
  "$BUILD_DIR/aligned.apk"

cp "$FINAL_APK_ROOT" "$FINAL_APK_PUBLIC"

echo "==> Verifying APK signature and manifest badging..."
"$APKSIGNER" verify --verbose "$FINAL_APK_ROOT"
"$AAPT2" dump badging "$FINAL_APK_ROOT"

ls -lh "$FINAL_APK_ROOT" "$FINAL_APK_PUBLIC"
echo "==> Successfully built signed Pixel 10 APK: $FINAL_APK_ROOT"
