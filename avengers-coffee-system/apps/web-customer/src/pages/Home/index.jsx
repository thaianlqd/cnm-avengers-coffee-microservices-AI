import { useEffect, useRef } from 'react';
import { useUiLanguage } from '../../lib/uiText';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/common/icons';
import HeroFilm from './HeroFilm';
import './style.css';

const assets = '/hc-assets/';
const social = {
  instagram: 'https://www.instagram.com/highlandscoffeevietnam/',
  facebook: 'https://www.facebook.com/highlandscoffeevietnam/',
  youtube: 'https://www.youtube.com/@highlandscoffeevietnam5504',
};
const campaigns = [
  ['HCO_7820_MATCHA_LAUNCH_DC_MWB_1920X926.jpg', 'Matcha, một phong vị mới.', 'Matcha, a fresh perspective.', 'MATCHAĐI'],
  ['slider_1.jpg', 'Chất phin. Thêm sáng tạo.', 'A fresh take on phin coffee.', 'PHINĐI'],
  ['slider_2.jpg', 'Tươi tỉnh từng khoảnh khắc.', 'A little refresh for your day.', 'AMERICANO'],
  ['HCO_7824_1000_STORE_DC_MWB.jpg', 'Ngàn lời cảm ơn, triệu kết nối.', 'A thousand thanks. Endless connections.', 'HIGHLANDS COFFEE'],
  ['HLC___ngang_social_1920_x_1280_px_1_1.png', 'Gắn kết những điều thân quen.', 'Closer, over a cup of coffee.', 'CÙNG NHAU / TOGETHER'],
];

function Arrow({ diagonal = false }) {
  return <ArrowRightIcon className={diagonal ? 'hc-arrow hc-arrow--diagonal' : 'hc-arrow'} aria-hidden="true" />;
}
function PageLink({ children, onClick, className = '' }) {
  return <button type="button" className={`hc-text-link ${className}`} onClick={onClick}><span>{children}</span><Arrow /></button>;
}
function Photo({ file, alt, className = '' }) {
  return <img className={className} src={`${assets}${file}`} alt={alt} loading="lazy" decoding="async" />;
}
function ExternalLink({ href, children, className = '' }) {
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<Arrow diagonal /></a>;
}

export default function Home({ setActiveTab, categories = [], setSelectedCatId, articles = [], isNewsLoading = false, isNewsError = false, onRetryNews, onSelectArticle }) {
  const isEn = useUiLanguage().startsWith('en');
  const copy = (vi, en) => isEn ? en : vi;
  const campaignTrack = useRef(null);
  const homeRef = useRef(null);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!window.IntersectionObserver || preference.matches) return;
    const elements = [...homeRef.current.querySelectorAll('.hc-story,.hc-campaign,.hc-social-grid > a,.hc-destination-image,.hc-craft-copy')];
    const restore = () => elements.forEach(element => element.classList.remove('hc-motion-pending'));
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('hc-motion-pending');
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.05 });
    elements.forEach((element, index) => {
      element.classList.add('hc-motion-item');
      element.style.setProperty('--reveal-delay', `${index % 3 * 70}ms`);
      if (element.getBoundingClientRect().top > window.innerHeight) element.classList.add('hc-motion-pending');
      observer.observe(element);
    });
    preference.addEventListener('change', restore);
    return () => { observer.disconnect(); restore(); preference.removeEventListener('change', restore); };
  }, [articles]);
  const navigate = tab => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const orderCategory = keyword => {
    const matches = cat => cat.ten_danh_muc?.toLocaleLowerCase('vi').includes(keyword);
    const category = categories.find(cat => cat.ma_danh_muc_cha == null && matches(cat)) || categories.find(matches);
    setSelectedCatId?.(category ? `group-${category.ma_danh_muc}` : 'all');
    navigate('menu-intro');
  };
  const moveCampaigns = direction => {
    const track = campaignTrack.current;
    track?.scrollBy({ left: direction * (track.querySelector('article')?.getBoundingClientRect().width + 24 || 400), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  return <div className="hc-home" ref={homeRef}>
    <section className="hc-hero" aria-labelledby="hc-home-title">
      <HeroFilm isEn={isEn} />
      <div className="hc-hero-shade" />
      <div className="hc-hero-copy">
        <p className="hc-eyebrow">AVENGERS COFFEE · {copy('PHONG VỊ VIỆT', 'THE TASTE OF VIETNAM')}</p>
        <h1 id="hc-home-title">{copy('Đậm vị Việt.', 'A taste of Vietnam.')}<br /><em>{copy('Trọn khoảnh khắc.', 'A moment to share.')}</em></h1>
        <p className="hc-hero-description">{copy('Một ly cà phê quen. Một câu chuyện mới.', 'A familiar cup. A new conversation.')}<br />{copy('Hẹn nhau, tận hưởng những điều giản dị.', 'Come together for the simple things.')}</p>
        <PageLink onClick={() => navigate('menu-intro')}>{copy('Khám phá thực đơn', 'Explore the menu')}</PageLink>
      </div>
      <div className="hc-hero-bottom">
        <a className="hc-scroll-cue" href="#hc-discover"><span>↓</span>{copy('CUỘN ĐỂ KHÁM PHÁ', 'SCROLL TO EXPLORE')}</a>
        <a className="hc-hero-film-link" href="https://www.youtube.com/watch?v=ByXL5WCSXys" target="_blank" rel="noopener noreferrer" aria-label={copy('Xem phim Highlands Coffee — Là của chúng mình trên YouTube', 'Watch Highlands Coffee — It belongs to us on YouTube')} data-mobile-label={copy('Xem phim', 'Watch film')}><span className="hc-play-small">▶</span><span>{copy('Là của chúng mình', 'It belongs to us')}<small>{copy('THƯỚC PHIM HIGHLANDS COFFEE', 'A FILM BY HIGHLANDS COFFEE')}</small></span><Arrow diagonal /></a>
      </div>
    </section>

    <section className="hc-intro hc-container" id="hc-discover" aria-labelledby="hc-intro-title">
      <p className="hc-eyebrow">{copy('TỪ HẠT CÀ PHÊ, ĐẾN NHỮNG KẾT NỐI', 'FROM COFFEE BEANS TO HUMAN CONNECTIONS')}</p>
      <h2 id="hc-intro-title">{copy('Điều thân quen.', 'Familiar flavours.')}<br /><em>{copy('Luôn đáng tận hưởng.', 'Always worth savouring.')}</em></h2>
      <p>{copy('Vị cà phê phin đậm đà, ly trà thanh mát hay một lời hẹn gặp. Có những điều giản dị khiến mỗi ngày trở nên đặc biệt hơn.', 'A rich phin coffee, a refreshing tea, a moment with someone. The simple things that make every day a little more special.')}</p>
      <PageLink onClick={() => navigate('about')}>{copy('Câu chuyện của chúng mình', 'Our story')}</PageLink>
      <span className="hc-intro-mark" aria-hidden="true">✳</span>
    </section>

    <section className="hc-destinations" aria-label={copy('Cửa hàng và thực đơn', 'Stores and menu')}>
      <div className="hc-destination hc-destination--stores">
        <div className="hc-panel-heading"><span className="hc-eyebrow">01 / {copy('ĐIỂM HẸN', 'YOUR NEXT STOP')}</span><h2>{copy('Hẹn ở đây.', 'Meet you here.')}</h2><p>{copy('Bạn ở đâu, có một góc quen chờ bạn.', 'A familiar corner, wherever you are.')}</p></div>
        <button type="button" className="hc-destination-image" onClick={() => navigate('stores')}>
          <Photo file="1_1.jpg" alt={copy('Cửa hàng Highlands giữa những hàng cây xanh', 'Highlands Coffee surrounded by greenery')} />
          <span className="hc-oval">{copy('TÌM', 'FIND A')}<br />{copy('CỬA HÀNG', 'STORE')}<Arrow diagonal /></span>
        </button>
        <PageLink onClick={() => navigate('stores')}>{copy('Cửa hàng Avengers gần bạn', 'Find your nearest Avengers')}</PageLink>
      </div>
      <div className="hc-destination hc-destination--menu">
        <div className="hc-panel-heading"><span className="hc-eyebrow">02 / {copy('ĐÚNG GU CỦA BẠN', 'FIND YOUR FAVOURITE')}</span><h2>{copy('Một ly đúng gu.', 'Your kind of cup.')}</h2><p>{copy('Cà phê, trà và những món ngon đi cùng.', 'Coffee, tea, and a little something on the side.')}</p></div>
        <button type="button" className="hc-destination-image" onClick={() => navigate('menu-intro')}>
          <Photo file="web_banner_2000x2000.jpg" alt={copy('Cà phê Highlands và bánh mì que trên nền ấm', 'Highlands coffees and a banh mi on a warm backdrop')} />
          <span className="hc-oval">{copy('XEM', 'VIEW')}<br />{copy('THỰC ĐƠN', 'THE MENU')}<Arrow diagonal /></span>
        </button>
        <div className="hc-menu-shortcuts"><button type="button" onClick={() => orderCategory('cà phê')}>{copy('Cà phê', 'Coffee')}<Arrow diagonal /></button><button type="button" onClick={() => orderCategory('trà')}>{copy('Trà', 'Tea')}<Arrow diagonal /></button><button type="button" onClick={() => orderCategory('bánh')}>{copy('Bánh ngon', 'Bakery')}<Arrow diagonal /></button></div>
      </div>
    </section>

    <section className="hc-campaigns" aria-labelledby="hc-campaign-title">
      <div className="hc-section-heading hc-container"><div><p className="hc-eyebrow">{copy('CÓ GÌ MỚI?', 'FRESHLY BREWED')}</p><h2 id="hc-campaign-title">{copy('Thêm vị mới,', 'A new flavour,')}<br /><em>{copy('thêm niềm vui.', 'a little more joy.')}</em></h2></div><div className="hc-carousel-controls"><button type="button" onClick={() => moveCampaigns(-1)} aria-label={copy('Xem bộ sưu tập trước', 'Previous collection')}><ChevronLeftIcon /></button><button type="button" onClick={() => moveCampaigns(1)} aria-label={copy('Xem bộ sưu tập tiếp', 'Next collection')}><ChevronRightIcon /></button></div></div>
      <div className="hc-campaign-track" ref={campaignTrack} role="region" aria-label={copy('Các bộ sưu tập Highlands', 'Highlands collections')} tabIndex={0}>
        {campaigns.map(([file, vi, en, label], index) => <article className="hc-campaign" key={file}><button type="button" onClick={() => index === 3 || index === 4 ? navigate('news') : navigate('order')}><div className="hc-campaign-image"><Photo file={file} alt={copy(vi, en)} /><span className="hc-image-arrow"><Arrow diagonal /></span></div><div className="hc-card-meta"><span>{label}</span><span>0{index + 1}</span></div><h3>{copy(vi, en)}</h3></button></article>)}
      </div>
    </section>

    <section className="hc-craft" aria-labelledby="hc-craft-title">
      <div className="hc-craft-image"><Photo file="505392773_1120548066764868_2724070916068790506_n.jpg" alt={copy('Barista Highlands tỉ mỉ pha từng ly cà phê phin', 'A Highlands barista preparing Vietnamese phin coffee')} /></div>
      <div className="hc-craft-copy"><p className="hc-eyebrow">{copy('GIỮ GÌN MỘT PHONG VỊ', 'CRAFTED WITH CARE')}</p><h2 id="hc-craft-title">{copy('Chậm một nhịp.', 'Take it slow.')}<br /><em>{copy('Đậm một vị.', 'Taste every drop.')}</em></h2><p>{copy('Từ hạt cà phê được chọn lọc đến từng giọt phin chậm rãi. Một chút tỉ mỉ, một chút kiên nhẫn — để ly cà phê trao tay luôn trọn vị thân quen.', 'From carefully selected beans to the slow drip of a Vietnamese phin. Care and patience in every cup, for a flavour that feels like home.')}</p><PageLink onClick={() => navigate('about')}>{copy('Khám phá câu chuyện cà phê', 'Discover our coffee story')}</PageLink><span className="hc-craft-note">{copy('PHA BẰNG TÂM · THƯỞNG BẰNG CẢM', 'BREWED WITH CARE · SHARED WITH JOY')}</span></div>
    </section>

    <section className="hc-stories hc-container" aria-labelledby="hc-stories-title">
      <div className="hc-section-heading"><div><p className="hc-eyebrow">{copy('NHỮNG CÂU CHUYỆN BÊN LY CÀ PHÊ', 'MORE THAN A CUP')}</p><h2 id="hc-stories-title">{copy('Chuyện của', 'Stories of')}<br /><em>{copy('chúng mình.', 'us, together.')}</em></h2></div><PageLink onClick={() => onSelectArticle?.(null)}>{copy('Ghé đọc chuyện mới', 'Read the journal')}</PageLink></div>
      <div className="hc-story-grid">
        {isNewsLoading && !articles.length ? Array.from({ length: 3 }, (_, index) => <div className="hc-story-skeleton" aria-label={copy('Đang tải bài viết', 'Loading stories')} key={index} />) : articles.slice(0, 3).map(article => <article className="hc-story" key={article.id} data-article-id={article.id}><button type="button" onClick={() => onSelectArticle?.(article.id)}><div className="hc-story-image"><img src={article.image} alt={article.title} loading="lazy" decoding="async" /><span className="hc-image-arrow"><Arrow diagonal /></span></div><div className="hc-story-meta"><p className="hc-eyebrow">{({ COFFEEHOLIC: copy('CHUYỆN CÀ PHÊ', 'COFFEE STORIES'), TEAHOLIC: copy('CHUYỆN TRÀ', 'TEA STORIES'), LIFESTYLE: copy('ĐỜI SỐNG', 'LIFESTYLE') })[article.category] || article.category}</p><time dateTime={article.createdAt}>{article.date}</time></div><h3>{article.title}</h3><p className="hc-story-excerpt">{article.excerpt}</p></button></article>)}
      </div>
      {!isNewsLoading && !articles.length && <div className="hc-news-empty" role="status"><p>{isNewsError ? copy('Chưa tải được bài viết. Bạn thử lại nhé.', 'Stories could not be loaded. Please try again.') : copy('Những câu chuyện mới sẽ sớm được cập nhật.', 'New stories will be here soon.')}</p>{isNewsError && <PageLink onClick={onRetryNews}>{copy('Thử lại', 'Try again')}</PageLink>}</div>}
    </section>

    <section className="hc-membership" aria-labelledby="hc-member-title"><div className="hc-member-copy"><p className="hc-eyebrow">{copy('APP THÀNH VIÊN HIGHLANDSĐI', 'HIGHLANDSĐI MEMBERS APP')}</p><h2 id="hc-member-title">{copy('Gu quen của bạn.', 'Your favourites.')}<br /><em>{copy('Đặc quyền mỗi ngày.', 'Everyday privileges.')}</em></h2><p>{copy('Đặt trước, lấy ngay. Tích điểm và khám phá những ưu đãi dành riêng cho thành viên.', 'Order ahead, pick up fresh. Collect points and discover your member benefits.')}</p><PageLink onClick={() => navigate('membership')}>{copy('Khám phá thành viên', 'Explore membership')}</PageLink></div><div className="hc-member-image"><Photo file="Website_bannerr.png" alt={copy('Ứng dụng thành viên HighlandsĐI', 'HighlandsĐI membership app')} /></div></section>

    <section className="hc-social hc-container" id="hc-social" aria-labelledby="hc-social-title">
      <div className="hc-section-heading"><div><p className="hc-eyebrow">{copy('MỖI NGÀY, THÊM MỘT KẾT NỐI', 'A LITTLE CLOSER, EVERY DAY')}</p><h2 id="hc-social-title">{copy('Gặp nhau', 'See you')} <em>{copy('mỗi ngày.', 'every day.')}</em></h2></div><span className="hc-social-hashtag">#HighlandsCoffee</span></div>
      <div className="hc-social-layout"><div><div className="hc-social-label"><ExternalLink href={social.instagram}>Instagram</ExternalLink><ExternalLink href={social.facebook}>Facebook</ExternalLink></div><div className="hc-social-grid">{[
        ['web_banner_2000x2000.jpg', copy('Cà phê và bánh mì Highlands', 'Highlands coffee and banh mi')],
        ['1_1.jpg', copy('Một góc xanh tại Highlands', 'A green corner at Highlands')],
        ['8W1A6722_1.jpg', copy('Một nụ cười từ đội ngũ Highlands', 'A smile from the Highlands team')],
        ['hco-7820-matcha-launch-dc-coco-1200x1200-1772176269241.jpg', 'MatchaĐI'],
        ['2.png', copy('Bánh mì Highlands', 'Highlands banh mi')],
        ['HLC___ngang_social_1920_x_1280_px_1_1.png', copy('Gắn kết cùng Highlands', 'Together at Highlands')],
      ].map(([file, alt]) => <a key={file} href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label={`${alt} — Instagram Highlands Coffee`}><Photo file={file} alt={alt} /><span className="hc-social-photo-link"><Arrow diagonal /></span></a>)}</div></div>
        <div className="hc-social-films"><div className="hc-social-label"><ExternalLink href={social.youtube}>YouTube</ExternalLink></div>{[
          ['highlands-film-poster.jpg', 'ByXL5WCSXys', copy('Là của chúng mình', 'It belongs to us')],
          ['highlands-drive-thru-film.jpg', 'oja_6oRIQac', copy('Một điểm hẹn. Một hành trình mới.', 'A new stop. A new journey.')],
        ].map(([file, id, title]) => <a key={id} className="hc-social-film" href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer"><div><img src={`/media/home/${file}`} alt={title} loading="lazy" decoding="async" /><span className="hc-video-play" aria-hidden="true">▶</span></div><span>{title}<Arrow diagonal /></span></a>)}</div>
      </div>
    </section>

    <section className="hc-invitation"><p className="hc-eyebrow">{copy('MỘT LỜI HẸN THÂN QUEN', 'YOUR EVERYDAY INVITATION')}</p><h2>{copy('Cà phê nhé?', 'Coffee, anyone?')}</h2><PageLink onClick={() => navigate('order')}>{copy('Chọn món bạn yêu thích', 'Find your favourite')}</PageLink></section>
  </div>;
}
