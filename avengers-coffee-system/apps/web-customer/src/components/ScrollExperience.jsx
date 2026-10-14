import { useEffect } from 'react';

// Content is visible until observation is available. Navigation and reduced motion
// always restore it; an animation must never become a loading dependency.
export default function ScrollExperience({ pageKey }) {
  useEffect(() => {
    if (!['home', 'news', 'contact', 'menu-intro', 'nhuong-quyen', 'order'].includes(pageKey)) return;
    const root = document.querySelector('[data-customer-content]');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!root || !window.IntersectionObserver || motion.matches) return;
    const observed = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        target.classList.remove('reveal-pending');
        observer.unobserve(target);
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -24px 0px' });
    const scan = () => {
      root.querySelectorAll('section, [data-reveal]').forEach((el) => {
        if (observed.has(el) || el.closest('dialog, [role="dialog"]') || el.parentElement.closest('section, [data-reveal]')) return;
        observed.add(el);
        el.classList.add('scroll-reveal');
        if (el.getBoundingClientRect().top >= window.innerHeight) {
          el.classList.add('reveal-pending');
          observer.observe(el);
        }
      });
    };
    const restore = () => observed.forEach(el => el.classList.remove('reveal-pending'));
    scan();
    const changes = new MutationObserver(scan);
    changes.observe(root, { childList: true, subtree: true });
    motion.addEventListener('change', restore);
    return () => {
      observer.disconnect(); changes.disconnect(); restore();
      motion.removeEventListener('change', restore);
    };
  }, [pageKey]);
  return null;
}
