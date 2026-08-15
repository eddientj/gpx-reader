module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Must stay last — Reanimated's babel transform needs to see the output
    // of every other plugin/preset first.
    plugins: ["react-native-reanimated/plugin"],
  };
};
