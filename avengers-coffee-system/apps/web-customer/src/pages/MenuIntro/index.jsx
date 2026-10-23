import { uiText as ui, useUiLanguage, uiLocale } from "../../lib/uiText";
import { menuCategoryLabel } from '../../lib/categoryLabels';
import { useTranslation } from 'react-i18next';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowLongRightIcon,
  ArrowLongLeftIcon,
  SparklesIcon,
  Squares2X2Icon,
  ShoppingCartIcon,
  CheckCircleIcon,
  FireIcon
} from '../../components/common/icons';

/* ────────────────────────────────────────────────────────
   THEMES PHONG CÁCH THƯƠNG MẠI SANG TRỌNG CHO DANH MỤC CHÍNH
   ──────────────────────────────────────────────────────── */
const GROUP_THEMES = {
  coffee: {
    themeKey: 'coffee',
    bg: 'linear-gradient(135deg, #421014 0%, #2b080b 100%)',
    textColor: '#ffffff',
    titleColor: '#f1d17d', // Vàng kim sang trọng
    descColor: '#f3e8df',
    accentColor: '#e5b85a',
    btnBg: 'transparent',
    btnBorder: '#e5b85a',
    btnText: '#e5b85a',
    btnHoverBg: '#e5b85a',
    btnHoverText: '#2b080b',
    title: 'CÀ PHÊ VIỆT NAM',
    badge: 'DI SẢN NGUYÊN BẢN',
    banner: '/hc-assets/web_banner_2000x2000.jpg',
    highlights: ['Hạt Robusta Buôn Ma Thuột & Arabica Cầu Đất', 'Rang mộc thủ công tiêu chuẩn', 'Chiết xuất đậm đà, hậu vị quyến rũ'],
  },
  tea: {
    themeKey: 'tea',
    bg: 'linear-gradient(145deg, #f4f8f2 0%, #e1efe1 60%, #cfe0d0 100%)',
    textColor: '#213823',
    titleColor: '#5a3212', // Nâu ấm quý phái
    descColor: '#38503b',
    accentColor: '#1d6f25',
    btnBg: 'transparent',
    btnBorder: '#5a3212',
    btnText: '#5a3212',
    btnHoverBg: '#5a3212',
    btnHoverText: '#ffffff',
    title: 'TRÀ NGUYÊN BẢN AVENGERS',
    badge: 'HƯƠNG VỊ THANH KHIẾT',
    banner: '/hc-assets/slider_1.jpg',
    highlights: ['Búp chè Shan tuyết & Matcha non Tây Bắc', 'Trái cây nhiệt đới ngọt thanh tươi mọng', 'Ủ lạnh & pha chế tươi mỗi ngày'],
  },
  freeze: {
    themeKey: 'freeze',
    bg: 'linear-gradient(145deg, #ebf6f3 0%, #ceeae4 60%, #b4ded6 100%)',
    textColor: '#15382a',
    titleColor: '#0e4d34',
    descColor: '#215641',
    accentColor: '#0e4d34',
    btnBg: 'transparent',
    btnBorder: '#0e4d34',
    btnText: '#0e4d34',
    btnHoverBg: '#0e4d34',
    btnHoverText: '#ffffff',
    title: 'FREEZE ĐÁ XAY SẢNG KHOÁI',
    badge: 'MÁT LẠNH TỘT ĐỈNH',
    banner: '/hc-assets/2.png',
    highlights: ['Đá tuyết xay siêu mịn', 'Lớp whipping cream bông mềm béo ngậy', 'Topping thạch giòn sần sật vui miệng'],
  },
  bakery: {
    themeKey: 'bakery',
    bg: 'linear-gradient(145deg, #fdf9f3 0%, #faecd9 60%, #f7dfbb 100%)',
    textColor: '#3d2813',
    titleColor: '#542c07',
    descColor: '#573e26',
    accentColor: '#7d4012',
    btnBg: 'transparent',
    btnBorder: '#542c07',
    btnText: '#542c07',
    btnHoverBg: '#542c07',
    btnHoverText: '#ffffff',
    title: 'BÁNH & ẨM THỰC CAO CẤP',
    badge: 'NƯỚNG MỚI MỖI NGÀY',
    banner: '/hc-assets/1_1.jpg',
    highlights: ['Bơ lạt & bột mì hảo hạng châu Âu', 'Cốt bánh xốp mềm thơm nức', 'Đồng hành hoàn hảo bên tách trà & cà phê'],
  },
  milktea: {
    themeKey: 'milktea',
    bg: 'linear-gradient(145deg, #fdf6ee 0%, #f7ebd9 60%, #f0dac2 100%)',
    textColor: '#3a2412',
    titleColor: '#633310',
    descColor: '#583a22',
    accentColor: '#8a4816',
    btnBg: 'transparent',
    btnBorder: '#633310',
    btnText: '#633310',
    btnHoverBg: '#633310',
    btnHoverText: '#ffffff',
    title: 'TRÀ SỮA & MACCHIATO',
    badge: 'ĐẬM ĐÀ BÉO MỊN',
    banner: '/hc-assets/slider_1.jpg',
    highlights: ['Nước cốt trà ô long & hồng trà hảo hạng', 'Sữa tươi thanh trùng thơm ngậy', 'Lớp váng sữa mằn mặn độc quyền'],
  },
  other: {
    themeKey: 'other',
    bg: 'linear-gradient(145deg, #fbf7f3 0%, #f1e7dd 60%, #e6d7c9 100%)',
    textColor: '#3a2c20',
    titleColor: '#4f311c',
    descColor: '#5a4332',
    accentColor: '#7a421e',
    btnBg: 'transparent',
    btnBorder: '#4f311c',
    btnText: '#4f311c',
    btnHoverBg: '#4f311c',
    btnHoverText: '#ffffff',
    title: 'SẢN PHẨM & QUÀ TẶNG',
    badge: 'PHONG CÁCH SỐNG HIỆN ĐẠI',
    banner: '/hc-assets/1_1.jpg',
    highlights: ['Ly giữ nhiệt & phụ kiện chính hãng', 'Thẻ quà tặng linh hoạt sang trọng', 'Topping phong phú tùy biến theo gu'],
  }
};

/* ────────────────────────────────────────────────────────
   NỘI DUNG MÔ TẢ CHI TIẾT (4 - 6 DÒNG) CHO TỪNG LOẠI
   ──────────────────────────────────────────────────────── */
const CATEGORY_DESCRIPTIONS = {
  // === DANH MỤC CHÍNH (LEVEL 1 & BANNER LEVEL 2) ===
  tea_parent: {
    vi: "Khởi nguồn từ những đồi chè trù phú của vùng cao nguyên Tây Bắc và Lâm Đồng quanh năm sương phủ, từng lá trà tươi non được tuyển chọn thủ công vào sáng sớm tinh mơ để lưu giữ trọn vẹn hương vị thanh khiết nhất của đất trời. Avengers Coffee tự hào mang đến bộ sưu tập trà đa dạng từ trà Shan tuyết cổ thụ đậm đà, trà trái cây nhiệt đới ngọt thanh tươi mát cho đến trà sữa macchiato béo mịn êm dịu. Mỗi ngụm trà không chỉ đánh thức mọi giác quan với sắc nước trong veo và hương thảo mộc tự nhiên, mà còn mang lại cảm giác an yên, sảng khoái diệu kỳ giữa nhịp sống hiện đại hối hả.",
    en: "Sourced from misty highland tea estates of Northwest Vietnam and Lam Dong, every tender leaf is handpicked at dawn to preserve the purest natural essence of the land. Avengers Coffee proudly crafts an exceptional tea collection, ranging from ancient wild Shan Tuyết tea with subtle herbal notes, vibrant fruit teas bursting with tropical sweetness, to velvety creamy macchiato teas. Each sip reawakens your senses with crystalline brew and lingering natural floral notes, delivering a refreshing sense of balance and calm amidst the hustle of everyday life."
  },
  coffee_parent: {
    vi: "Được kết tinh từ niềm đam mê bất tận với hạt cà phê Việt Nam, chúng tôi khắt khe tuyển chọn những hạt Robusta Buôn Ma Thuột trứ danh với vị đắng đậm đà hòa quyện cùng hạt Arabica Cầu Đất thơm nồng nàn hương hoa quả. Từng mẻ hạt được rang mộc theo tiêu chuẩn thủ công tỉ mỉ để giữ trọn vẹn lớp dầu tự nhiên quý giá cùng hương thơm quyến rũ khó cưỡng. Dù bạn yêu thích phong vị cà phê phin truyền thống sánh đậm, chút hiện đại tinh tế của tách Espresso chuẩn gu Ý hay sự êm dịu từ ly Latte sữa tươi mềm mịn, Avengers Coffee luôn sẵn sàng mang đến cho bạn nguồn năng lượng khởi đầu một ngày mới đầy cảm hứng và nhiệt huyết.",
    en: "Born from a deep passion for Vietnamese coffee heritage, we meticulously select the finest Robusta beans from Buôn Ma Thuột known for their bold earthy richness, blended harmoniously with aromatic Arabica from highland Cầu Đất. Roasted in small craft batches to lock in natural oils and complex aromas, every cup offers an unforgettable tasting journey. Whether you cherish the authentic drip-phin tradition, the intense crema of an Italian-style espresso, or the smooth velvet comfort of a freshly poured latte, Avengers Coffee delivers a powerful boost of creative inspiration for your day."
  },
  freeze_parent: {
    vi: "Là món quà giải nhiệt sảng khoái tột đỉnh dành cho những ngày oi bức, dòng thức uống Freeze của Avengers Coffee là bản giao hưởng hoàn hảo giữa đá tuyết xay mịn màng cùng các nguyên liệu thượng hạng như cà phê đậm đà, bột trà xanh matcha cao cấp hay sô-cô-la nguyên chất nồng nàn. Điểm nhấn làm nên sự lôi cuốn khó chối từ chính là lớp kem tươi whipping cream đánh bông mềm mịn như mây phủ phía trên, kết hợp cùng các tầng thạch giòn sần sật vui miệng. Thưởng thức một ly Freeze đá xay là bước vào chuyến phiêu lưu vị giác tươi mát, đầy phấn khích và ngọt ngào bất tận.",
    en: "The ultimate ice-cold indulgence for sunny days, our Freeze blended collection combines ultra-fine shaved ice with premium ingredients like rich espresso, ceremonial matcha, or intense bittersweet chocolate. Crowned with a cloud-like swirl of freshly whipped velvety cream and layered with delightfully chewy specialty jelly, every sip delivers a burst of frosty texture and captivating flavors. Treat yourself to a truly refreshing, playful, and uplifting drink experience designed to cool you down instantly."
  },
  bakery_parent: {
    vi: "Mỗi chiếc bánh và món ăn nhẹ tại Avengers Coffee đều được nướng tươi mới mỗi ngày bởi bàn tay của các đầu bếp giàu tâm huyết, tuân thủ tiêu chuẩn nguyên liệu sạch và an toàn hàng đầu. Sự kết hợp giữa cốt bánh xốp mềm thơm mùi bơ lạt hảo hạng cùng các loại sốt béo ngậy, phô mai kéo sợi hay mứt trái cây chua ngọt tự nhiên tạo nên hương vị thăng hoa tròn vẹn. Đây là người bạn đồng hành không thể thiếu bên tách cà phê thơm hay ly trà mát lành, tiếp thêm nguồn năng lượng dồi dào và làm phong phú thêm những buổi chuyện trò kết nối cùng người thân yêu.",
    en: "Every pastry and light bite at Avengers Coffee is freshly baked daily with pure passion, using clean, premium ingredients and European-standard butter. From buttery flaky croissants with melted artisan cheeses to delicate mousse cakes layered with natural fruit compote, our menu is crafted to complement your favorite beverage flawlessly. Take time to pause, savor every wholesome bite, and elevate your cozy coffee breaks with unforgettable flavors."
  },
  milktea_parent: {
    vi: "Hòa quyện giữa nước cốt trà tuyển chọn ủ tươi mỗi ngày và sữa tươi tiệt trùng thanh mát, dòng trà sữa của Avengers Coffee mang đến độ béo thanh dịu mà không hề ngấy ngọt, giữ trọn vị chát mượt mà đặc trưng nơi cuống họng. Đi kèm là lớp milk foam macchiato phô mai mằn mặn bông xốp độc quyền, tạo nên sự tương phản vị giác đầy lôi cuốn ngay từ ngụm đầu tiên. Kết hợp cùng những hạt trân châu hoàng kim dẻo dai và thạch củ năng giòn tan, đây chính là thức uống chân ái khơi dậy niềm vui và năng lượng tích cực cho bạn mỗi ngày.",
    en: "A delightful harmony of freshly steeped whole-leaf tea and premium silky milk, our Milk Tea & Macchiato series offers a perfectly balanced creaminess that complements the tea's subtle tannins without being overly sweet. Topped with our signature lightly salted velvet cheese foam, every sip delivers an irresistible dance of sweet, rich, and savory notes. Paired with chewy golden boba or crunchy water chestnut pearls, it is the ultimate comfort drink to lift your spirits."
  },
  savory_parent: {
    vi: "Dành cho những bữa lót dạ nhanh chóng nhưng vẫn ngập tràn dinh dưỡng, dòng bánh mặn Avengers Coffee kết hợp hoàn hảo giữa vỏ bánh nướng vàng ruộm giòn rụm và phần nhân đậm đà từ thịt nguội, phô mai chảy tan, xúc xích tiêu đen cùng chà bông thơm lừng. Được làm nóng trực tiếp ngay khi gọi món, hương thơm quyến rũ ngào ngạt lan tỏa sẽ lập tức khơi gợi cảm giác thèm ăn. Đây là giải pháp ẩm thực lý tưởng giúp bạn nạp nhanh năng lượng cho những giờ làm việc tập trung hoặc buổi gặp gỡ bạn bè tiện lợi.",
    en: "Crafted for quick yet satisfying snacks, our savory bakery line brings golden crispy crusts packed with savory fillings like cured ham, melted mozzarella, smoked sausage, and savory pork floss. Heated fresh to order, the mouthwatering aroma fills the air, offering the perfect warm fuel to keep you energized through productive study hours or spontaneous friendly catch-ups."
  },
  giftcard_parent: {
    vi: "Gửi gắm trọn vẹn tình cảm, sự tri ân và những khoảnh khắc sẻ chia ấm áp đến người thân, bạn bè hay đối tác thông qua Thẻ Quà Tặng Avengers Coffee sang trọng. Với thiết kế tinh tế hiện đại cùng nhiều mệnh giá linh hoạt, người nhận có thể dễ dàng sử dụng để thưởng thức bất kỳ món đồ uống hay món bánh yêu thích nào trên toàn hệ thống cửa hàng. Đây không chỉ là một món quà tiện ích mà còn là lời mời gọi chân thành cùng nhau tận hưởng những phút giây thư giãn và gắn kết đáng nhớ bên tách cà phê thơm.",
    en: "Express your heartfelt appreciation, love, and warm wishes to friends, family, or colleagues with an elegant Avengers Coffee Gift Card. Featuring modern designs and flexible denominations, recipients can freely redeem their favorite drinks and treats across our nationwide network. More than just a thoughtful token, it is an open invitation to share precious moments and connect over handcrafted beverages."
  },
  other_parent: {
    vi: "Khám phá thế giới phụ kiện và sản phẩm lưu niệm độc quyền mang đậm dấu ấn phong cách sống của Avengers Coffee, từ ly giữ nhiệt cao cấp, bình nước thời trang cho đến các loại topping tươi ngon bổ sung cho ly nước của bạn. Mỗi sản phẩm đều được chọn lọc kỹ càng về độ bền, tính thẩm mỹ và thân thiện với môi trường, giúp bạn lưu giữ kỷ niệm đẹp và nâng tầm trải nghiệm thưởng thức cà phê mỗi ngày ở bất cứ nơi đâu.",
    en: "Explore our exclusive lifestyle merchandise and accessories, from sleek insulated tumblers and eco-friendly tote bags to extra customizable toppings. Each item is thoughtfully selected for premium quality, aesthetic elegance, and daily convenience, allowing you to carry the spirited coffee lifestyle wherever you go."
  },

  // === DANH MỤC CON CHI TIẾT (LEVEL 2 & LEVEL 3 PRODUCT DISCOVERY) ===
  matcha: {
    vi: "Tuyển chọn từ những đọt búp chè tươi non mơn mởn của vùng cao nguyên sương phủ Tây Bắc, kết hợp cùng kỹ thuật nghiền đá truyền thống để giữ trọn vẹn sắc xanh ngọc bích tự nhiên và hàm lượng chất chống oxy hóa dồi dào. Hương thơm thanh khiết của mầm trà hòa quyện cùng sữa tươi béo ngậy hoặc sữa hạt yến mạch thanh lành, tạo nên kết cấu sánh mịn như lụa. Vị chát êm dịu nơi đầu lưỡi nhường chỗ cho hậu vị ngọt dịu sâu lắng, mang đến cảm giác thanh tịnh cho tâm hồn và nguồn năng lượng tỉnh táo, sảng khoái suốt ngày dài.",
    en: "Finely stone-ground from shade-grown highland tea shoots in Northwest Vietnam, our matcha preserves an exquisite emerald green hue and high antioxidant vitality. Blended seamlessly with rich fresh milk or silky oat milk, it produces a luxurious velvet texture with balanced grassy sweetness and gentle pleasant astringency, offering peaceful mental focus and revitalizing vitality throughout the day."
  },
  shan: {
    vi: "Chắt lọc tinh hoa từ những cây chè Shan tuyết cổ thụ trăm năm tuổi mọc hoang dã trên những dãy núi đá cao ngút ngàn của rẻo cao Tây Bắc, nơi quanh năm mây mù bao phủ và hấp thụ linh khí đất trời. Những búp trà phủ lớp lông tơ trắng muốt được người bản địa sao suốt thủ công tỉ mỉ bằng chảo gang, tạo nên màu nước vàng óng trong veo cùng hương thơm hoa rừng hoang sơ quyến rũ. Vị chát dịu thanh thoát lan tỏa nhanh, để lại hậu ngọt sâu lắng kéo dài trong vòm họng, là trải nghiệm trà đạo đỉnh cao khó phai mờ.",
    en: "Harvested from ancient tea trees aged over hundreds of years in the remote mountainous peaks of Northwest Vietnam, bathed in perpetual mist and pristine alpine air. The tender buds, cloaked in downy white fuzz, are hand-roasted in cast-iron pans to produce a luminous amber liquor with captivating aromas of wild blossoms. The initial gentle tannin yields to a profoundly sweet, lingering finish that honors Vietnam's centuries-old tea heritage."
  },
  traicay: {
    vi: "Sự kết hợp bùng nổ đầy sắc màu giữa nền cốt trà thanh nhẹ hảo hạng và những loại trái cây nhiệt đới tươi mọng như đào giòn, vải thiều chín mọng, dâu tây ngọt lành và hạt sen thanh mát. Vị chua ngọt tự nhiên cân bằng hoàn hảo, hòa quyện cùng các loại thạch giòn sần sật mang đến cảm giác mát rượi sảng khoái tức thì ngay từ ngụm đầu tiên. Đây là lựa chọn lý tưởng để nạp đầy vitamin tự nhiên, xua tan cơn khát ngày hè và thắp sáng tâm trạng hứng khởi cho mọi cuộc hẹn hò.",
    en: "A vibrant fusion of freshly brewed delicate whole-leaf tea and lush tropical fruits like juicy peaches, ripe lychees, fresh strawberries, and crunchy lotus seeds. The harmonious sweet-tart balance coupled with bouncy fruit jellies delivers an immediate wave of chilled refreshment, recharging your body with natural vitality and brightening every afternoon gathering."
  },
  trasua: {
    vi: "Được nấu từ lá trà đen và trà ô long thượng hạng ủ theo tỉ lệ vàng, kết hợp cùng dòng sữa tươi thanh trùng béo ngậy tạo nên kết cấu mịn màng và độ thơm bùi đậm đà khó cưỡng. Hương thơm trà nồng nàn không hề bị lấn át bởi vị ngọt, mà nâng đỡ nhau tạo nên sự hài hòa tuyệt đối. Thêm chút trân châu hoàng kim dai mềm hoặc thạch phô mai béo ngậy, ly trà sữa Avengers mang đến niềm vui ngọt ngào thân quen nhưng ở một chuẩn mực tinh tế và đẳng cấp hơn.",
    en: "Brewed from fine black tea and aromatic oolong leaves steeped to golden perfection, then paired with rich pasteurized milk for a silky, comforting mouthfeel. The distinct tea fragrance shines through with natural poise, beautifully enriched by soft chewy golden pearls or delicate egg pudding to create a luxurious everyday treat."
  },
  phin: {
    vi: "Biểu tượng văn hóa bất hủ của người Việt Nam được nâng tầm qua từng giọt cà phê chắt chiu từ chiếc phin nhôm truyền thống. Từng giọt cà phê rơi chậm rãi trên lớp sữa đặc ngọt bùi, tỏa ra hương thơm nồng nàn ấm áp đánh thức mọi giác quan. Vị đắng đậm đà mộc mạc của hạt Robusta kết hợp cùng vị béo ngậy của sữa mang đến dư vị khó quên, gợi nhắc về những góc phố quen, những câu chuyện hàn huyên không hồi kết và nhịp sống trầm mặc đầy chất thơ của người Sài Gòn.",
    en: "A timeless icon of Vietnamese lifestyle, meticulously brewed drop by drop through traditional aluminum drip filters. Slow drips fall gently onto a sweet layer of condensed milk, releasing a deep, smoky, cocoa aroma that instantly sparks your morning. Bold, full-bodied, and deeply satisfying, this classic phin brew evokes warm nostalgia and genuine connection over honest conversations."
  },
  espresso: {
    vi: "Được chiết xuất dưới áp suất tiêu chuẩn 9 bar từ máy pha chuyên nghiệp chuẩn Ý, phối trộn tỷ lệ hoàn hảo giữa Arabica Cầu Đất thơm hương hoa quả và Robusta Buôn Ma Thuột đậm đà. Mỗi tách Espresso sở hữu lớp crema dày dặn vàng óng như mật ong, lưu giữ trọn vẹn hương vị nồng nàn của hạt dẻ rang, sô-cô-la đen và caramel cháy. Thưởng thức nóng nguyên bản để cảm nhận trọn vẹn sức mạnh nội tại và sự bừng tỉnh của trí tuệ trong từng giọt tinh chất cà phê cô đọng.",
    en: "Extracted under precise 9-bar pressure on professional Italian espresso machines, combining floral highland Arabica with robust lowland Robusta beans. Each shot boasts a thick golden crema with layered notes of roasted hazelnut, dark cacao, and bittersweet caramel. Savor it pure as a bold espresso to experience the purest intensity and awakening mental clarity in every drop."
  },
  americano: {
    vi: "Sự kết hợp thanh tao giữa những shot Espresso đậm đà chiết xuất áp suất cao và dòng nước tinh khiết tạo nên một ly Americano trong trẻo, nhẹ nhàng nhưng vẫn giữ nguyên tầng hương phong phú. Vị đắng dịu êm, thoang thoảng nốt hương hạt rang và sô-cô-la đen giúp bạn dễ dàng thưởng thức suốt cả ngày mà không hề bị gắt họng. Lựa chọn uống nóng để giữ ấm cơ thể hoặc dùng đá mát lạnh để giải nhiệt tức thì, tiếp thêm nguồn năng lượng sảng khoái và tập trung tối đa.",
    en: "A graceful union of bold high-pressure espresso shots and purified water, crafting a clean, crisp Americano that preserves rich coffee notes without being overwhelming. With mild bitterness and aromatic undertones of roasted nuts and dark cocoa, it is perfect for all-day sipping. Enjoy hot to soothe the senses or iced for an invigorating, clean energy boost that sharpens your focus."
  },
  latte: {
    vi: "Nghệ thuật hòa trộn tinh tế giữa một shot Espresso đậm đà và dòng sữa tươi được đánh bọt nóng bằng vòi hơi áp suất cao để tạo thành lớp micro-foam mịn như nhung. Vị đắng nhẹ quyện chặt cùng vị ngọt béo tự nhiên của sữa, tạo nên cảm giác ấm áp và dịu dàng đến nao lòng. Bề mặt ly cà phê được điểm xuyết bởi những hình vẽ Latte Art điêu luyện của các barista tài hoa, biến mỗi tách cà phê thành một tác phẩm nghệ thuật nhỏ xinh nâng niu từng khoảnh khắc thư giãn của bạn.",
    en: "The delicate artistry of combining intense espresso shots with steamed whole milk textured into silky, velvet micro-foam. The gentle coffee notes weave effortlessly through sweet, warm milk notes, finished with skilled latte art on top. A truly soothing beverage designed to bring coziness and peaceful focus to your creative sessions."
  },
  coldbrew: {
    vi: "Phương pháp ủ lạnh thủ công khép kín suốt 16 đến 24 giờ trong nước tinh khiết lạnh giúp chiết xuất trọn vẹn những nốt hương hoa quả tinh túy nhất của hạt Arabica cao nguyên mà không làm tăng vị chua gắt hay đắng chát. Kết quả là một loại cà phê trong trẻo, mượt mà và ít axit, với hương thơm thoang thoảng của mật ong rừng, vỏ cam chín mọng và rượu vang thanh lịch. Uống cùng một viên đá tròn lớn, Cold Brew mang lại trải nghiệm thưởng thức cà phê tinh tế, sảng khoái và cực kỳ dễ chịu.",
    en: "Slow-steeped in cold filtered water for 16 to 24 hours in sealed glass vessels, this gentle extraction coaxes out natural fruity sweetness without bitterness or excess acidity. Silky smooth, light on the stomach, and infused with subtle notes of citrus zest, wild honey, and delicate floral wine, our Cold Brew is the epitome of modern coffee sophistication."
  },
  frappe: {
    vi: "Thức uống đá tuyết sảng khoái bùng nổ năng lượng với kết cấu mịn màng như kem, hòa quyện từ cà phê espresso thơm lừng, trà xanh matcha Tây Bắc thanh mát hoặc sô-cô-la Bỉ nguyên chất đậm đà. Phủ trên đỉnh ly là chóp kem tươi whipping cream béo ngậy được đánh bông mềm mịn, rắc thêm sốt caramel ngọt ngào hoặc bột cacao đắng nhẹ. Mỗi ngụm mang đến luồng gió lạnh sảng khoái xua tan nắng nóng gay gắt, kích thích vị giác và tiếp thêm cảm hứng tươi vui.",
    en: "A sensational ice-blended beverage featuring snow-fine blended ice swirling with rich espresso, ceremonial green tea, or authentic bittersweet cocoa. Topped with a glorious spiral of fluffy whipped cream and drizzled with artisan caramel sauce, this frost-kissed treat refreshes your senses and powers your afternoon with joy."
  },
  banhngot: {
    vi: "Bộ sưu tập bánh ngọt thủ công cao cấp được chuẩn bị tỉ mỉ từ những nguyên liệu bơ sữa và bột mì hảo hạng theo tiêu chuẩn châu Âu. Từ những chiếc bánh mousse mềm mịn tan ngay trên đầu lưỡi, tiramisu thơm nồng vị cà phê cho đến những lát bánh phô mai nướng béo ngậy điểm xuyết mứt dâu tây mọng nước. Sự kết hợp hoàn hảo giữa vị ngọt thanh tao và hương vị tinh tế tạo nên người bạn đồng hành lý tưởng cho tách cà phê hoặc ly trà chiều của bạn.",
    en: "An artisan sweet bakery collection prepared daily with European butter and wholesome flour. From melt-in-your-mouth mousse cakes and coffee-infused tiramisu to golden layered cheesecakes topped with fresh berry compote, each piece is baked to golden perfection to accompany your daily beverage."
  },
  banhman: {
    vi: "Dành cho những bữa lót dạ nhanh chóng nhưng vẫn ngập tràn dinh dưỡng, dòng bánh mặn Avengers Coffee kết hợp hoàn hảo giữa vỏ bánh nướng vàng ruộm giòn rụm và phần nhân đậm đà từ thịt nguội, phô mai chảy tan, xúc xích tiêu đen cùng chà bông thơm lừng. Được làm nóng trực tiếp ngay khi gọi món, hương thơm quyến rũ ngào ngạt lan tỏa sẽ lập tức khơi gợi cảm giác thèm ăn, là nguồn năng lượng kịp thời cho ngày dài năng động.",
    en: "Crafted for quick yet satisfying snacks, our savory bakery line brings golden crispy crusts packed with savory fillings like cured ham, melted mozzarella, smoked sausage, and savory pork floss. Heated fresh to order, the mouthwatering aroma fills the air, offering the perfect warm fuel to keep you energized through productive hours."
  },
  pizzapasta: {
    vi: "Những món ăn chuẩn vị Âu nóng hổi với đế bánh pizza nướng giòn rụm bên ngoài nhưng mềm xốp bên trong, phủ ngập phô mai mozzarella kéo sợi béo ngậy cùng sốt cà chua thảo mộc thơm lừng. Mì pasta dai ngon vừa độ quyện sốt kem nấm béo bùi hay sốt bò bằm đậm đà, mang đến bữa ăn trọn vẹn, giàu dinh dưỡng cho bữa trưa nhanh gọn hoặc bữa tối ấm cúng cùng bạn bè và đồng nghiệp.",
    en: "Hot, oven-baked personal pizzas with crispy golden crusts generously layered with stretchy mozzarella cheese and fragrant herb tomato sauce, alongside al dente pasta smothered in savory Bolognese or rich cream sauce. A hearty, flavorful lunch or dinner option made fresh to order."
  },
  banhtrungthu: {
    vi: "Tuyệt tác giao thoa giữa nghệ thuật làm bánh cổ truyền và phong vị hiện đại, bánh trung thu Avengers Coffee được đúc kết từ những nguyên liệu tinh hoa nhất. Lớp vỏ bánh nướng mỏng tang vàng ươm ôm trọn nhân thập cẩm thượng hạng, trà xanh matcha hạt sen thanh nhã hay hạt dẻ thơm bùi kết hợp cùng trứng muối vàng óng béo ngậy. Đây là món quà trân quý mang trọn vẹn lời chúc sum vầy, an khang và thịnh vượng gửi đến những người thân yêu nhất.",
    en: "A sublime fusion of traditional mooncake craftsmanship and contemporary flavors, baked from exquisite ingredients. Golden delicate crusts encase rich premium fillings from matcha lotus seed, roasted chestnuts, to decadent savory salted yolks, symbolizing family reunion and warm blessings for the festive season."
  },
  merchandise: {
    vi: "Bộ sưu tập ly giữ nhiệt, bình nước thể thao và phụ kiện thời trang chính hãng của Avengers Coffee với chất liệu thép không gỉ cao cấp, an toàn cho sức khỏe và khả năng giữ nhiệt vượt trội lên đến 12 giờ. Thiết kế tối giản, tinh tế mang đậm hơi thở thành thị hiện đại giúp bạn tự tin thể hiện phong cách sống năng động, đồng thời chung tay giảm thiểu rác thải nhựa để bảo vệ hành tinh xanh.",
    en: "Our official collection of insulated tumblers, bottles, and eco-friendly accessories crafted from premium food-grade stainless steel with 12-hour temperature retention. Sleek minimalist designs reflect your modern lifestyle while actively supporting sustainable environmental protection."
  },
  topping: {
    vi: "Đa dạng các loại topping tươi mới làm tăng thêm phần thú vị cho từng ly nước yêu thích của bạn, từ trân châu hoàng kim dai dẻo, thạch củ năng giòn ngọt thanh tao cho đến thạch cà phê thơm nồng và lớp váng sữa macchiato béo mặn tuyệt đỉnh. Tất cả topping đều được chế biến và bảo quản tươi mới trong ngày theo tiêu chuẩn vệ sinh nghiêm ngặt, mang đến trải nghiệm thưởng thức trọn vẹn và đậm chất riêng.",
    en: "Elevate your favorite drink with our fresh, artisanal toppings, from soft chewy golden boba and crisp water chestnut pearls to aromatic coffee jelly and rich salted cheese macchiato foam. Prepared fresh daily under strict quality standards to add irresistible fun and texture to every sip."
  }
};

function getGroupThemeKey(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('cà phê') || n.includes('coffee') || n.includes('ca phe')) return 'coffee';
  if (n.includes('trà sữa') || n.includes('milk tea')) return 'milktea';
  if (n.includes('trà') || n.includes('tea') || n.includes('tra')) return 'tea';
  if (n.includes('đá xay') || n.includes('freeze') || n.includes('da xay') || n.includes('frappe')) return 'freeze';
  if (n.includes('bánh mặn') || n.includes('savoury') || n.includes('ăn nhẹ')) return 'savory';
  if (n.includes('bánh') || n.includes('bakery') || n.includes('đồ ăn') || n.includes('pizza') || n.includes('pasta')) return 'bakery';
  if (n.includes('thẻ quà') || n.includes('gift')) return 'giftcard';
  return 'other';
}

function getCategoryDescription(name, lang = 'vi', groupThemeKey = '') {
  const n = String(name || '').toLowerCase();
  let item = null;

  // 1. Khớp cụ thể danh mục con
  if (n.includes('matcha')) item = CATEGORY_DESCRIPTIONS.matcha;
  else if (n.includes('shan')) item = CATEGORY_DESCRIPTIONS.shan;
  else if (n.includes('trái cây') || n.includes('trai cay') || n.includes('fruit')) item = CATEGORY_DESCRIPTIONS.traicay;
  else if (n.includes('trà sữa') || n.includes('tra sua') || n.includes('milk tea')) item = CATEGORY_DESCRIPTIONS.trasua;
  else if (n.includes('phin')) item = CATEGORY_DESCRIPTIONS.phin;
  else if (n.includes('espresso')) item = CATEGORY_DESCRIPTIONS.espresso;
  else if (n.includes('americano')) item = CATEGORY_DESCRIPTIONS.americano;
  else if (n.includes('latte') || n.includes('cappuccino')) item = CATEGORY_DESCRIPTIONS.latte;
  else if (n.includes('cold brew') || n.includes('coldbrew')) item = CATEGORY_DESCRIPTIONS.coldbrew;
  else if (n.includes('frappe') || n.includes('đá xay') || n.includes('da xay') || n.includes('freeze')) item = CATEGORY_DESCRIPTIONS.frappe;
  else if (n.includes('bánh ngọt') || n.includes('cake') || n.includes('mousse')) item = CATEGORY_DESCRIPTIONS.banhngot;
  else if (n.includes('bánh mặn') || n.includes('savoury') || n.includes('mặn & ăn nhẹ')) item = CATEGORY_DESCRIPTIONS.banhman;
  else if (n.includes('pizza') || n.includes('pasta')) item = CATEGORY_DESCRIPTIONS.pizzapasta;
  else if (n.includes('trung thu') || n.includes('mooncake')) item = CATEGORY_DESCRIPTIONS.banhtrungthu;
  else if (n.includes('merchandise') || n.includes('ly') || n.includes('bình')) item = CATEGORY_DESCRIPTIONS.merchandise;
  else if (n.includes('topping')) item = CATEGORY_DESCRIPTIONS.topping;
  else if (n.includes('thẻ quà') || n.includes('gift')) item = CATEGORY_DESCRIPTIONS.giftcard_parent;

  if (item) return lang === 'en' ? item.en : item.vi;

  // 2. Khớp danh mục cha theo themeKey hoặc tên
  const theme = groupThemeKey || getGroupThemeKey(name);
  if (theme === 'coffee') item = CATEGORY_DESCRIPTIONS.coffee_parent;
  else if (theme === 'tea') item = CATEGORY_DESCRIPTIONS.tea_parent;
  else if (theme === 'freeze') item = CATEGORY_DESCRIPTIONS.freeze_parent;
  else if (theme === 'milktea') item = CATEGORY_DESCRIPTIONS.milktea_parent;
  else if (theme === 'savory') item = CATEGORY_DESCRIPTIONS.savory_parent;
  else if (theme === 'bakery') item = CATEGORY_DESCRIPTIONS.bakery_parent;
  else if (theme === 'giftcard') item = CATEGORY_DESCRIPTIONS.giftcard_parent;
  else item = CATEGORY_DESCRIPTIONS.other_parent;

  return lang === 'en' ? item.en : item.vi;
}

function getProductCategoryId(p) {
  return String(p?.danhMuc?.ma_danh_muc || p?.ma_danh_muc || '');
}

/* ────────────────────────────────────────────────────────
   THẺ SẢN PHẨM CAO CẤP (PREMIUM PRODUCT CARD)
   Tăng kích thước, hình ảnh to rõ, badge & nút thao tác đẹp mắt
   ──────────────────────────────────────────────────────── */
function PremiumProductCard({ product, onSelect, lang }) {
  const isOneLiter = /1\s*lít|1l/i.test(product.ten_san_pham);
  const isHot = /nóng|hot/i.test(product.ten_san_pham);
  const isNew = /mới|new|dâu/i.test(product.ten_san_pham);

  return (
    <div
      onClick={() => onSelect?.(product)}
      style={{
        background: '#ffffff',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid #ede5d8',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 18px rgba(74, 55, 40, 0.05)',
        transition: 'all 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-6px)';
        e.currentTarget.style.boxShadow = '0 16px 36px rgba(178, 40, 48, 0.12)';
        e.currentTarget.style.borderColor = '#d8c2b5';
        const img = e.currentTarget.querySelector('.prod-card-img');
        if (img) img.style.transform = 'scale(1.08)';
        const btn = e.currentTarget.querySelector('.prod-order-btn');
        if (btn) {
          btn.style.background = '#8c1f25';
          btn.style.color = '#ffffff';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 18px rgba(74, 55, 40, 0.05)';
        e.currentTarget.style.borderColor = '#ede5d8';
        const img = e.currentTarget.querySelector('.prod-card-img');
        if (img) img.style.transform = 'scale(1)';
        const btn = e.currentTarget.querySelector('.prod-order-btn');
        if (btn) {
          btn.style.background = '#fcf8f5';
          btn.style.color = '#b22830';
        }
      }}
    >
      {/* Vùng ảnh sản phẩm lớn & nổi bật */}
      <div style={{
        height: '210px',
        position: 'relative',
        background: 'radial-gradient(circle at center, #faf6f0 0%, #f3ede2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflow: 'hidden',
      }}>
        {/* Badges nhãn dán góc ảnh */}
        <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {isOneLiter && (
            <span style={{
              background: 'linear-gradient(135deg, #e65100 0%, #ff8f00 100%)',
              color: '#ffffff',
              fontSize: '10.5px',
              fontWeight: 800,
              padding: '3px 9px',
              borderRadius: '20px',
              letterSpacing: '0.5px',
              boxShadow: '0 2px 8px rgba(230, 81, 0, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span>★</span> 1 LÍT
            </span>
          )}
          {isHot && (
            <span style={{
              background: '#b22830',
              color: '#ffffff',
              fontSize: '10.5px',
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: '20px',
              letterSpacing: '0.5px',
              boxShadow: '0 2px 8px rgba(178, 40, 48, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}>
              <FireIcon style={{ width: '12px', height: '12px' }} /> NÓNG
            </span>
          )}
        </div>

        {isNew && !isOneLiter && (
          <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2 }}>
            <span style={{
              background: '#1b5e20',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '20px',
              letterSpacing: '0.5px',
              boxShadow: '0 2px 8px rgba(27, 94, 32, 0.25)',
            }}>
              MỚI
            </span>
          </div>
        )}

        <img
          loading="lazy"
          decoding="async"
          src={product.hinh_anh_url}
          alt={product.ten_san_pham}
          className="prod-card-img"
          style={{
            maxWidth: '85%',
            maxHeight: '175px',
            objectFit: 'contain',
            transition: 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.08))',
          }}
        />
      </div>

      {/* Thông tin sản phẩm */}
      <div style={{ padding: '16px 18px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#8c7766', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Avengers Coffee
          </span>
          <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#b22830' }}></span>
          <span style={{ fontSize: '11px', color: '#1b5e20', fontWeight: 600 }}>Thượng hạng</span>
        </div>

        <h3 style={{
          fontSize: '15.5px',
          fontWeight: 700,
          color: '#3c2415',
          margin: '0 0 14px',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: '44px',
          fontFamily: "var(--font-sans)",
        }}>
          {product.ten_san_pham}
        </h3>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #f2ebe2' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#8c7766', fontWeight: 500 }}>{lang === 'en' ? 'Price' : 'Giá bán'}</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#b22830', letterSpacing: '-0.3px' }}>
              {Number(product.gia_ban).toLocaleString(uiLocale())}
              <span style={{ fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>đ</span>
            </div>
          </div>

          <button
            type="button"
            className="prod-order-btn"
            style={{
              padding: '8px 16px',
              background: '#fcf8f5',
              border: '1px solid #e8dbcc',
              borderRadius: '24px',
              color: '#b22830',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.25s ease',
            }}
          >
            <ShoppingCartIcon style={{ width: '14px', height: '14px' }} />
            <span>{lang === 'en' ? 'Order' : 'Đặt món'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   CAROUSEL SẢN PHẨM KHÁM PHÁ (AUTOPLAY SLIDER CẤP 3)
   ──────────────────────────────────────────────────────── */
function AutoPlayProductCarousel({ items, onSelect, lang }) {
  useUiLanguage();
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(3);
  const timerRef = useRef(null);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= 600) setPerPage(1);
      else if (window.innerWidth <= 960) setPerPage(2);
      else setPerPage(3); // 3 thẻ rộng rãi, ảnh to rõ ràng
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));

  const startAutoPlay = () => {
    stopAutoPlay();
    if (totalPages > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timerRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          setPage(prev => (prev + 1) % totalPages);
        }
      }, 5500);
    }
  };

  const stopAutoPlay = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => {
    setPage(prev => Math.min(prev, totalPages - 1));
    startAutoPlay();
    return () => stopAutoPlay();
  }, [totalPages, perPage]);

  const visible = items.slice(page * perPage, page * perPage + perPage);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={stopAutoPlay}
      onMouseLeave={startAutoPlay}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${perPage}, 1fr)`,
        gap: '22px'
      }}>
        {visible.map(p => (
          <PremiumProductCard
            key={p.ma_san_pham}
            product={p}
            onSelect={onSelect}
            lang={lang}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '28px',
          paddingTop: '16px',
          borderTop: '1px solid #f2ebe2',
        }}>
          <span style={{ fontSize: '13px', color: '#8c7766', fontWeight: 600 }}>
            {lang === 'en' ? `Page ${page + 1} of ${totalPages}` : `Trang ${page + 1} / ${totalPages} (${items.length} món)`}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              onClick={() => {
                setPage(prev => (prev - 1 + totalPages) % totalPages);
                stopAutoPlay();
              }}
              aria-label="Previous"
              style={{
                width: '42px', height: '42px', borderRadius: '50%',
                border: '1px solid #dcd3c5',
                background: '#ffffff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#4a3728',
                boxShadow: '0 2px 8px rgba(74, 55, 40, 0.06)',
                transition: 'all 0.25s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#b22830';
                e.currentTarget.style.color = '#b22830';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#dcd3c5';
                e.currentTarget.style.color = '#4a3728';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <ChevronLeftIcon style={{ width: '18px', height: '18px' }} />
            </button>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Go to slide ${idx + 1}`}
                  onClick={() => {
                    setPage(idx);
                    stopAutoPlay();
                  }}
                  style={{
                    width: idx === page ? '28px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    background: idx === page ? '#b22830' : '#dcd3c5',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setPage(prev => (prev + 1) % totalPages);
                stopAutoPlay();
              }}
              aria-label="Next"
              style={{
                width: '42px', height: '42px', borderRadius: '50%',
                border: '1px solid #dcd3c5',
                background: '#ffffff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#4a3728',
                boxShadow: '0 2px 8px rgba(74, 55, 40, 0.06)',
                transition: 'all 0.25s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#b22830';
                e.currentTarget.style.color = '#b22830';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#dcd3c5';
                e.currentTarget.style.color = '#4a3728';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <ChevronRightIcon style={{ width: '18px', height: '18px' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT: MenuIntroPage
   ════════════════════════════════════════════════════════ */
export default function MenuIntroPage({
  categories = [],
  products = [],
  activeCategoryId = 'all',
  onCategoryChange,
  onOrderProduct
}) {
  useUiLanguage();
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const copy = (vi, en) => lang === 'en' ? en : vi;
  const categoryLabel = name => menuCategoryLabel(name, lang);

  const [viewMode, setViewMode] = useState('carousel'); // 'carousel' | 'grid'

  const parentCategories = useMemo(() => {
    return categories.filter(c => c.cap_bac === 1 || !c.ma_danh_muc_cha);
  }, [categories]);

  const dynamicBigGroups = useMemo(() => {
    return parentCategories.map(parent => {
      const themeKey = getGroupThemeKey(parent.ten_danh_muc);
      const theme = GROUP_THEMES[themeKey] || GROUP_THEMES.other;
      return {
        id: `group-${parent.ma_danh_muc}`,
        themeKey,
        theme,
        parentCat: parent,
      };
    });
  }, [parentCategories]);

  const viewState = useMemo(() => {
    if (activeCategoryId === 'all') return 'overview';
    if (String(activeCategoryId).startsWith('group-')) return 'category';
    return 'subcategory';
  }, [activeCategoryId]);

  const currentBigGroup = useMemo(() => {
    if (viewState === 'overview') return null;
    if (viewState === 'category') {
      return dynamicBigGroups.find(g => g.id === String(activeCategoryId)) || dynamicBigGroups[0];
    }
    const subcat = categories.find(c => String(c.ma_danh_muc) === String(activeCategoryId));
    if (!subcat) return dynamicBigGroups[0];
    return dynamicBigGroups.find(g => String(g.parentCat.ma_danh_muc) === String(subcat.ma_danh_muc_cha)) || dynamicBigGroups[0];
  }, [viewState, activeCategoryId, categories, dynamicBigGroups]);

  const currentSubcategories = useMemo(() => {
    if (!currentBigGroup) return [];
    return categories.filter(c => String(c.ma_danh_muc_cha) === String(currentBigGroup.parentCat.ma_danh_muc));
  }, [currentBigGroup, categories]);

  const subcategoryProducts = useMemo(() => {
    if (viewState !== 'subcategory') return [];
    return products.filter(p => getProductCategoryId(p) === String(activeCategoryId));
  }, [viewState, activeCategoryId, products]);

  const currentSubcat = useMemo(() => {
    if (viewState !== 'subcategory') return null;
    return categories.find(c => String(c.ma_danh_muc) === String(activeCategoryId));
  }, [viewState, activeCategoryId, categories]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeCategoryId]);

  /* ════════════════════════════════════════════════════
     CẤP 1: TỔNG QUAN THỰC ĐƠN (OVERVIEW)
     Mỗi nhóm danh mục được viết 1 đoạn mô tả 4 - 6 dòng giàu cảm xúc
     ════════════════════════════════════════════════════ */
  if (viewState === 'overview') {
    return (
      <div className="menu-intro-page" style={{ width: '100%', minHeight: '100vh', fontFamily: "var(--font-sans)" }}>
        {dynamicBigGroups.map((group, idx) => {
          const theme = group.theme;
          const isReversed = idx % 2 !== 0;

          const subcats = categories.filter(c => String(c.ma_danh_muc_cha) === String(group.parentCat.ma_danh_muc));
          const subcatIds = new Set(subcats.map(s => String(s.ma_danh_muc)));
          const sampleProduct = products.find(p => subcatIds.has(getProductCategoryId(p)));

          const descriptionText = getCategoryDescription(group.parentCat.ten_danh_muc, lang, group.themeKey);

          return (
            <section
              key={group.id}
              style={{
                background: theme.bg,
                padding: '80px 0',
                position: 'relative',
                overflow: 'hidden',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              {/* Vầng sáng trang trí nghệ thuật */}
              <div style={{
                position: 'absolute',
                top: '15%',
                left: isReversed ? '8%' : '65%',
                width: '380px',
                height: '380px',
                borderRadius: '50%',
                background: theme.themeKey === 'coffee' ? 'rgba(241, 209, 125, 0.08)' : 'rgba(29, 111, 37, 0.08)',
                filter: 'blur(90px)',
                pointerEvents: 'none',
              }} />

              <div style={{
                maxWidth: '1240px',
                margin: '0 auto',
                padding: '0 40px',
                display: 'flex',
                flexDirection: isReversed ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: '54px',
                flexWrap: 'wrap',
              }}>
                {/* Cột văn bản giới thiệu */}
                <div style={{ flex: '1 1 540px', minWidth: 0, zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <span style={{
                      fontSize: '11.5px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '2px',
                      color: theme.accentColor,
                      background: 'rgba(255, 255, 255, 0.15)',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      backdropFilter: 'blur(4px)',
                    }}>
                      {theme.badge || copy('Thực đơn Avengers', 'Avengers menu')}
                    </span>
                  </div>

                  <h2 style={{
                    fontSize: 'clamp(36px, 4.5vw, 52px)',
                    fontWeight: 800,
                    color: theme.titleColor,
                    margin: '0 0 24px',
                    lineHeight: 1.15,
                    fontFamily: "var(--font-sans)",
                    letterSpacing: '-0.5px',
                  }}>
                    {categoryLabel(group.parentCat.ten_danh_muc)}
                  </h2>

                  {/* Đoạn mô tả 4 - 6 dòng trau chuốt */}
                  <p style={{
                    fontSize: '16px',
                    lineHeight: 1.85,
                    color: theme.descColor,
                    margin: '0 0 28px',
                    fontWeight: 400,
                    textAlign: 'justify',
                    maxWidth: '640px',
                  }}>
                    {descriptionText}
                  </p>

                  {/* Các điểm nổi bật của danh mục */}
                  {theme.highlights && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '36px' }}>
                      {theme.highlights.map((hl, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.descColor, fontSize: '13.5px', fontWeight: 500 }}>
                          <CheckCircleIcon style={{ width: '16px', height: '16px', color: theme.accentColor, flexShrink: 0 }} />
                          <span>{hl}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => onCategoryChange?.(group.id)}
                    style={{
                      padding: '16px 44px',
                      background: theme.btnBg,
                      border: `2px solid ${theme.btnBorder}`,
                      color: theme.btnText,
                      fontSize: '13.5px',
                      fontWeight: 700,
                      borderRadius: '30px',
                      letterSpacing: '1px',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '12px',
                      boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = theme.btnHoverBg;
                      e.currentTarget.style.color = theme.btnHoverText;
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.2)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = theme.btnBg;
                      e.currentTarget.style.color = theme.btnText;
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
                    }}
                  >
                    <span>{copy('KHÁM PHÁ NGAY', 'EXPLORE NOW')}</span>
                    <ArrowLongRightIcon style={{ width: '20px', height: '20px' }} />
                  </button>
                </div>

                {/* Cột hình ảnh minh họa lớn */}
                <div style={{
                  flex: '1 1 420px',
                  minWidth: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  position: 'relative',
                  zIndex: 2,
                }}>
                  <div style={{
                    width: '100%',
                    maxWidth: '480px',
                    aspectRatio: '1',
                    borderRadius: '50%',
                    background: theme.themeKey === 'coffee'
                      ? 'radial-gradient(circle, rgba(241, 209, 125, 0.12) 0%, transparent 70%)'
                      : 'radial-gradient(circle, rgba(255, 255, 255, 0.6) 0%, transparent 70%)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '24px',
                  }}>
                    <img
                      loading="lazy"
                      decoding="async"
                      src={sampleProduct?.hinh_anh_url || theme.banner}
                      alt={categoryLabel(group.parentCat.ten_danh_muc)}
                      style={{
                        maxWidth: '92%',
                        maxHeight: '92%',
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.25))',
                        transition: 'transform 0.5s ease',
                      }}
                      onError={e => { e.currentTarget.src = theme.banner; }}
                    />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════
     CẤP 2: CÁC DANH MỤC CON TRONG 1 NHÓM CHA
     Nâng cấp mô tả 4-6 dòng cho từng danh mục con, bố cục sang trọng
     ════════════════════════════════════════════════════ */
  if (viewState === 'category' && currentBigGroup) {
    const parentDesc = getCategoryDescription(currentBigGroup.parentCat.ten_danh_muc, lang, currentBigGroup.themeKey);

    return (
      <div className="menu-intro-page" style={{ width: '100%', minHeight: '100vh', background: '#fdfbfa', fontFamily: "var(--font-sans)" }}>
        {/* Breadcrumb điều hướng */}
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '36px 40px 0' }}>
          <nav style={{ fontSize: '12px', fontWeight: 700, color: '#9c8877', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => onCategoryChange?.('all')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9c8877', fontSize: '12px', fontWeight: 700,
                letterSpacing: '1px', padding: 0, transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#b22830'}
              onMouseLeave={e => e.currentTarget.style.color = '#9c8877'}
            >
              {copy('Thực đơn', 'Menu')}
            </button>
            <span style={{ color: '#d0c4b6' }}>/</span>
            <span style={{ color: '#3c2415' }}>{categoryLabel(currentBigGroup.parentCat.ten_danh_muc)}</span>
          </nav>
        </div>

        {/* Header Hero Banner Danh Mục Cha */}
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '36px 40px 48px' }}>
          <div style={{
            borderLeft: '5px solid #b22830',
            paddingLeft: '28px',
            background: 'linear-gradient(90deg, rgba(178, 40, 48, 0.04) 0%, transparent 100%)',
            paddingTop: '8px',
            paddingBottom: '8px',
            borderRadius: '0 12px 12px 0',
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <SparklesIcon style={{ width: '16px', height: '16px', color: '#b22830' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#b22830', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                {copy('Bộ sưu tập thượng hạng', 'Premium Collection')}
              </span>
            </div>

            <h1 style={{
              fontSize: 'clamp(36px, 4vw, 50px)',
              fontWeight: 800,
              color: '#3c2415',
              margin: '0 0 16px',
              lineHeight: 1.15,
              fontFamily: "var(--font-sans)",
            }}>
              {categoryLabel(currentBigGroup.parentCat.ten_danh_muc)}
            </h1>

            <p style={{
              fontSize: '16px',
              lineHeight: 1.85,
              color: '#5c4838',
              margin: 0,
              fontWeight: 400,
              maxWidth: '860px',
              textAlign: 'justify',
            }}>
              {parentDesc}
            </p>
          </div>

          {/* Thanh cuộn nhanh tới các loại con */}
          {currentSubcategories.length > 1 && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '28px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#8c7766', alignSelf: 'center', marginRight: '6px' }}>
                {copy('Chuyển nhanh:', 'Quick jump:')}
              </span>
              {currentSubcategories.map(subcat => (
                <button
                  key={subcat.ma_danh_muc}
                  type="button"
                  onClick={() => onCategoryChange?.(subcat.ma_danh_muc)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '24px',
                    border: '1px solid #e5dcce',
                    background: '#ffffff',
                    color: '#4a3728',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.25s ease',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#b22830';
                    e.currentTarget.style.color = '#b22830';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#e5dcce';
                    e.currentTarget.style.color = '#4a3728';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {categoryLabel(subcat.ten_danh_muc)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Danh sách các danh mục con (Subcategories) */}
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 40px 90px' }}>
          {currentSubcategories.map((subcat, idx) => {
            const subcatProds = products.filter(p => getProductCategoryId(p) === String(subcat.ma_danh_muc));
            const featuredProducts = subcatProds.slice(0, 2);
            const isReversed = idx % 2 !== 0;
            const subcatDescription = getCategoryDescription(subcat.ten_danh_muc, lang, currentBigGroup.themeKey);

            return (
              <div
                key={subcat.ma_danh_muc}
                style={{
                  marginBottom: '54px',
                  padding: '44px 48px',
                  background: '#ffffff',
                  borderRadius: '20px',
                  boxShadow: '0 8px 30px rgba(74, 55, 40, 0.04)',
                  border: '1px solid #eee5d8',
                  transition: 'all 0.3s ease',
                }}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: isReversed ? 'row-reverse' : 'row',
                  gap: '54px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}>
                  {/* Cột thông tin chi tiết */}
                  <div style={{ flex: '1 1 500px', minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#b22830',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        background: '#fdf3f3',
                        padding: '3px 10px',
                        borderRadius: '12px',
                      }}>
                        {copy('Phân loại đặc sắc', 'Specialty Line')}
                      </span>
                      <span style={{ fontSize: '12px', color: '#8c7766', fontWeight: 500 }}>
                        {subcatProds.length} {copy('sản phẩm', 'items')}
                      </span>
                    </div>

                    <h2 style={{
                      fontSize: '34px',
                      fontWeight: 800,
                      color: '#3c2415',
                      margin: '0 0 18px',
                      lineHeight: 1.2,
                      fontFamily: "var(--font-sans)",
                    }}>
                      {categoryLabel(subcat.ten_danh_muc)}
                    </h2>

                    {/* Đoạn mô tả 4 - 6 dòng chi tiết cho từng loại con */}
                    <p style={{
                      fontSize: '15px',
                      lineHeight: 1.85,
                      color: '#5c4838',
                      margin: '0 0 28px',
                      fontWeight: 400,
                      textAlign: 'justify',
                    }}>
                      {subcatDescription}
                    </p>

                    <button
                      type="button"
                      onClick={() => onCategoryChange?.(subcat.ma_danh_muc)}
                      style={{
                        padding: '14px 38px',
                        background: 'linear-gradient(135deg, #b22830 0%, #8c1f25 100%)',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        borderRadius: '30px',
                        letterSpacing: '1px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        boxShadow: '0 6px 18px rgba(178, 40, 48, 0.25)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 10px 24px rgba(178, 40, 48, 0.35)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 6px 18px rgba(178, 40, 48, 0.25)';
                      }}
                    >
                      <span>{copy('KHÁM PHÁ SẢN PHẨM', 'VIEW PRODUCTS')}</span>
                      <ArrowLongRightIcon style={{ width: '18px', height: '18px' }} />
                    </button>
                  </div>

                  {/* Cột thẻ sản phẩm tiêu biểu */}
                  {featuredProducts.length > 0 && (
                    <div style={{ flex: '0 0 340px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#8c7766', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {copy('Gợi ý thưởng thức', 'Recommended for you')}
                      </span>

                      {featuredProducts.map(prod => (
                        <div
                          key={prod.ma_san_pham}
                          onClick={() => onOrderProduct?.(prod)}
                          style={{
                            display: 'flex',
                            gap: '16px',
                            alignItems: 'center',
                            background: '#fcfaf7',
                            borderRadius: '16px',
                            padding: '14px 18px',
                            border: '1px solid #eee5d8',
                            cursor: 'pointer',
                            transition: 'all 0.25s ease',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-3px)';
                            e.currentTarget.style.boxShadow = '0 8px 20px rgba(74, 55, 40, 0.08)';
                            e.currentTarget.style.borderColor = '#d8c2b5';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.borderColor = '#eee5d8';
                          }}
                        >
                          <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '12px',
                            background: '#ffffff',
                            border: '1px solid #ede3d4',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '6px',
                            flexShrink: 0,
                          }}>
                            <img
                              loading="lazy"
                              decoding="async"
                              src={prod.hinh_anh_url}
                              alt={prod.ten_san_pham}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                            />
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <h4 style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              color: '#3c2415',
                              margin: '0 0 6px',
                              lineHeight: 1.35,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}>
                              {prod.ten_san_pham}
                            </h4>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '15px', fontWeight: 800, color: '#b22830' }}>
                                {Number(prod.gia_ban).toLocaleString(uiLocale())} đ
                              </span>
                              <span style={{ fontSize: '11px', color: '#b22830', fontWeight: 700 }}>
                                {copy('Chi tiết →', 'View →')}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {currentSubcategories.length === 0 && (
            <div style={{ padding: '80px 0', textAlign: 'center', color: '#9c8877', fontSize: '15px', fontWeight: 600 }}>
              {copy('Chưa có danh mục con nào được cập nhật trong chuyên mục này.', 'No categories are available yet.')}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════
     CẤP 3: CHI TIẾT DANH MỤC CON & KHÁM PHÁ SẢN PHẨM
     Tái thiết kế đẹp mắt: Thẻ sản phẩm to rõ, mô tả 4-6 dòng,
     hỗ trợ xem dạng Carousel trượt hoặc Lưới toàn bộ sản phẩm
     ════════════════════════════════════════════════════ */
  if (viewState === 'subcategory' && currentBigGroup) {
    const carouselProducts = subcategoryProducts;
    const sidebarProducts = subcategoryProducts.slice(0, 5);
    const subcatName = currentSubcat?.ten_danh_muc || 'Danh mục';
    const subcatDescription = getCategoryDescription(subcatName, lang, currentBigGroup?.themeKey);

    return (
      <div className="menu-intro-page" style={{ width: '100%', minHeight: '100vh', background: '#fdfbfa', fontFamily: "var(--font-sans)" }}>
        {/* Breadcrumb điều hướng phân cấp */}
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '32px 40px 0' }}>
          <nav style={{ fontSize: '12px', fontWeight: 700, color: '#9c8877', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onCategoryChange?.('all')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9c8877', fontSize: '12px', fontWeight: 700,
                letterSpacing: '1px', padding: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#b22830'}
              onMouseLeave={e => e.currentTarget.style.color = '#9c8877'}
            >
              {copy('Thực đơn', 'Menu')}
            </button>
            <span style={{ color: '#d0c4b6' }}>/</span>
            <button
              type="button"
              onClick={() => onCategoryChange?.(currentBigGroup.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9c8877', fontSize: '12px', fontWeight: 700,
                letterSpacing: '1px', padding: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#b22830'}
              onMouseLeave={e => e.currentTarget.style.color = '#9c8877'}
            >
              {categoryLabel(currentBigGroup.parentCat.ten_danh_muc)}
            </button>
            <span style={{ color: '#d0c4b6' }}>/</span>
            <span style={{ color: '#3c2415' }}>{categoryLabel(subcatName)}</span>
          </nav>
        </div>

        {/* Nút quay lại danh mục cha */}
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '20px 40px 0' }}>
          <button
            type="button"
            onClick={() => onCategoryChange?.(currentBigGroup.id)}
            style={{
              background: '#ffffff',
              border: '1px solid #ede3d4',
              borderRadius: '24px',
              cursor: 'pointer',
              color: '#b22830',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              transition: 'all 0.25s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#fdf3f3';
              e.currentTarget.style.transform = 'translateX(-3px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            <ArrowLongLeftIcon style={{ width: '18px', height: '18px' }} />
            <span>{copy('Quay lại', 'Back to')} {categoryLabel(currentBigGroup.parentCat.ten_danh_muc)}</span>
          </button>
        </div>

        {/* Header Hero của loại sản phẩm */}
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 40px 36px' }}>
          <div style={{ maxWidth: '860px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                color: '#b22830',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                background: '#fdf3f3',
                padding: '4px 12px',
                borderRadius: '16px',
              }}>
                {categoryLabel(currentBigGroup.parentCat.ten_danh_muc)} • {copy('DÒNG ĐẶC SẮC', 'SPECIALTY')}
              </span>
            </div>

            <h1 style={{
              fontSize: 'clamp(38px, 4.5vw, 52px)',
              fontWeight: 800,
              color: '#3c2415',
              margin: '0 0 18px',
              lineHeight: 1.15,
              fontFamily: "var(--font-sans)",
            }}>
              {categoryLabel(subcatName)}
            </h1>

            {/* Đoạn mô tả 4 - 6 dòng chi tiết */}
            <p style={{
              fontSize: '16px',
              lineHeight: 1.85,
              color: '#5c4838',
              margin: '0 0 24px',
              fontWeight: 400,
              textAlign: 'justify',
            }}>
              {subcatDescription}
            </p>

            {/* Thẻ đặc trưng sản phẩm */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#1b5e20', background: '#f1f8f2', padding: '6px 14px', borderRadius: '20px', fontWeight: 600 }}>
                🌿 {copy('100% Nguyên liệu tuyển chọn', '100% Natural Selected')}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#b22830', background: '#fdf3f3', padding: '6px 14px', borderRadius: '20px', fontWeight: 600 }}>
                ✨ {copy('Công thức độc quyền', 'Signature Recipe')}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#0d47a1', background: '#eef5fd', padding: '6px 14px', borderRadius: '20px', fontWeight: 600 }}>
                ❄️ {copy('Phục vụ Nóng & Đá', 'Hot & Iced Available')}
              </span>
            </div>
          </div>
        </div>

        {/* Bố cục chính: Cột khám phá sản phẩm (Trái) & Sidebar nổi bật (Phải) */}
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 40px 90px' }}>
          <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* CỘT TRÁI: KHÁM PHÁ DANH SÁCH SẢN PHẨM */}
            <div style={{ flex: '1 1 720px', minWidth: 0 }}>
              {/* Tiêu đề & Nút chuyển đổi giao diện (Carousel / Grid) */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '12px',
              }}>
                <div>
                  <h3 style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#3c2415',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span>{copy('Khám phá danh sách món', 'Explore the menu')}</span>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#b22830',
                      background: '#fdf3f3',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}>
                      {subcategoryProducts.length}
                    </span>
                  </h3>
                </div>

                {/* Chế độ xem: Trượt Slide hoặc Lưới sản phẩm */}
                {subcategoryProducts.length > 0 && (
                  <div style={{
                    display: 'flex',
                    background: '#f0e9df',
                    padding: '3px',
                    borderRadius: '24px',
                    gap: '2px',
                  }}>
                    <button
                      type="button"
                      onClick={() => setViewMode('carousel')}
                      style={{
                        padding: '6px 16px',
                        borderRadius: '20px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: viewMode === 'carousel' ? '#ffffff' : 'transparent',
                        color: viewMode === 'carousel' ? '#b22830' : '#6b5443',
                        boxShadow: viewMode === 'carousel' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {copy('Trượt lướt', 'Carousel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      style={{
                        padding: '6px 16px',
                        borderRadius: '20px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                        color: viewMode === 'grid' ? '#b22830' : '#6b5443',
                        boxShadow: viewMode === 'grid' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                        transition: 'all 0.2s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Squares2X2Icon style={{ width: '13px', height: '13px' }} />
                      <span>{copy('Xem tất cả', 'View All')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Hiển thị sản phẩm theo Carousel hoặc Grid */}
              {carouselProducts.length > 0 && (
                <div style={{
                  background: '#ffffff',
                  borderRadius: '24px',
                  padding: '32px',
                  boxShadow: '0 8px 32px rgba(74, 55, 40, 0.04)',
                  border: '1px solid #ede5d8',
                }}>
                  {viewMode === 'carousel' ? (
                    <AutoPlayProductCarousel
                      items={carouselProducts}
                      onSelect={onOrderProduct}
                      lang={lang}
                    />
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                      gap: '22px'
                    }}>
                      {carouselProducts.map(p => (
                        <PremiumProductCard
                          key={p.ma_san_pham}
                          product={p}
                          onSelect={onOrderProduct}
                          lang={lang}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {subcategoryProducts.length === 0 && (
                <div style={{
                  padding: '80px 40px',
                  textAlign: 'center',
                  background: '#ffffff',
                  borderRadius: '20px',
                  border: '1px solid #ede5d8',
                  color: '#9c8877',
                  fontSize: '15px',
                  fontWeight: 600,
                }}>
                  {copy('Hiện chưa có sản phẩm nào được hiển thị trong danh mục này.', 'No products are available in this category yet.')}
                </div>
              )}
            </div>

            {/* CỘT PHẢI: SIDEBAR SẢN PHẨM NỔI BẬT */}
            {sidebarProducts.length > 0 && (
              <div style={{
                flex: '0 0 340px',
                minWidth: '280px',
                background: '#ffffff',
                borderRadius: '24px',
                border: '1px solid #ede5d8',
                padding: '30px 24px',
                boxShadow: '0 8px 30px rgba(74, 55, 40, 0.04)',
                position: 'sticky',
                top: '90px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '20px',
                  paddingBottom: '16px',
                  borderBottom: '2px solid #f2ebe2',
                }}>
                  <SparklesIcon style={{ width: '18px', height: '18px', color: '#b22830' }} />
                  <h3 style={{
                    fontSize: '14.5px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: '#3c2415',
                    margin: 0,
                    letterSpacing: '1px',
                  }}>
                    {copy('Sản phẩm nổi bật', 'Featured Picks')}
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {sidebarProducts.map(prod => (
                    <div
                      key={prod.ma_san_pham}
                      onClick={() => onOrderProduct?.(prod)}
                      style={{
                        display: 'flex',
                        gap: '14px',
                        alignItems: 'center',
                        padding: '10px 12px',
                        borderRadius: '16px',
                        background: '#fcfaf7',
                        border: '1px solid #f0e7dc',
                        cursor: 'pointer',
                        transition: 'all 0.25s ease',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateX(4px)';
                        e.currentTarget.style.borderColor = '#d8c2b5';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(74, 55, 40, 0.06)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateX(0)';
                        e.currentTarget.style.borderColor = '#f0e7dc';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{
                        width: '74px',
                        height: '74px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#ffffff',
                        border: '1px solid #ede5d8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px',
                        flexShrink: 0,
                      }}>
                        <img
                          loading="lazy"
                          decoding="async"
                          src={prod.hinh_anh_url}
                          alt={prod.ten_san_pham}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        />
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h4 style={{
                          fontSize: '13.5px',
                          fontWeight: 700,
                          color: '#3c2415',
                          margin: '0 0 6px',
                          lineHeight: 1.35,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {prod.ten_san_pham}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#b22830' }}>
                            {Number(prod.gia_ban).toLocaleString(uiLocale())} đ
                          </span>
                          <span style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            color: '#1b5e20',
                            background: '#e8f5e9',
                            padding: '2px 6px',
                            borderRadius: '10px',
                          }}>
                            Hot
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
