export const pageModules = {
  order: () => import('../pages/Order'),
  stores: () => import('../pages/Stores'),
  'other-group': () => import('../pages/Community'),
  careers: () => import('../pages/Careers'),
  contact: () => import('../pages/Support'),
};
export function preloadPage(tab) { pageModules[tab]?.().catch(() => { /* Navigation boundary handles a failed chunk. */ }); }
