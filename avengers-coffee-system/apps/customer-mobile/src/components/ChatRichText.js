import React from 'react'
import { View, Text } from 'react-native'
import { inlineText, textBlocks } from '../../../web-customer/src/components/chatText'

function Inline({ value }) {
  const render = (nodes) => nodes.map((node, i) => node.type === 'text' ? node.text
    : <Text key={i} style={node.type === 'strong' ? { fontWeight: '700' } : { fontStyle: 'italic' }}>{render(node.children)}</Text>)
  return <>{render(inlineText(value))}</>
}
export default function ChatRichText({ text, style }) {
  return <View style={{ gap: 8 }}>{textBlocks(text).map((block, i) => {
    if (block.type === 'rule') return <View key={i} style={{ height: 1, backgroundColor: '#e5e7eb' }} />
    if (block.items) return <View key={i} style={{ gap: 6 }}>{block.items.map((item, j) => <View key={j} style={{ flexDirection: 'row', gap: 7 }}><Text style={style}>{block.type === 'ordered' ? `${block.start + j}.` : '•'}</Text><Text selectable style={[style, { flex: 1 }]}><Inline value={item} /></Text></View>)}</View>
    return <Text selectable key={i} style={[style, block.type === 'heading' && { fontWeight: '700' }]}><Inline value={block.text} /></Text>
  })}</View>
}
