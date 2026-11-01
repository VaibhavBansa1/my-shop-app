// Metro config: also bundle ../shared (pure JS shared with the Next.js server).
// This repo is not an npm workspace, so Expo's automatic monorepo setup does not apply.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../shared')];
module.exports = config;
