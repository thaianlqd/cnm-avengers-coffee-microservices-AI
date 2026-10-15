import React from 'react'
import { View } from 'react-native'
import { JourneyMap } from '../screens/MapScreen.web'
export default function RouteMapPreview({ store, destination, order }) {
  return <View style={{height:190,overflow:'hidden',borderRadius:12}} testID="order-route-map"><JourneyMap store={store} destination={destination} delivery={order} preview /></View>
}
