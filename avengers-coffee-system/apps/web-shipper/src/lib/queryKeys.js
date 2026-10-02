export const queryKeys = {
  all: ['shipper'],
  profile: () => [...queryKeys.all, 'profile'],
  deliveries: () => [...queryKeys.all, 'deliveries'],
  delivery: (id) => [...queryKeys.deliveries(), id],
  stats: () => [...queryKeys.all, 'stats'],
  nearby: () => [...queryKeys.all, 'nearby'],
}
