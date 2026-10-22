import { useEffect, useRef } from 'react';
import { HiArrowDown, HiArrowUpRight } from 'react-icons/hi2';
import { useUiLanguage } from '../../lib/uiText';
import { categoryFamily } from '../../lib/catalogSelection';

const IMAGES = {
  hero: '/images/brand/coffee-moments-hero-v1.jpg',
  menu: '/images/brand/tea-and-croissant-v1.jpg',
  space: '/images/brand/coffee-space-v1.jpg',
  craft: '/images/news/heritage.jpg',
};

const COPY = {
  vi: {
    hero: ['Cà phê ngon.', 'Chuyện thêm vui.'],
    order: 'Đặt món ngay',
    menu: 'Khám phá thực đơn',
    intro: ['Chậm một nhịp.', 'Gần nhau hơn.'],
    introBody: 'Một ly cà phê đúng gu, một cuộc hẹn không vội. Những điều giản dị làm nên một ngày thật đẹp cùng Avengers Coffee.',
    menuHeading: ['Mỗi cuộc hẹn,', 'một hương vị.'],
    menuBody: 'Từ cà phê đậm đà, trà trái cây tươi mát đến chiếc bánh thơm vừa đủ cho một buổi chiều.',
    categories: ['Cà phê', 'Trà & thức uống', 'Bánh & ăn nhẹ'],
    craft: ['Thân quen từ', 'hương vị Việt.'],
    craftBody: 'Chúng mình yêu vị cà phê đậm đà, yêu cách mỗi người tìm thấy một gu riêng trong những món quen thuộc.',
    story: 'Câu chuyện Avengers',
    space: ['Một góc quen.', 'Vạn chuyện để kể.'],
    spaceBody: 'Ghé lại để bắt đầu ngày mới, gặp người thương, hay đơn giản là dành một chút thời gian cho mình.',
    stores: 'Tìm cửa hàng của bạn',
    ending: 'Hẹn nhau một ly nhé?',
    partner: 'Đồng hành cùng Avengers',
    scroll: 'Khám phá Avengers Coffee',
    heroAlt: 'Latte trong tách đỏ, cà phê sữa đá và phin cà phê trên bàn sáng nắng',
    menuAlt: 'Trà đào cam sả mát lạnh và bánh croissant vàng giòn',
    craftAlt: 'Hạt cà phê trong máy rang tại xưởng',
    spaceAlt: 'Góc cà phê với ghế đỏ, bàn trắng và ánh sáng từ cửa sổ',
  },
  en: {
    hero: ['Good coffee.', 'Better together.'],
    order: 'Order now',
    menu: 'Explore the menu',
    intro: ['Slow down.', 'Come closer.'],
    introBody: 'Your favourite cup, a little time together. Enjoy the simple things that make a lovely day at Avengers Coffee.',
    menuHeading: ['A flavour for', 'every moment.'],
    menuBody: 'Rich coffee, refreshing fruit tea, and a little something from the bakery for an easy afternoon.',
    categories: ['Coffee', 'Tea & refreshments', 'Bakery & bites'],
    craft: ['Familiar flavours.', 'Vietnamese soul.'],
    craftBody: 'We love the richness of Vietnamese coffee, and the way everyone finds their own favourite in a familiar cup.',
    story: 'The Avengers story',
    space: ['A familiar place.', 'A new conversation.'],
    spaceBody: 'Start your morning, catch up with someone you love, or take a little time for yourself.',
    stores: 'Find your coffee spot',
    ending: 'Shall we meet for coffee?',
    partner: 'Grow with Avengers',
    scroll: 'Discover Avengers Coffee',
    heroAlt: 'A latte in a red cup, iced milk coffee and a Vietnamese coffee filter in the morning light',
    menuAlt: 'Iced peach, orange and lemongrass tea with a golden croissant',
    craftAlt: 'Coffee beans inside a roasting machine',
    spaceAlt: 'A cafe corner with red seating, white tables and natural window light',
  },
};

function ArrowLink({ children, onClick, className = '' }) {
  return (
    <button type="button" className={'ac-home-link ' + className} onClick={onClick}>
      <span>{children}</span>
      <span className="ac-home-link__arrow" aria-hidden="true"><HiArrowUpRight /></span>
    </button>
  );
}

export default function Home({ setActiveTab, categories = [], setSelectedCatId }) {
  const language = useUiLanguage();
  const copy = COPY[language.startsWith('en') ? 'en' : 'vi'];
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    root.classList.add('is-reveal-ready');
    root.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
    return () => {
      observer.disconnect();
      root.classList.remove('is-reveal-ready');
    };
  }, []);

  const navigate = tab => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth' });
  };
  const openMenu = family => {
    const roots = categories.filter(category => !category.ma_danh_muc_cha);
    const category = family && ([...roots, ...categories].find(item => categoryFamily(item.ten_danh_muc) === family));
    const hasChildren = category && categories.some(item => String(item.ma_danh_muc_cha) === String(category.ma_danh_muc));
    setSelectedCatId?.(category ? (hasChildren ? 'group-' + category.ma_danh_muc : category.ma_danh_muc) : 'all');
    navigate('order');
  };

  return (
    <div ref={rootRef} className="ac-home">
      <section className="ac-home-hero" aria-labelledby="ac-home-title">
        <div className="ac-home-hero__visual">
          <img src={IMAGES.hero} alt={copy.heroAlt} width="1672" height="941" fetchPriority="high" decoding="async" />
        </div>
        <div className="ac-home-hero__content">
          <h1 id="ac-home-title">{copy.hero.map(line => <span key={line}>{line}</span>)}</h1>
          <ArrowLink onClick={() => openMenu()}>{copy.order}</ArrowLink>
        </div>
        <a className="ac-home-hero__scroll" href="#ac-home-discover" aria-label={copy.scroll}><HiArrowDown aria-hidden="true" /></a>
      </section>

      <section id="ac-home-discover" className="ac-home-intro" aria-labelledby="ac-home-intro-title">
        <div data-reveal>
          <h2 id="ac-home-intro-title">{copy.intro.map(line => <span key={line}>{line}</span>)}</h2>
          <p>{copy.introBody}</p>
        </div>
      </section>

      <section className="ac-home-menu ac-home-container" aria-labelledby="ac-home-menu-title">
        <div className="ac-home-menu__copy" data-reveal>
          <h2 id="ac-home-menu-title">{copy.menuHeading.map(line => <span key={line}>{line}</span>)}</h2>
          <p>{copy.menuBody}</p>
          <div className="ac-home-menu__choices">
            {['coffee', 'tea', 'food'].map((family, index) => (
              <button key={family} type="button" onClick={() => openMenu(family)}>
                <span>{copy.categories[index]}</span><HiArrowUpRight aria-hidden="true" />
              </button>
            ))}
          </div>
          <ArrowLink onClick={() => openMenu()}>{copy.menu}</ArrowLink>
        </div>
        <div className="ac-home-menu__visual" data-reveal>
          <div className="ac-home-menu__circle">
            <img src={IMAGES.menu} alt={copy.menuAlt} width="1536" height="1024" loading="lazy" decoding="async" />
          </div>
        </div>
      </section>

      <section className="ac-home-craft" aria-labelledby="ac-home-craft-title">
        <div className="ac-home-container ac-home-craft__grid">
          <div className="ac-home-craft__image" data-reveal>
            <img src={IMAGES.craft} alt={copy.craftAlt} width="2048" height="1365" loading="lazy" decoding="async" />
          </div>
          <div className="ac-home-craft__copy" data-reveal>
            <h2 id="ac-home-craft-title">{copy.craft.map(line => <span key={line}>{line}</span>)}</h2>
            <p>{copy.craftBody}</p>
            <ArrowLink onClick={() => navigate('about')}>{copy.story}</ArrowLink>
          </div>
        </div>
      </section>

      <section className="ac-home-space ac-home-container" aria-labelledby="ac-home-space-title">
        <div className="ac-home-space__heading" data-reveal>
          <h2 id="ac-home-space-title">{copy.space.map(line => <span key={line}>{line}</span>)}</h2>
          <div>
            <p>{copy.spaceBody}</p>
            <ArrowLink onClick={() => navigate('stores')}>{copy.stores}</ArrowLink>
          </div>
        </div>
        <div className="ac-home-space__image" data-reveal>
          <img src={IMAGES.space} alt={copy.spaceAlt} width="1536" height="1024" loading="lazy" decoding="async" />
        </div>
      </section>

      <section className="ac-home-ending" aria-labelledby="ac-home-ending-title">
        <div data-reveal>
          <img src="/images/brand/logo-red.png" alt="Avengers Coffee" className="h-[72px] sm:h-[80px] w-auto mx-auto object-contain mb-4" loading="lazy" />
          <h2 id="ac-home-ending-title">{copy.ending}</h2>
          <div className="ac-home-ending__links">
            <ArrowLink onClick={() => openMenu()}>{copy.order}</ArrowLink>
            <ArrowLink onClick={() => navigate('nhuong-quyen')}>{copy.partner}</ArrowLink>
          </div>
        </div>
      </section>
    </div>
  );
}
