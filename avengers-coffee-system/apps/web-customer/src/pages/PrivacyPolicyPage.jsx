export default function PrivacyPolicyPage({ onBack }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header Section */}
      <section className="border-b border-[#ece3cc] bg-gradient-to-b from-[#f3e8bb] to-[#fbf7ea]">
        <div className="mx-auto max-w-[1240px] px-4 py-14 text-center md:px-6 md:py-20">
          <p className="text-[12px] font-black uppercase tracking-[0.4em] text-[#d67b3c]">Về Chúng Tôi</p>
          <h1 className="mt-5 text-[52px] font-black tracking-tight text-[#161616] md:text-[78px]" style={{ fontFamily: 'Georgia, serif' }}>
            Chuyện Nhà
          </h1>
          <p className="mx-auto mt-6 max-w-[760px] text-lg font-semibold leading-relaxed text-[#3d362f] md:text-[21px]">
            Từ những hạt cà phê thanh lịch đến những ly trà đậm hương - Avengers House luôn mang đến một thế giới riêng
          </p>
        </div>
      </section>

      {/* About Us Content */}
      <section className="mx-auto max-w-[1240px] px-4 py-12 md:px-6 md:py-16">
        {/* Brand Intro */}
        <div className="mb-16 grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d67b3c]">Câu chuyện của chúng tôi</p>
            <h2 className="mt-4 text-4xl font-black uppercase leading-tight text-[#161616] md:text-5xl">
              The Avengers House là gì?
            </h2>
            <div className="mt-6 space-y-4 text-base font-semibold leading-relaxed text-[#413a33] md:text-lg">
              <p>
                The Avengers House tự hào là nơi cộ lũ hứa hẹn mang đến những khoảnh khắc thanh bình và tươi sáng trong nhịp sống thường ngày. Từ những hạt cà phê thanh lịch, những ly trà đậm hương đến những chiếc bánh nướng thơm nức nần - tất cả được chọn lọc, chế biến và phục vụ với tâm huyết.
              </p>
              <p>
                Chúng tôi không chỉ bán sản phẩm, mà chúng tôi bán những khoảnh khắc - những lúc bạn có thể dừng lại, thả lỏng và khẽ cười với người bạn yêu quý.
              </p>
            </div>
          </div>
          <div className="rounded-3xl overflow-hidden shadow-2xl">
            <img
              src="https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=600&q=80"
              alt="The Avengers House"
              className="h-[400px] w-full object-cover"
            />
          </div>
        </div>

        {/* Values Section */}
        <div className="mb-16">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d67b3c]">Những giá trị cốt lõi</p>
          <h2 className="mt-4 mb-10 text-4xl font-black uppercase text-[#161616] md:text-5xl">
            Chúng tôi tin vào điều gì
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: '☕',
                title: 'Chất lượng Hàng Đầu',
                desc: 'Mỗi hạt cà phê, mỗi lá trà được chọn lọc từ những nguồn uy tín nhất. Chúng tôi không bao giờ thỏa hiệp với chất lượng.',
              },
              {
                icon: '❤️',
                title: 'Tâm Huyết & Tình Yêu',
                desc: 'Mỗi xe phục vụ được tạo nên với thái độ cần mẫn và yêu thương. Đó là cách chúng tôi nói "cảm ơn bạn đã tín tưởng chúng tôi".',
              },
              {
                icon: '🌍',
                title: 'Bền Vững & Trách Nhiệm',
                desc: 'Chúng tôi quan tâm đến môi trường và cộng đông. Mỗi quyết định kinh doanh đều tính đến tác động lâu dài.',
              },
            ].map((value, idx) => (
              <div
                key={idx}
                className="rounded-3xl border border-[#e7b48d] bg-gradient-to-br from-[#f7f0df] to-[#fff8ee] p-8 text-center"
              >
                <div className="text-6xl mb-4">{value.icon}</div>
                <h3 className="text-2xl font-black text-[#161616]">{value.title}</h3>
                <p className="mt-4 text-base font-semibold leading-relaxed text-[#433d38]">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Team & Culture */}
        <div className="mb-16 rounded-3xl border border-[#ede5d4] bg-gradient-to-r from-[#f8f1e0] via-[#fff8ec] to-[#f8f1e0] p-12 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d67b3c]">Đội ngũ của chúng tôi</p>
          <h2 className="mt-4 text-4xl font-black uppercase text-[#161616] md:text-5xl">Những người làm nên Avengers House</h2>
          <p className="mx-auto mt-6 max-w-[700px] text-lg font-semibold leading-relaxed text-[#3d362f]">
            Từ barista giàu kinh nghiệm đến nhân viên pha trà, từ người phục vụ thân thiện đến nhân viên sau quầy - tất cả đều là một phần của gia đình Avengers House. Chúng tôi không chỉ là đồng nghiệp, mà chúng tôi là những người bạn cùng chí hướng.
          </p>
        </div>

        {/* Testimonials */}
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d67b3c]">Những lời thương</p>
          <h2 className="mt-4 mb-10 text-4xl font-black uppercase text-[#161616] md:text-5xl">
            Bạn nói gì về chúng tôi
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: 'Nguyễn Thái An',
                role: 'Khách hàng thường xuyên',
                avatar: '👩‍🦰',
                text: 'Tôi yêu The Avengers House vì không gian thoải mái và cả phế đều ngon. Đội ngũ rất thân thiện, luôn sẵn sàng tư vấn cho tôi chọn thức uống phù hợp.',
              },
              {
                name: 'Nguyễn Thành An',
                role: 'Freelancer',
                avatar: '👨‍💻',
                text: 'Đây là nơi tôi yêu thích nhất để làm việc. WiFi tốt, cà phê ngon, và không khí yên tĩnh. Tuyệt vời!',
              },
              {
                name: 'Nguyễn Thế Anh',
                role: 'Sinh viên',
                avatar: '👩‍🎓',
                text: 'Tôi thường tới đây để gặp bạn bè. Không khí vui vẻ, đồ uống ngon, giá cả lại hợp lý. Highly recommended!',
              },
            ].map((testimonial, idx) => (
              <div
                key={idx}
                className="rounded-3xl border border-[#e7b48d] bg-white p-6 shadow-sm shadow-orange-100"
              >
                <div className="text-4xl mb-4">{testimonial.avatar}</div>
                <p className="text-base font-semibold leading-relaxed text-[#413a33] mb-4">"{testimonial.text}"</p>
                <div className="border-t border-[#ede5d4] pt-4">
                  <p className="font-black text-[#161616]">{testimonial.name}</p>
                  <p className="text-xs font-semibold text-[#9d968f] uppercase tracking-wider">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-[#ece3cc] bg-gradient-to-b from-[#fbf7ea] to-[#f7f0df] mt-12">
        <div className="mx-auto max-w-[960px] px-4 py-12 text-center md:px-6 md:py-16">
          <h2 className="text-2xl font-black uppercase text-[#161616] md:text-3xl">
            Bạn đã sẵn sàng tham gia gia đình Avengers House?
          </h2>
          <p className="mt-4 text-lg font-semibold text-[#433d38]">
            Hãy tìm chi nhánh gần nhất hoặc đặt hàng trực tuyến ngay hôm nay.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-[#e67a3a] bg-[#e67a3a] px-8 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-orange-200 transition-all hover:bg-[#d67b3c]"
          >
            Quay lại trang chính
          </button>
        </div>
      </section>
    </div>
  );
}
