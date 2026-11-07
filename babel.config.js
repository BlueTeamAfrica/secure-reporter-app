/**
 * Expo's default preset, plus: no console output in non-development builds (S5). Release and
 * test builds (EAS "preview", "reporter", "production") are bundled with NODE_ENV=production,
 * so every console.* call is removed from the shipped bundle; development keeps logging.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    env: {
      production: {
        plugins: ["transform-remove-console"],
      },
    },
  };
};
