const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const config = getDefaultConfig(__dirname)
config.watchFolders = [path.resolve(__dirname, '../web-customer/src/components'), path.resolve(__dirname, '../web-customer/src/lib'), path.resolve(__dirname, '../shared-ui')]
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]
module.exports = config
