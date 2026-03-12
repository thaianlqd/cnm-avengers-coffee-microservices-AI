import React from 'react';
import Header from '../components/Header';
import ProductCard from '../components/ProductCard';
import Footer from '../components/Footer';

export default function Menu() {
  // Dữ liệu danh mục chính (Phần icon tròn bên trên)
  const categories = [
    { id: 1, name: 'Must Try', icon: '🍷' },
    { id: 2, name: 'Cà phê', icon: '☕' },
    { id: 3, name: 'Trà', icon: '🍃' },
    { id: 4, name: 'Đồ ăn', icon: '🍕' },
    { id: 5, name: 'Khác', icon: '✨' },
  ];

  // Dữ liệu danh mục con (Phần Sidebar bên trái)
  const subCategories = [
    "Tất cả sản phẩm",
    "Espresso",
    "Americano",
    "Latte",
    "Frappe - Frappe",
    "\"Phin\" Việt Nam",
    "Cold Brew"
  ];

  // Dữ liệu sản phẩm mẫu (Bác có thể thêm nhiều hơn ở đây)
  const products = [
    { id: 1, name: "A-Mê Đào", price: 49000, img: 'https://minio.thecoffeehouse.com/static/safari/1.png' },
    { id: 2, name: "Ethiopia Americano Đá", price: 34500, img: 'https://minio.thecoffeehouse.com/static/safari/2.png' },
    { id: 3, name: "Ethiopia Americano Nóng", price: 34500, img: 'https://minio.thecoffeehouse.com/static/safari/3.png' },
    { id: 4, name: "Pizza 5 Cheese", price: 39000, img: 'https://minio.thecoffeehouse.com/static/safari/4.png' },
    { id: 5, name: "Espresso Đá", price: 49000, img: 'https://minio.thecoffeehouse.com/static/safari/2.png' },
    { id: 6, name: "Bạc Xỉu", price: 29000, img: 'https://minio.thecoffeehouse.com/static/safari/6.png' },
    { id: 7, name: "Trà Đào Cam Sả", price: 45000, img: 'https://minio.thecoffeehouse.com/static/safari/5.png' },
    { id: 8, name: "Latte Nóng", price: 59000, img: 'https://minio.thecoffeehouse.com/static/safari/3.png' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* 1. Header luôn nằm trên cùng */}
      <Header />

      {/* 2. Banner chính (Full Width) */}
      <div className="w-full">
        <img 
          src="https://minio.thecoffeehouse.com/content/pwa/static/img/home-banner.png" 
          className="w-full aspect-[21/9] object-cover" 
          alt="Banner Khuyến Mãi"
        />
      </div>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 pt-10 pb-20">
        
        {/* 3. Thanh chọn Category chính (Dạng Pill/Card tròn) */}
        <div className="flex justify-center space-x-6 mb-16 overflow-x-auto pb-4 no-scrollbar">
          {categories.map(c => (
            <button key={c.id} className="group flex flex-col items-center min-w-[100px] transition-all">
               <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-2xl group-hover:border-tch-orange group-hover:shadow-orange-100 transition-all">
                  {c.icon}
               </div>
               <span className="mt-3 text-[11px] font-black uppercase text-gray-500 group-hover:text-tch-orange tracking-wider">
                  {c.name}
               </span>
            </button>
          ))}
        </div>

        {/* 4. Layout chính: Sidebar + Product Grid */}
        <div className="flex flex-col md:flex-row gap-10">
          
          {/* Sidebar bên trái (Lọc món) */}
          <aside className="w-full md:w-56 flex-shrink-0">
            <h2 className="text-tch-orange font-black text-xl uppercase italic mb-6 border-l-4 border-tch-orange pl-3">
               Cà phê
            </h2>
            <ul className="space-y-4">
              {subCategories.map((sub, index) => (
                <li key={index}>
                  <a 
                    href="#" 
                    className={`text-[13px] font-bold uppercase transition-colors ${index === 0 ? 'text-tch-orange' : 'text-gray-600 hover:text-tch-orange'}`}
                  >
                    {sub}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          {/* Grid sản phẩm bên phải */}
          <div className="flex-1">
            <h2 className="text-2xl font-black text-gray-800 uppercase mb-8">
               Tất cả sản phẩm
            </h2>
            
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-x-8 gap-y-12">
              {products.map((p) => (
                <ProductCard 
                  key={p.id} 
                  name={p.name} 
                  price={p.price} 
                  img={p.img} 
                />
              ))}
            </div>
          </div>

        </div>
      </main>

      {/* 5. Footer kết thúc trang */}
      <Footer />
    </div>
  );
}