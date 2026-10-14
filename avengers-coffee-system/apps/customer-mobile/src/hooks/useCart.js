import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { randomUUID } from 'expo-crypto'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { createCartService, cartItems, cartCount } from '../lib/cartContract.mjs'
import { normalizeCartItem } from '../lib/customerData'
const service = createCartService(apiClient, randomUUID)
export function useCart() {
  const { activeUserId: owner, hydrated } = useUser()
  const client = useQueryClient()
  const key = ['customer', 'cart', owner]
  const query = useQuery({ queryKey: key, queryFn: () => service.read(owner), enabled: hydrated && Boolean(owner), staleTime: 10000 })
  const mutation = useMutation({
    mutationFn: async ({ action, item, quantity, options, lineId, changes, orderId, expected }) => {
      if (action === 'add') return service.add(owner, item, quantity, options)
      if (action === 'update') return service.update(lineId, changes)
      if (action === 'remove') return service.remove(lineId)
      return service.reorder(owner, orderId, expected)
    },
    onSuccess: async response => {
      // Only confirmed server rows can enter the shared cache; no fabricated offline rows.
      if (response?.cart?.items) client.setQueryData(key, response.cart)
      else if (response?.items) client.setQueryData(key, response)
      await client.invalidateQueries({ queryKey: key })
      await client.invalidateQueries({ queryKey: ['customer', 'cart-quote', owner] })
    },
  })
  return { ...query, items: cartItems(query.data).map(normalizeCartItem), count: cartCount(query.data),
    busy: mutation.isPending, add: (item, quantity = 1, options = {}) => mutation.mutateAsync({ action: 'add', item, quantity, options }),
    update: (lineId, changes) => mutation.mutateAsync({ action: 'update', lineId, changes }),
    remove: lineId => mutation.mutateAsync({ action: 'remove', lineId }),
    reorder: (orderId, expected) => mutation.mutateAsync({ action: 'reorder', orderId, expected }) }
}
