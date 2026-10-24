import { useMemo, useRef } from 'react';
import { useUiLanguage, uiLocale } from '../../lib/uiText';
import { menuCategoryLabel } from '../../lib/categoryLabels';
import { categoryPath, productsInCategory } from '../../lib/menuCatalog';
import { ArrowRightIcon, ArrowLongLeftIcon } from '../../components/common/icons';
import './style.css';

function groupKind(name = '') {
  const text = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/ca phe|coffee/.test(text)) return 'coffee';
  if (/tra|tea/.test(text)) return 'tea';
  if (/da xay|freeze|blended/.test(text)) return 'freeze';
  return 'other';
}
const descriptions = {
  coffee: ['Chậm một nhịp với cà phê phin, hay tỉnh táo cùng espresso. Tìm hương vị dành cho riêng bạn.', 'Slow down with Vietnamese phin coffee, or start fresh with espresso. Find your kind of coffee.'],
  tea: ['Thanh vị trà, tươi vị trái cây. Một khoảng nghỉ nhẹ nhàng giữa nhịp sống mỗi ngày.', 'Delicate tea and fresh fruit flavours. A refreshing pause in your everyday rhythm.'],
  freeze: ['Mát lạnh, sánh mịn, đầy cảm hứng. Khám phá những hương vị đá xay bạn yêu thích.', 'Cool, smooth and full of flavour. Explore your favourite blended drinks.'],
  other: ['Một chút ngon miệng để cuộc hẹn thêm trọn vẹn. Khám phá những lựa chọn đang có trong thực đơn.', 'A little something to make your coffee break complete. Explore the choices on our menu.'],
};
const price = value => value != null && value !== '' && Number.isFinite(Number(value)) ? `${Number(value).toLocaleString(uiLocale())} ₫` : '—';
function Arrow() { return <ArrowRightIcon aria-hidden="true" />; }

function ProductImage({ product, eager = false }) {
  const [source, alt] = [product.hinh_anh_url, product.ten_san_pham];
  return source ? <img src={source} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /> : <span className="menu-photo-missing">{alt}</span>;
}
function ProductCard({ product, onSelect, copy }) {
  const disabled = product.trang_thai === false;
  return <article className="menu-product" data-product-id={product.ma_san_pham}>
    <button type="button" onClick={() => onSelect?.(product)} aria-label={`${product.ten_san_pham} — ${price(product.gia_ban)}`}>
      <div className="menu-product-photo"><ProductImage product={product} /><div className="menu-product-badges">{product.la_moi && <span>{copy('MỚI', 'NEW')}</span>}{product.la_hot && <span>{copy('NỔI BẬT', 'FEATURED')}</span>}{disabled && <span>{copy('TẠM HẾT MÓN', 'UNAVAILABLE')}</span>}</div><span className="menu-product-open"><Arrow /></span></div>
      <div className="menu-product-info"><h3>{product.ten_san_pham}</h3><div className="menu-product-prices"><strong>{price(product.gia_ban)}</strong>{Number(product.gia_niem_yet) > Number(product.gia_ban) && <del>{price(product.gia_niem_yet)}</del>}</div></div>
    </button>
  </article>;
}

export default function MenuIntroPage({ categories = [], products = [], activeCategoryId = 'all', onCategoryChange, onOrderProduct, isLoading = false, isError = false, onRetry }) {
  const language = useUiLanguage();
  const isEn = language.startsWith('en');
  const copy = (vi, en) => isEn ? en : vi;
  const label = name => menuCategoryLabel(name, isEn ? 'en' : 'vi');
  const results = useRef(null);
  const roots = useMemo(() => categories.filter(category => category.ma_danh_muc_cha == null), [categories]);
  const path = useMemo(() => categoryPath(categories, activeCategoryId), [categories, activeCategoryId]);
  const current = path.at(-1);
  const root = path[0];
  const overview = activeCategoryId === 'all' || !current;
  const selectedProducts = useMemo(() => overview ? products : productsInCategory(categories, products, current.ma_danh_muc), [categories, products, current, overview]);
  const featured = selectedProducts.find(product => product.la_hot && product.trang_thai !== false) || selectedProducts.find(product => product.trang_thai !== false) || selectedProducts[0];
  const children = useMemo(() => current ? categories.filter(category => String(category.ma_danh_muc_cha) === String(current.ma_danh_muc)) : roots, [categories, current, roots]);
  const kind = groupKind(root?.ten_danh_muc);
  const intro = current?.mo_ta || descriptions[kind][isEn ? 1 : 0];
  const selectCategory = category => {
    onCategoryChange?.(category ? `group-${category.ma_danh_muc}` : 'all');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const sections = overview ? roots : children;
  const directProducts = current ? selectedProducts.filter(product => String(product.danhMuc?.ma_danh_muc ?? product.ma_danh_muc) === String(current.ma_danh_muc)) : [];
  const showAllProducts = !overview && children.length === 0;

  return <div className="menu-intro-page menu-editorial">
    <nav className="menu-category-nav" aria-label={copy('Danh mục thực đơn', 'Menu categories')}>
      <button type="button" aria-pressed={overview} onClick={() => selectCategory(null)}>{copy('Tất cả', 'All')}</button>
      {roots.map(category => <button type="button" key={category.ma_danh_muc} aria-pressed={String(root?.ma_danh_muc) === String(category.ma_danh_muc)} onClick={() => selectCategory(category)}>{label(category.ten_danh_muc)}</button>)}
    </nav>
    <div className="menu-breadcrumb menu-container"><button type="button" onClick={() => selectCategory(null)}>{copy('Thực đơn', 'Menu')}</button>{path.map(category => <span key={category.ma_danh_muc}>/ <button type="button" onClick={() => selectCategory(category)}>{label(category.ten_danh_muc)}</button></span>)}</div>
    <section className={`menu-hero menu-container menu-hero--${kind}`} aria-labelledby="menu-title">
      <div className="menu-hero-copy"><p className="menu-eyebrow">AVENGERS COFFEE / {copy('THỰC ĐƠN', 'THE MENU')}</p><h1 id="menu-title">{overview ? <>{copy('Chọn vị bạn yêu.', 'Find your flavour.')}<br /><em>{copy('Thêm vui mỗi ngày.', 'Savour the everyday.')}</em></> : label(current.ten_danh_muc)}</h1><p className="menu-hero-description">{overview ? copy('Từ ly cà phê đậm đà đến vị trà thanh mát, từ chiếc bánh mới đến món quen mỗi ngày. Có một hương vị đang chờ bạn khám phá.', 'From a rich coffee to a refreshing tea, a little treat to an everyday favourite. There is a flavour waiting for you.') : intro}</p><button type="button" className="menu-link" onClick={() => results.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}>{copy('Khám phá thực đơn', 'Explore the selection')}<Arrow /></button><span className="menu-hero-count">{!isLoading && `${selectedProducts.length} ${copy('lựa chọn trong thực đơn', 'choices on the menu')}`}</span></div>
      <div className="menu-hero-visual">{featured ? <button type="button" onClick={() => onOrderProduct?.(featured)} className="menu-hero-product"><span className="menu-hero-orbit" aria-hidden="true" /><ProductImage product={featured} eager /><span className="menu-hero-product-caption"><span>{featured.ten_san_pham}</span><strong>{price(featured.gia_ban)}</strong><Arrow /></span></button> : <div className="menu-hero-placeholder" aria-hidden="true">{isLoading ? <span className="menu-image-skeleton" /> : <img src="/images/brand/logo.svg" alt="" />}</div>}</div>
    </section>

    <div className="menu-results menu-container" ref={results}>
      {isError ? <div className="menu-empty" role="alert"><h2>{copy('Chưa tải được thực đơn.', 'The menu could not be loaded.')}</h2><p>{copy('Bạn thử tải lại để xem sản phẩm và giá mới nhất nhé.', 'Please try again for the latest products and prices.')}</p><button type="button" className="menu-link" onClick={onRetry}>{copy('Thử lại', 'Try again')}<Arrow /></button></div> : isLoading ? <div className="menu-product-grid" aria-label={copy('Đang tải thực đơn', 'Loading menu')} aria-busy="true">{Array.from({ length: 8 }, (_, index) => <div key={index} className="menu-product-skeleton" />)}</div> : <>
        {sections.map((category, index) => {
          const rows = productsInCategory(categories, products, category.ma_danh_muc);
          return <section className="menu-collection" key={category.ma_danh_muc} aria-labelledby={`menu-category-${category.ma_danh_muc}`}>
            <div className="menu-collection-heading"><div><p className="menu-eyebrow">0{index + 1} / {rows.length} {copy('LỰA CHỌN', 'CHOICES')}</p><h2 id={`menu-category-${category.ma_danh_muc}`}>{label(category.ten_danh_muc)}</h2><p>{category.mo_ta || descriptions[groupKind(category.ten_danh_muc)][isEn ? 1 : 0]}</p></div><button type="button" className="menu-link" onClick={() => selectCategory(category)}>{copy('Xem tất cả', 'View all')}<Arrow /></button></div>
            {rows.length ? <div className="menu-product-grid">{rows.slice(0, 4).map(product => <ProductCard key={product.ma_san_pham} product={product} onSelect={onOrderProduct} copy={copy} />)}</div> : <p className="menu-category-empty">{copy('Danh mục đang được cập nhật.', 'This collection is being updated.')}</p>}
          </section>;
        })}
        {(showAllProducts || directProducts.length > 0) && <section className="menu-collection"><div className="menu-collection-heading"><div><p className="menu-eyebrow">{copy('KHÁM PHÁ ĐÚNG GU', 'MADE FOR YOUR TASTE')}</p><h2>{showAllProducts ? label(current.ten_danh_muc) : copy('Thêm lựa chọn dành cho bạn', 'More to explore')}</h2></div><span className="menu-result-count">{(showAllProducts ? selectedProducts : directProducts).length} {copy('sản phẩm', 'products')}</span></div><div className="menu-product-grid">{(showAllProducts ? selectedProducts : directProducts).map(product => <ProductCard key={product.ma_san_pham} product={product} onSelect={onOrderProduct} copy={copy} />)}</div></section>}
        {!selectedProducts.length && <div className="menu-empty"><h2>{copy('Hẹn bạn một hương vị mới.', 'Something new is brewing.')}</h2><p>{copy('Hiện chưa có sản phẩm trong danh mục này.', 'There are no products in this collection yet.')}</p><button className="menu-link" type="button" onClick={() => selectCategory(null)}><ArrowLongLeftIcon />{copy('Về tất cả thực đơn', 'Back to the menu')}</button></div>}
      </>}
    </div>
    <section className="menu-ending"><p className="menu-eyebrow">{copy('ĐẬM VỊ HƠN KHI CÙNG NHAU', 'BETTER WHEN SHARED')}</p><h2>{copy('Hôm nay, bạn chọn vị gì?', 'What is your flavour today?')}</h2><button type="button" className="menu-link" onClick={() => selectCategory(null)}>{copy('Khám phá các danh mục', 'Explore all collections')}<Arrow /></button></section>
  </div>;
}
