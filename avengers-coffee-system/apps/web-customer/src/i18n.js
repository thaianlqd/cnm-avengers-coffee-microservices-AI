import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  vi: {
    translation: {
      header: {
        menu: "Thực đơn",
        about: "Về Avengers Coffee",
        careers: "Nghề nghiệp",
        support: "Hỗ trợ",
        order: "Đặt hàng",
        findStore: "Tìm kiếm cửa hàng",
        login: "Đăng nhập",
        account: "Tài khoản",
        cart: "Giỏ hàng",
        notifications: "Thông báo",
        orders: "Đơn hàng của tôi",
        profile: "Hồ sơ của tôi",
        logout: "Đăng xuất"
      },
      home: {
        heroTitle: "Cùng Avengers Coffee\nLan Tỏa Tinh Hoa Cà Phê Việt.",
        news: "TIN TỨC MỚI NHẤT",
        viewAll: "Xem tất cả",
        popular: "PHỔ BIẾN",
        products: "SẢN PHẨM",
        appMember: "App Thành Viên\nAvengers Coffee",
        appDesc: "Đặt trước - Lấy ngay, không cần đợi",
        downloadApp: "TẢI APP NGAY",
        companion: "Đồng Hành Cùng Avengers",
        orderNow: "ĐẶT HÀNG NGAY",
        careers: "CƠ HỘI NGHỀ NGHIỆP",
        tastyDrinks: "NƯỚC NGON THƯỞNG VỊ",
        tastyCakes: "BÁNH NGON NGẤT NGÂY",
        storesNearYou: "Cửa Hàng\nAvengers Gần Bạn",
        storesSlogan: "Bạn ở đâu, có Avengers ở đó!",
        exploreNow: "KHÁM PHÁ NGAY",
        searchPlaceholder: "Xin chào, bạn cần gì hôm nay?",
        searchResult: "Kết quả tìm kiếm cho",
        searchEmpty: "Không tìm thấy sản phẩm phù hợp với từ khóa",
        searchBy: "Hiển thị kết quả theo:",
        searchMore: "Xem thêm sản phẩm có chứa",
        product: "Sản phẩm",
        bestSeller: "BEST SELLER",
        tryNow: "THỬ NGAY!"
      },
      order: {
        returnPolicy: "Chính sách đổi trả",
        contact: "Liên hệ",
        home: "Trang chủ",
        categories: "Danh mục",
        sortBy: "Sắp xếp:",
        nameAsc: "Tên A → Z",
        nameDesc: "Tên Z → A",
        priceAsc: "Giá tăng dần",
        priceDesc: "Giá giảm dần",
        newest: "Hàng mới",
        showing: "HIỂN THỊ:",
        allCategories: "TẤT CẢ DANH MỤC"
      },
      footer: {
        companyName: "Công ty Cổ phần Avengers Coffee",
        companyDesc: "Với sứ mệnh đem đến những ly cà phê tươi ngon nhất, Avengers Coffee tự hào là người bạn đồng hành của người Việt.",
        links: "LIÊN KẾT",
        menu: "Thực đơn",
        about: "Giới thiệu",
        promotions: "Khuyến mãi",
        stores: "Cửa hàng",
        policy: "CHÍNH SÁCH",
        terms: "Điều khoản sử dụng",
        privacy: "Chính sách bảo mật",
        contact: "LIÊN HỆ",
        hotline: "Hotline: 1900 1234",
        email: "Email: cskh@avengerscoffee.vn",
        address: "Địa chỉ: 123 Đường Cà Phê, Quận 1, TP.HCM",
        copyright: "© 2026 Avengers Coffee. All rights reserved."
      },
      giftcard: {
        nav: {
          "ve-the": "Về thẻ Avengers Coffee",
          "bo-suu-tap": "Bộ sưu tập thẻ",
          "chinh-sach": "Chính sách",
          "ho-tro": "Hỗ trợ",
          "mua-so-luong-lon": "Mua số lượng lớn",
          "khuyen-mai": "Khuyến Mãi",
          boSuuTap2024: "Bộ sưu tập 2024",
          boSuuTap2025: "Bộ sưu tập 2025",
          theFestive2025: "Thẻ Festive 2025",
          xemTatCa: "Xem tất cả"
        }
      }
    }
  },
  en: {
    translation: {
      header: {
        menu: "Menu",
        about: "About Us",
        careers: "Careers",
        support: "Support",
        order: "Order Now",
        findStore: "Find a Store",
        login: "Login",
        account: "Account",
        cart: "Cart",
        notifications: "Notifications",
        orders: "My Orders",
        profile: "My Profile",
        logout: "Logout"
      },
      home: {
        heroTitle: "With Avengers Coffee\nSpreading the Essence of Vietnamese Coffee.",
        news: "LATEST NEWS",
        viewAll: "View all",
        popular: "POPULAR",
        products: "PRODUCTS",
        appMember: "Avengers Coffee\nMember App",
        appDesc: "Order ahead - Pick up instantly",
        downloadApp: "DOWNLOAD NOW",
        companion: "Companion with Avengers",
        orderNow: "ORDER NOW",
        careers: "CAREER OPPORTUNITIES",
        tastyDrinks: "TASTY DRINKS",
        tastyCakes: "DELICIOUS CAKES",
        storesNearYou: "Avengers Stores\nNear You",
        storesSlogan: "Wherever you are, Avengers is there!",
        exploreNow: "EXPLORE NOW",
        searchPlaceholder: "Hello, what do you need today?",
        searchResult: "Search results for",
        searchEmpty: "No products found matching keyword",
        searchBy: "Show results by:",
        searchMore: "View more products containing",
        product: "Products",
        bestSeller: "BEST SELLER",
        tryNow: "TRY NOW!"
      },
      order: {
        returnPolicy: "Return Policy",
        contact: "Contact",
        home: "Home",
        categories: "Categories",
        sortBy: "Sort by:",
        nameAsc: "Name A → Z",
        nameDesc: "Name Z → A",
        priceAsc: "Price: Low to High",
        priceDesc: "Price: High to Low",
        newest: "Newest",
        showing: "SHOWING:",
        allCategories: "ALL CATEGORIES"
      },
      footer: {
        companyName: "Avengers Coffee JSC",
        companyDesc: "With a mission to bring the freshest cups of coffee, Avengers Coffee is proud to be a companion of the Vietnamese people.",
        links: "QUICK LINKS",
        menu: "Menu",
        about: "About Us",
        promotions: "Promotions",
        stores: "Stores",
        policy: "POLICIES",
        terms: "Terms of Use",
        privacy: "Privacy Policy",
        contact: "CONTACT",
        hotline: "Hotline: 1900 1234",
        email: "Email: support@avengerscoffee.vn",
        address: "Address: 123 Coffee St, District 1, HCMC",
        copyright: "© 2026 Avengers Coffee. All rights reserved."
      },
      giftcard: {
        nav: {
          "ve-the": "About Avengers Card",
          "bo-suu-tap": "Card Collection",
          "chinh-sach": "Policies",
          "ho-tro": "Support",
          "mua-so-luong-lon": "Corporate Sales",
          "khuyen-mai": "Promotions",
          boSuuTap2024: "2024 Collection",
          boSuuTap2025: "2025 Collection",
          theFestive2025: "2025 Festive Card",
          xemTatCa: "View all"
        }
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('i18nextLng') || 'vi',
    fallbackLng: "vi",
    interpolation: {
      escapeValue: false
    }
  });

// Lưu vào localStorage khi có thay đổi
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('i18nextLng', lng);
});

export default i18n;
