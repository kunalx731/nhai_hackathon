const { withDangerousMod, withPodfileProperties, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * iOS-only Expo config plugin.
 *
 * `ios/Podfile` (and `ios/Podfile.properties.json`) are regenerated from
 * scratch on every `expo prebuild` — and EAS Build / CI always run a clean
 * prebuild — so any hand-edits are lost. This plugin re-applies the three
 * iOS-specific tweaks the app depends on, so they survive prebuild everywhere:
 *
 *   1. iOS deployment target = 16.0. GoogleMLKit (FaceDetection) requires
 *      iOS >= 15.5; Expo 52's default (15.1) makes CocoaPods fail with
 *      "RNMLKitFaceDetection ... required a higher minimum deployment target".
 *
 *   2. `$EnableCoreMLDelegate = true` — react-native-fast-tflite reads this
 *      global to link the TFLite Core ML delegate pod (hardware-accelerated
 *      EdgeFace inference). Without it, inference falls back to CPU — still
 *      correct, just slower.
 *
 *   3. fmt `base.h` consteval guard — Apple clang 21 (Xcode 16+) miscompiles
 *      fmt's consteval path used by React Native, breaking the build. We widen
 *      the version guard in post_install (Pods are on disk by then). No-op on
 *      the Xcode 15 CI runner; matters if the build image moves to Xcode 16+.
 *
 * All edits are idempotent: re-running prebuild or double-applying is a no-op.
 */
const IOS_DEPLOYMENT_TARGET = '16.0';

const FMT_PATCH = `
    # [withIosTfliteCoreML] Patch fmt base.h: consteval is broken in Apple clang 21 (Xcode 16+)
    fmt_base_h = File.join(__dir__, 'Pods/fmt/include/fmt/base.h')
    if File.exist?(fmt_base_h)
      old_guard = '#elif defined(__apple_build_version__) && __apple_build_version__ < 14000029L'
      new_guard = '#elif defined(__apple_build_version__) && (__apple_build_version__ < 14000029L || __apple_build_version__ >= 16000000L)'
      content = File.read(fmt_base_h)
      if content.include?(old_guard) && !content.include?(new_guard)
        File.chmod(0644, fmt_base_h)
        File.write(fmt_base_h, content.gsub(old_guard, new_guard))
        puts '[withIosTfliteCoreML] fmt base.h: extended Apple clang consteval guard for clang 21+'
      end
    end
`;

const withIosTfliteCoreML = (config) => {
  // 1. Deployment target -> written into ios/Podfile.properties.json, which the
  //    generated Podfile reads for `platform :ios, ...`.
  config = withPodfileProperties(config, (cfg) => {
    cfg.modResults['ios.deploymentTarget'] = IOS_DEPLOYMENT_TARGET;
    // Route pod compiles through ccache (react_native_post_install reads this),
    // so unchanged native C/C++/ObjC is served from the compiler cache in CI.
    cfg.modResults['apple.ccacheEnabled'] = 'true';
    return cfg;
  });

  // 1b. Keep the app's own Xcode target in sync with the Pods (>= 16.0) so the
  //     archive step doesn't warn/fail on a target lower than its dependencies.
  config = withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const buildSettings = configurations[key] && configurations[key].buildSettings;
      if (buildSettings && buildSettings.IPHONEOS_DEPLOYMENT_TARGET) {
        buildSettings.IPHONEOS_DEPLOYMENT_TARGET = IOS_DEPLOYMENT_TARGET;
      }
    }
    return cfg;
  });

  // 2 + 3. CoreML delegate flag and fmt fix -> edit the generated Podfile.
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      // Enable the TFLite Core ML delegate (top-level global, evaluated before
      // use_react_native! / pod resolution).
      if (!contents.includes('$EnableCoreMLDelegate')) {
        contents = `$EnableCoreMLDelegate = true\n${contents}`;
      }

      // Inject the fmt consteval fix at the start of the existing post_install
      // block (Pods are downloaded by the time it runs).
      if (!contents.includes('[withIosTfliteCoreML] Patch fmt base.h')) {
        contents = contents.replace(
          /post_install do \|installer\|\n/,
          (match) => `${match}${FMT_PATCH}`
        );
      }

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);

  return config;
};

module.exports = withIosTfliteCoreML;
