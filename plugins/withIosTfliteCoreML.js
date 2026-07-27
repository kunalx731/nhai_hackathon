const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * iOS-only Expo config plugin.
 *
 * `ios/Podfile` is regenerated from scratch on every `expo prebuild` (and EAS
 * Build always runs a clean prebuild), so any hand-edits to it are lost. This
 * plugin re-applies the two iOS-specific Podfile tweaks the app depends on, so
 * they survive prebuild both locally and on EAS Build:
 *
 *   1. `$EnableCoreMLDelegate = true` — react-native-fast-tflite reads this
 *      global to link the TFLite Core ML delegate pod (hardware-accelerated
 *      EdgeFace inference). Without it, inference falls back to CPU — still
 *      correct, just slower.
 *
 *   2. fmt `base.h` consteval guard — Apple clang 21 (Xcode 16+) miscompiles
 *      fmt's consteval path used by React Native, breaking the build. We widen
 *      the version guard in post_install (Pods are on disk by then).
 *
 * Both edits are idempotent: re-running prebuild or double-applying is a no-op.
 */
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
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      // 1. Enable the TFLite Core ML delegate (must be a top-level global,
      //    evaluated before use_react_native! / pod resolution).
      if (!contents.includes('$EnableCoreMLDelegate')) {
        contents = `$EnableCoreMLDelegate = true\n${contents}`;
      }

      // 2. Inject the fmt consteval fix at the start of the existing
      //    post_install block (Pods are downloaded by the time it runs).
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
};

module.exports = withIosTfliteCoreML;
