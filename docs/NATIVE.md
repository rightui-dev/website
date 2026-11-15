# Native builds and AppDrop delivery

The iPhone and Mac builds compile the same site sources. Run native builds and web checks sequentially: the wrapper temporarily switches the manifest and generated Contract to the selected native host, then restores the web configuration in `finally`.

## iPhone archive

Create a private release directory outside both repositories, then run:

```sh
EXACT_FEEDBACK=0 EXACT_VERSION=0.3.0 EXACT_BUILD_NUMBER=<new-build-number> \
  bun tools/build-native.ts ios --archive <release-directory>/RightUI.ipa
```

This explicitly selects an iPhone device archive, not a simulator application. The archive is ad hoc signed without a provisioning profile, for personal signing through AppDrop. A simulator launch does not validate installation of the distributed archive on a physical iPhone.

Verify ZIP integrity, bundle identifier `dev.rightui`, version/build, `CFBundleSupportedPlatforms = [iPhoneOS]`, arm64 architecture and the bundle's strict code signature before uploading.

Without `--archive`, `bun tools/build-native.ts ios` keeps the existing simulator workflow. `EXACT_SIM` can select the simulator.

## Mac archive

```sh
EXACT_FEEDBACK=0 EXACT_DEVELOPER_ID=- bun tools/build-native.ts mac
```

Read the resulting application path from the build's JSON output. Copy the application into the release directory; do not replace an application in `/Applications`.

The pinned Exact host currently writes fixed Mac version fields. In the release copy, set `Contents/Info.plist` fields `CFBundleShortVersionString` and `CFBundleVersion` to the intended release values, then re-sign the outer bundle while retaining its entitlements:

```sh
codesign --force --sign - --timestamp=none \
  --preserve-metadata=identifier,entitlements,requirements,flags,runtime \
  <release-directory>/RightUI.app
codesign --verify --deep --strict <release-directory>/RightUI.app
ditto -c -k --sequesterRsrc --keepParent \
  <release-directory>/RightUI.app <release-directory>/RightUI-mac.zip
unzip -tq <release-directory>/RightUI-mac.zip
```

This retains the existing ad hoc distribution model; it does not notarize the Mac app. Exercise the release copy, including navigation and narrow-window menu behavior.

## Authorized upload

Update the existing public AppDrop link with the local CLI, one artifact at a time. It resolves the management key from its private local store. Capture all upload output in a private directory with `umask 077`; never print raw responses or management links. Print only explicitly selected public fields such as URL, platform, revision and build.

Use increasing build numbers. Do not use `--force` unless deliberately reusing an already validated build number. Read the server-returned revision; the local AppDrop store is not authoritative for Mac revisions.

Compare public metadata before and after each platform update, confirming that the other platform did not change. Download both new revisions and compare their hashes with the uploaded artifacts. The CLI strips Finder metadata from an IPA; compare against those normalized bytes. A Mac ZIP is uploaded unchanged.

Update the source's pinned Mac download URL to the returned revision. A native upload does not deploy the website. Record any difference between the distributed binaries' embedded links and a later source-only link update.
