import React, { useState, useMemo } from 'react';
import { BriefcaseIcon, MapPinIcon, ClockIcon, CurrencyDollarIcon, XMarkIcon } from '@heroicons/react/24/outline';

const JOBS_DATA = [
  {
    id: 'barista-ft',
    title: 'Nhân viên Phục vụ / Pha chế (Barista) - Full-time',
    category: 'store',
    location: 'hcm',
    locationName: 'Hồ Chí Minh',
    department: 'Cửa hàng',
    type: 'Full-time (Ca xoay)',
    salary: '6.500.000 - 8.000.000đ/tháng',
    description: 'Pha chế các thức uống theo chuẩn định lượng của hệ thống. Chào đón khách hàng nhiệt tình, thân thiện. Đảm bảo vệ sinh khu vực quầy bar và sảnh đón khách.',
    requirements: 'Có thái độ tốt, chịu khó học hỏi. Ưu tiên ứng viên có kinh nghiệm pha chế cơ bản hoặc yêu thích ngành F&B. Có thể làm ca xoay linh hoạt.'
  },
  {
    id: 'barista-pt',
    title: 'Nhân viên Phục vụ / Pha chế (Barista) - Part-time',
    category: 'store',
    location: 'hn',
    locationName: 'Hà Nội',
    department: 'Cửa hàng',
    type: 'Part-time',
    salary: '22.500 - 25.000đ/giờ',
    description: 'Chào đón khách hàng, giới thiệu thực đơn và lấy thông tin đặt hàng. Pha chế đồ uống và phục vụ tại bàn. Dọn dẹp quầy kệ sạch sẽ trước và sau ca làm việc.',
    requirements: 'Năng động, nhanh nhẹn, giao tiếp tốt. Cam kết làm tối thiểu 4 ca/tuần (mỗi ca 4-5 tiếng). Không yêu cầu kinh nghiệm, được đào tạo bài bản.'
  },
  {
    id: 'store-manager',
    title: 'Cửa hàng trưởng (Store Manager)',
    category: 'store',
    location: 'hcm',
    locationName: 'Hồ Chí Minh',
    department: 'Cửa hàng',
    type: 'Full-time',
    salary: '15.000.000 - 20.000.000đ/tháng',
    description: 'Chịu trách nhiệm toàn bộ hoạt động vận hành, doanh thu và chất lượng dịch vụ của cửa hàng. Quản lý, đào tạo và phân ca làm việc cho nhân viên. Giải quyết các khiếu nại của khách hàng.',
    requirements: 'Ít nhất 2 năm kinh nghiệm ở vị trí tương đương trong lĩnh vực F&B hoặc Bán lẻ. Kỹ năng giao tiếp, quản lý nhân sự và giải quyết vấn đề tốt.'
  },
  {
    id: 'shift-supervisor',
    title: 'Giám sát ca (Shift Supervisor)',
    category: 'store',
    location: 'dn',
    locationName: 'Đà Nẵng',
    department: 'Cửa hàng',
    type: 'Full-time',
    salary: '9.000.000 - 11.000.000đ/tháng',
    description: 'Quản lý chất lượng dịch vụ và đồ uống trong ca làm việc. Đôn đốc nhân viên hoàn thành nhiệm vụ, hỗ trợ đào tạo nhân viên mới. Kiểm soát quỹ tiền mặt và hàng tồn kho trong ca.',
    requirements: 'Tối thiểu 1 năm kinh nghiệm làm việc F&B. Kỹ năng giao tiếp tốt, có tinh thần trách nhiệm cao và khả năng dẫn dắt đội ngũ.'
  },
  {
    id: 'marketing-specialist',
    title: 'Chuyên viên Marketing (Brand Marketing Specialist)',
    category: 'office',
    location: 'hn',
    locationName: 'Hà Nội',
    department: 'Văn phòng',
    type: 'Full-time',
    salary: 'Thỏa thuận',
    description: 'Lên ý tưởng, triển khai và đánh giá hiệu quả các chiến dịch Marketing thúc đẩy doanh số. Phát triển hình ảnh thương hiệu và quản lý fanpage của hệ thống. Phối hợp với bộ phận vận hành cửa hàng để triển khai CTKM.',
    requirements: 'Tốt nghiệp Đại học chuyên ngành Marketing, QTKD hoặc liên quan. Ít nhất 2 năm kinh nghiệm Marketing trong ngành F&B, FMCG. Có khả năng sáng tạo nội dung và làm việc độc lập tốt.'
  },
  {
    id: 'software-engineer',
    title: 'Kỹ sư phát triển ứng dụng (Full-stack Software Engineer)',
    category: 'office',
    location: 'hcm',
    locationName: 'Hồ Chí Minh',
    department: 'Văn phòng',
    type: 'Full-time',
    salary: 'Thỏa thuận',
    description: 'Phát triển và tối ưu hóa hệ thống microservices đặt hàng nước, quản lý kho vận hành và ứng dụng của chuỗi cà phê. Thiết kế các API hiệu năng cao và xây dựng giao diện admin/customer.',
    requirements: 'Kinh nghiệm với React, Node.js, Express, PostgreSQL và Supabase. Kỹ năng tốt về kiến trúc microservices và tối ưu cơ sở dữ liệu.'
  }
];

export default function CareersPage() {
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [selectedJob, setSelectedJob] = useState(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    position: '',
    location: '',
    intro: '',
    cvFile: ''
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

  const filteredJobs = useMemo(() => {
    return JOBS_DATA.filter(job => {
      const matchLoc = filterLocation === 'all' || job.location === filterLocation;
      const matchDept = filterDept === 'all' || job.category === filterDept;
      return matchLoc && matchDept;
    });
  }, [filterLocation, filterDept]);

  const handleOpenApplyModal = (job) => {
    setSelectedJob(job);
    setFormData({
      fullName: '',
      phone: '',
      email: '',
      position: job.title,
      location: job.locationName,
      intro: '',
      cvFile: ''
    });
    setIsSubmitted(false);
    setShowApplyModal(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => {
      setShowApplyModal(false);
      setIsSubmitted(false);
      alert('Ứng tuyển thành công! Avengers Coffee sẽ liên hệ lại với bạn trong vòng 3 ngày làm việc.');
    }, 1500);
  };

  return (
    <div className="w-full bg-[#fcfbfa] mt-[84px] min-h-screen">
      {/* ── 1. HERO SECTION ── */}
      <section className="w-full relative h-[420px] md:h-[500px] overflow-hidden">
        <img 
          src="/hc-assets/8W1A6722_1.jpg" 
          alt="Careers Banner" 
          className="absolute inset-0 w-full h-full object-cover brightness-[0.8]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20"></div>
        <div className="relative z-10 mx-auto h-full max-w-[1200px] px-4 md:px-6 flex flex-col justify-center text-white">
          <p className="text-[#c99551] text-sm md:text-base font-bold uppercase tracking-[0.25em] mb-3">
            Hành trình chia sẻ niềm tự hào
          </p>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight leading-tight max-w-[800px]" style={{ fontFamily: 'Georgia, serif' }}>
            Gia nhập gia đình <br className="hidden md:inline"/>Avengers Coffee
          </h1>
          <p className="mt-4 text-base md:text-lg max-w-[600px] text-white/80 font-medium leading-relaxed">
            Chúng tôi luôn chào đón bạn trở thành một phần của đội ngũ để cùng nhau kết nối khách hàng và lan tỏa hương vị cà phê Việt đầy tự hào.
          </p>
        </div>
      </section>

      {/* ── 2. WORK ENVIRONMENT & VALUES ── */}
      <section className="py-16 bg-white border-b border-gray-100">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6">
          <div className="text-center max-w-[700px] mx-auto mb-14">
            <h2 className="text-2xl md:text-4xl font-black text-[#53382c] uppercase tracking-wide">
              Tại sao chọn chúng tôi?
            </h2>
            <div className="w-16 h-1 bg-[#b22830] mx-auto mt-4 rounded-full"></div>
            <p className="mt-4 text-gray-600 font-semibold">
              Chúng tôi tin rằng con người chính là yếu tố làm nên sự khác biệt và giúp Avengers Coffee không ngừng phát triển bền vững mỗi ngày.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 bg-[#fdfaf6] border border-[#f5ece0] rounded-2xl flex flex-col items-center text-center transition-all hover:shadow-xl hover:translate-y-[-4px] duration-300">
              <div className="w-16 h-16 bg-[#b22830]/10 text-[#b22830] rounded-full flex items-center justify-center mb-6">
                <BriefcaseIcon className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-[#53382c] uppercase tracking-wide mb-3">Đào tạo bài bản</h3>
              <p className="text-sm text-gray-600 leading-relaxed font-medium">
                Bạn sẽ được học các kỹ năng pha chế chuyên nghiệp và chăm sóc khách hàng từ căn bản đến chuyên sâu thông qua hệ thống đào tạo chuẩn mực của chúng tôi.
              </p>
            </div>

            <div className="p-8 bg-[#fdfaf6] border border-[#f5ece0] rounded-2xl flex flex-col items-center text-center transition-all hover:shadow-xl hover:translate-y-[-4px] duration-300">
              <div className="w-16 h-16 bg-[#b22830]/10 text-[#b22830] rounded-full flex items-center justify-center mb-6">
                <CurrencyDollarIcon className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-[#53382c] uppercase tracking-wide mb-3">Phúc lợi hấp dẫn</h3>
              <p className="text-sm text-gray-600 leading-relaxed font-medium">
                Mức lương thưởng cạnh tranh, cơ hội thưởng doanh số hấp dẫn, cùng chế độ bảo hiểm, nghỉ phép và các chính sách giảm giá mua đồ uống dành riêng cho nhân viên.
              </p>
            </div>

            <div className="p-8 bg-[#fdfaf6] border border-[#f5ece0] rounded-2xl flex flex-col items-center text-center transition-all hover:shadow-xl hover:translate-y-[-4px] duration-300">
              <div className="w-16 h-16 bg-[#b22830]/10 text-[#b22830] rounded-full flex items-center justify-center mb-6">
                <ClockIcon className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-[#53382c] uppercase tracking-wide mb-3">Lộ trình thăng tiến</h3>
              <p className="text-sm text-gray-600 leading-relaxed font-medium">
                Lộ trình nghề nghiệp rộng mở. Bạn hoàn toàn có cơ hội thăng tiến lên các vị trí Quản lý Ca, Cửa hàng trưởng hoặc các vị trí điều hành tại văn phòng chỉ sau 6-12 tháng làm việc hiệu quả.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. JOB OPENINGS LIST ── */}
      <section className="py-16 max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="text-center max-w-[700px] mx-auto mb-12">
          <h2 className="text-2xl md:text-4xl font-black text-[#53382c] uppercase tracking-wide">
            Cơ hội việc làm mới nhất
          </h2>
          <div className="w-16 h-1 bg-[#b22830] mx-auto mt-4 rounded-full"></div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-10">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-black uppercase tracking-wider text-gray-500 min-w-[70px]">Khu vực:</span>
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="flex-1 sm:flex-initial rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-[#b22830]"
            >
              <option value="all">Tất cả địa điểm</option>
              <option value="hn">Hà Nội</option>
              <option value="hcm">Hồ Chí Minh</option>
              <option value="dn">Đà Nẵng</option>
            </select>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-black uppercase tracking-wider text-gray-500 min-w-[70px]">Bộ phận:</span>
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="flex-1 sm:flex-initial rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-[#b22830]"
            >
              <option value="all">Tất cả bộ phận</option>
              <option value="store">Khối Cửa Hàng</option>
              <option value="office">Khối Văn Phòng</option>
            </select>
          </div>
        </div>

        {/* Job Listings */}
        <div className="grid grid-cols-1 gap-6 max-w-[940px] mx-auto">
          {filteredJobs.map((job) => (
            <div 
              key={job.id} 
              className="bg-white border border-[#eae6e1] rounded-2xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="bg-[#b22830]/10 text-[#b22830] text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                    {job.department}
                  </span>
                  <span className="bg-gray-100 text-gray-600 text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                    {job.type}
                  </span>
                </div>
                <h3 className="text-xl font-black text-[#53382c] mb-3 leading-snug">
                  {job.title}
                </h3>
                <p className="text-sm text-gray-500 mb-4 font-medium leading-relaxed max-w-[680px]">
                  {job.description}
                </p>
                
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <MapPinIcon className="w-4 h-4 text-gray-400" />
                    {job.locationName}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CurrencyDollarIcon className="w-4 h-4 text-gray-400" />
                    {job.salary}
                  </span>
                </div>
              </div>
              
              <button 
                type="button"
                onClick={() => handleOpenApplyModal(job)}
                className="w-full md:w-auto px-8 py-3.5 bg-[#b22830] hover:bg-[#921d24] text-white font-black uppercase tracking-wider text-xs rounded-xl shadow-lg shadow-red-100 hover:shadow-red-200 transition-all duration-300 shrink-0 text-center"
              >
                Ứng tuyển ngay
              </button>
            </div>
          ))}

          {filteredJobs.length === 0 && (
            <div className="py-16 text-center text-gray-500 bg-white border border-[#eae6e1] rounded-2xl">
              Không tìm thấy vị trí tuyển dụng nào phù hợp với bộ lọc của bạn.
            </div>
          )}
        </div>
      </section>

      {/* ── 4. APPLICATION FORM MODAL ── */}
      {showApplyModal && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="relative w-full max-w-[600px] bg-white rounded-3xl shadow-2xl p-6 md:p-8 animate-fadeIn max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button 
              type="button"
              onClick={() => setShowApplyModal(false)}
              className="absolute right-5 top-5 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            <h3 className="text-2xl font-black text-[#53382c] uppercase tracking-wide mb-2 pr-8">
              Ứng tuyển trực tuyến
            </h3>
            <p className="text-sm font-semibold text-gray-500 mb-6 leading-normal">
              Vị trí: <span className="text-[#b22830]">{selectedJob.title}</span>
            </p>

            {isSubmitted ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 animate-bounce">
                  ✓
                </div>
                <h4 className="text-lg font-bold text-gray-800 mb-2">Đang gửi hồ sơ ứng tuyển...</h4>
                <p className="text-sm text-gray-500">Cảm ơn bạn đã ứng tuyển vào Avengers Coffee!</p>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Họ và tên *</label>
                  <input
                    type="text"
                    required
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="Nguyễn Văn A"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-[#b22830]"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Số điện thoại *</label>
                    <input
                      type="tel"
                      required
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="0901234567"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-[#b22830]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Email *</label>
                    <input
                      type="email"
                      required
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="email@example.com"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-[#b22830]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Vị trí ứng tuyển</label>
                    <input
                      type="text"
                      disabled
                      name="position"
                      value={formData.position}
                      className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-500 outline-none cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Khu vực làm việc</label>
                    <input
                      type="text"
                      disabled
                      name="location"
                      value={formData.location}
                      className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-500 outline-none cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Đường dẫn CV của bạn (Drive / Dropbox) *</label>
                  <input
                    type="url"
                    required
                    name="cvFile"
                    value={formData.cvFile}
                    onChange={handleInputChange}
                    placeholder="https://drive.google.com/..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-[#b22830]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Giới thiệu bản thân & Mong muốn ca làm việc *</label>
                  <textarea
                    rows="3"
                    required
                    name="intro"
                    value={formData.intro}
                    onChange={handleInputChange}
                    placeholder="Ví dụ: Tôi có thể làm ca tối các ngày trong tuần và cả ngày thứ 7..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-[#b22830]"
                  ></textarea>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowApplyModal(false)}
                    className="px-5 py-3 border border-gray-200 rounded-xl text-xs font-black uppercase tracking-wide text-gray-500 hover:bg-gray-50"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-3 bg-[#b22830] hover:bg-[#921d24] text-white text-xs font-black uppercase tracking-wide rounded-xl shadow-lg shadow-red-100"
                  >
                    Gửi Hồ Sơ
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
