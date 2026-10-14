const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const config = getDefaultConfig(__dirname)
// Share the web chat's platform-independent contracts without copying logic.
config.watchFolders = [path.resolve(__dirname, '../web-customer/src/components')]
module.exports = config
