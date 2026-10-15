import { confirmedCart } from '../../../web-customer/src/lib/cartReconciliation';
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
    mutationFn: async ({ owner:requestOwner, action, item, quantity, options, lineId, changes, orderId, expected }) => {
      if (action === 'add') return service.add(requestOwner, item, quantity, options)
      if (action === 'update') return service.update(lineId, changes)
      if (action === 'remove') return service.remove(lineId)
      return service.reorder(requestOwner, orderId, expected)
    },
    onSuccess: async (response, variables) => {
      const ownerKey = ['customer', 'cart', variables.owner];
      const accepted = confirmedCart(response, variables.owner, client.getQueryData(ownerKey));
      if (accepted) {
        await client.cancelQueries({ queryKey: ownerKey });
        client.setQueryData(ownerKey, previous => confirmedCart(response, variables.owner, previous));
      } else await client.invalidateQueries({ queryKey: ownerKey });
      // Pricing remains server-confirmed. Its separate query blocks checkout
      // while refreshing, without keeping product quantity controls busy.
      void client.invalidateQueries({ queryKey: ['customer', 'cart-quote', variables.owner] });
    },
  })
  return { ...query, items: cartItems(query.data).map(normalizeCartItem), count: cartCount(query.data),
    busy: mutation.isPending, add: (item, quantity = 1, options = {}) => mutation.mutateAsync({ owner, action: 'add', item, quantity, options }),
    update: (lineId, changes) => mutation.mutateAsync({ owner, action: 'update', lineId, changes }),
    remove: lineId => mutation.mutateAsync({ owner, action: 'remove', lineId }),
    reorder: (orderId, expected) => mutation.mutateAsync({ owner, action: 'reorder', orderId, expected }) }
}
