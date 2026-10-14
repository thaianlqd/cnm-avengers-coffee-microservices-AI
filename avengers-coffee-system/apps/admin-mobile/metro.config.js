const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const config = getDefaultConfig(__dirname)
config.watchFolders = [path.resolve(__dirname, '../web-admin/src/components/console')]
module.exports = config
