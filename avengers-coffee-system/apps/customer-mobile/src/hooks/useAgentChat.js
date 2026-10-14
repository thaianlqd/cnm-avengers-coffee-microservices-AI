import { useEffect, useMemo, useState, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'
import { useQueryClient } from '@tanstack/react-query'
import { createAgentConversation } from '../lib/agentConversation.mjs'
import apiClient from '../lib/apiClient'

export default function useAgentChat(owner, name, navigation) {
  const queryClient = useQueryClient()
  const [state, setState] = useState({ messages: [], busy: false })
  const [ready, setReady] = useState(false)
  const greeting = `Xin chào ${name || 'Khách hàng'}! 👋 Mình là Trợ lý AI của Avengers Coffee.\n\nHôm nay mình có thể hỗ trợ gì cho bạn?`
  const greetingRef = useRef(greeting)
  const controller = useMemo(() => {
    const instance = createAgentConversation({
      client: apiClient, storage: AsyncStorage, owner, createId: randomUUID,
      navigate: screen => navigation.navigate(screen),
      onMutation: async logs => {
        const cartTools = ['add_to_cart', 'remove_from_cart', 'remove_cart_item', 'update_cart_item', 'clear_cart', 'confirm_checkout', 'apply_voucher', 'remove_voucher']
        if (logs.some(t => cartTools.includes(t.tool))) {
          await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', owner] })
          await queryClient.invalidateQueries({ queryKey: ['customer', 'cart-quote', owner] })
        }
        if (logs.some(t => t.tool === 'confirm_checkout' && ['success', 'already_processed'].includes(t.result?.status))) {
          await queryClient.invalidateQueries({ queryKey: ['customer', 'orders', owner] })
          await queryClient.invalidateQueries({ queryKey: ['userWallet', owner] })
        }
      },
    })
    return instance
  }, [owner, queryClient, navigation])
  useEffect(() => {
    let alive = true
    controller.setListener(value => { if (alive) setState(value) })
    controller.load(greetingRef.current).catch(() => {}).finally(() => { if (alive) { setState(controller.snapshot()); setReady(true) } })
    // Controller survives switching AI/staff tabs; isolate callbacks by account.
    return () => { alive = false; controller.setListener(null) }
  }, [controller])
  return { ...state, ready, controller, greeting }
}
