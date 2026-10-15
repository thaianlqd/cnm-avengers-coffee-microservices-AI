// Publish only confirmed, priced server carts; late writes must not roll back
// another write or leak rows across account transitions.
export function confirmedCart(payload, owner, current) {
  const cart = payload?.cart || payload;
  if (!cart || !Array.isArray(cart.items) || String(cart.user_id) !== String(owner)) return null;
  if (cart.cart_version == null || cart.cart_version === '') return null;
  const version = Number(cart.cart_version);
  if (!Number.isSafeInteger(version) || version < 0) return null;
  if (current?.user_id === cart.user_id && Number(current.cart_version) > version) return current;
  return cart;
}
