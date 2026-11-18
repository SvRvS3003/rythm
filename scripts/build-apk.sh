#!/bin/zsh

set -e
cd "$(dirname "$0")/../android"
BASE=${1:?baseUrl}; CODE=${2:?versionCode}; NAME=${3:?versionName}
export JAVA_HOME="$HOME/.local/jdk21/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk"
echo "sdk.dir=$ANDROID_HOME" > local.properties

if [ ! -f release.keystore ]; then
  PW=$(openssl rand -hex 24)
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore release.keystore -alias rythm -keyalg RSA -keysize 4096 -validity 36500 -storepass "$PW" -keypass "$PW" -dname "CN=SvRvS Rythm" >/dev/null 2>&1
  printf 'storeFile=release.keystore\nstorePassword=%s\nkeyAlias=rythm\nkeyPassword=%s\n' "$PW" "$PW" > keystore.properties
  chmod 600 release.keystore keystore.properties
fi
./gradlew -q assembleRelease -PbaseUrl="$BASE" -PversionCode="$CODE" -PversionName="$NAME"
mkdir -p ../dist
cp app/build/outputs/apk/release/app-release.apk "../dist/SvRvS-Rythm-$NAME.apk"
ls -la "../dist/SvRvS-Rythm-$NAME.apk"
