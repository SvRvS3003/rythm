#!/bin/zsh
set -euo pipefail

cd "${0:a:h}/.."
ROOT="$PWD"
MODE="${1:-unsigned}"
METHOD="${METHOD:-development}"
TEAM="${TEAM_ID:-}"
PROJECT=ios/SvRvSRythm.xcodeproj
SCHEME=SvRvSRythm
BUILD=build/ios
VERSION=$(sed -n 's/.*MARKETING_VERSION = \([^;]*\);.*/\1/p' "$PROJECT/project.pbxproj" | head -1)
DEPLOYMENT=$(sed -n 's/.*IPHONEOS_DEPLOYMENT_TARGET = \([^;]*\);.*/\1/p' "$PROJECT/project.pbxproj" | head -1)

if [[ -z "$TEAM" && -f ios/Config/Local.xcconfig ]]; then
  TEAM=$(sed -n 's/^ *RYTHM_DEVELOPMENT_TEAM *= *\([A-Za-z0-9]*\).*/\1/p' ios/Config/Local.xcconfig | head -1)
fi

mkdir -p dist

case "$MODE" in
  simulator)
    xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Debug -sdk iphonesimulator \
      -destination 'generic/platform=iOS Simulator' -derivedDataPath "$BUILD" build
    ;;
  unsigned)
    xcodebuild -project "$PROJECT" -target SvRvSRythm -configuration Release -sdk iphoneos -arch arm64 \
      SYMROOT="$ROOT/build/ios/out" SUPPORTED_PLATFORMS=iphoneos ASSETCATALOG_COMPILER_APPICON_NAME= \
      CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" CODE_SIGN_ENTITLEMENTS="" build
    APP="$ROOT/build/ios/out/Release-iphoneos/SvRvSRythm.app"
    ICONS="$ROOT/build/ios/icons"
    rm -rf "$ICONS"
    mkdir -p "$ICONS"
    xcrun actool "$ROOT/ios/SvRvSRythm/Assets.xcassets" --compile "$ICONS" --platform iphoneos \
      --minimum-deployment-target "$DEPLOYMENT" --target-device iphone --target-device ipad \
      --app-icon AppIcon --output-partial-info-plist "$ICONS/partial.plist" > /dev/null 2>&1 || true
    if [[ ! -f "$ICONS/partial.plist" ]]; then
      echo "actool wrote no icon set"
      exit 1
    fi
    cp "$ICONS"/AppIcon*.png "$APP/"
    /usr/libexec/PlistBuddy -c "Merge \"$ICONS/partial.plist\"" "$APP/Info.plist"
    OUT="$ROOT/dist/SvRvS-Rythm-$VERSION-unsigned.ipa"
    STAGE=$(mktemp -d)
    mkdir -p "$STAGE/Payload"
    cp -R "$APP" "$STAGE/Payload/"
    rm -f "$OUT"
    ( cd "$STAGE" && zip -qry "$OUT" Payload )
    rm -rf "$STAGE"
    ls -l "$OUT"
    ;;
  signed|archive)
    if [[ -z "$TEAM" ]]; then
      echo "TEAM_ID is required: pass TEAM_ID=XXXXXXXXXX or set RYTHM_DEVELOPMENT_TEAM in ios/Config/Local.xcconfig"
      exit 1
    fi
    xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release -sdk iphoneos \
      -destination 'generic/platform=iOS' -archivePath build/SvRvSRythm.xcarchive \
      DEVELOPMENT_TEAM="$TEAM" -allowProvisioningUpdates archive
    if [[ "$MODE" == archive ]]; then
      echo "build/SvRvSRythm.xcarchive"
      exit 0
    fi
    cat > build/ExportOptions.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>$METHOD</string>
<key>teamID</key><string>$TEAM</string>
<key>signingStyle</key><string>automatic</string>
<key>compileBitcode</key><false/>
<key>stripSwiftSymbols</key><true/>
<key>destination</key><string>export</string>
</dict></plist>
EOF
    rm -rf build/export
    xcodebuild -exportArchive -archivePath build/SvRvSRythm.xcarchive -exportPath build/export \
      -exportOptionsPlist build/ExportOptions.plist -allowProvisioningUpdates
    mv build/export/*.ipa "$ROOT/dist/SvRvS-Rythm-$VERSION.ipa"
    ls -l "$ROOT/dist/SvRvS-Rythm-$VERSION.ipa"
    ;;
  *)
    echo "usage: zsh scripts/build-ios.sh [unsigned|signed|archive|simulator]"
    echo "  TEAM_ID=XXXXXXXXXX METHOD=development|ad-hoc|app-store-connect zsh scripts/build-ios.sh signed"
    exit 1
    ;;
esac
