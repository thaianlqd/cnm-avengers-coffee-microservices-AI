import React, { useState } from 'react';
import { navigateTab } from '../../lib/navigate';

export default function ChinhSachDatHangPage() {
  return (
    <div className="flex flex-col w-full bg-white">

      {/* Breadcrumb */}
      <div className="bg-[#f5f5f5] py-2 px-4 text-[13px] text-gray-500 w-full">
        <div className="mx-auto max-w-[1380px] px-4 md:px-6">
          <a href="/" className="hover:text-[#b22830]">Trang chủ</a>
          <span className="mx-1">/</span>
          <span className="text-gray-900">Chính sách Đặt hàng | Highlands Coffee®</span>
        </div>
      </div>

      <div className="flex-1 mx-auto w-full max-w-[1380px] px-4 md:px-8 py-10">
        <h1 className="text-[28px] font-bold text-[#333] mb-8">Chính sách Đặt hàng | Highlands Coffee®</h1>

        <div className="prose max-w-none text-[14px] text-[#333] leading-relaxed space-y-6">
          <h2 className="text-[20px] font-bold text-[#333]">Chính sách đặt hàng</h2>

          <h3 className="text-[16px] font-bold text-[#b22830]">1. Phạm vi giao hàng và vận chuyển</h3>
          <p>
            Trong tháng 10/2023, Highlands Coffee® hỗ trợ đặt hàng trên website{' '}
            <a href="https://www.order.highlandscoffee.com.vn" className="text-[#2F80ED] hover:underline">www.order.highlandscoffee.com.vn</a>{' '}
            và giao hàng trên địa bàn Tp.Hồ Chí Minh. Tùy theo tình hình thực tế, các chính sách đặt hàng và giao hàng sẽ có sự thay đổi và khách hàng sẽ nhận được thông tin cập nhật trên website.
          </p>

          <h3 className="text-[16px] font-bold text-[#b22830]">2. Chính sách hoàn trả hàng và hoàn tiền</h3>
          <p>
            Quý Khách Hàng có quyền hoàn trả sản phẩm (đối với Thức uống/Bánh/Sản phẩm Trà, Cà Phê đóng gói và sản phẩm Ly/Bình giữ nhiệt) nếu đơn hàng/sản phẩm gặp vấn đề trong các trường hợp sau:
          </p>
          <ul className="list-none pl-0 space-y-2">
            <li className="pl-4 border-l-2 border-gray-200">(1) Sản phẩm bị hư hỏng, không còn nguyên vẹn trong quá trình vận chuyển từ nhà cung cấp;</li>
            <li className="pl-4 border-l-2 border-gray-200">(2) Sản phẩm có vấn đề về chất lượng sau khi được kiểm tra và xác thực thông tin phản ánh là chính xác.</li>
          </ul>

          <div className="bg-gray-50 border border-gray-200 rounded p-4">
            <p className="font-bold mb-2">Lưu ý:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Highlands Coffee chưa thể hỗ trợ các yêu cầu trả hàng/hoàn tiền với các lý do liên quan đến cảm quan/không hài lòng/thay đổi quyết định mua hàng hoặc thông tin phản ánh chưa chính xác.</li>
              <li>Thời hạn để gửi yêu cầu đổi trả sản phẩm kể từ ngày nhận hàng là <strong>24 giờ</strong>. Đối với ngành hàng Thức uống/Bánh ngọt, thời hạn gửi yêu cầu là <strong>trong ngày</strong> kể từ ngày nhận hàng cho đến khi kết thúc ca làm việc cuối ngày của cửa hàng.</li>
            </ul>
          </div>

          <h3 className="text-[16px] font-bold text-[#b22830]">3. Phương thức thanh toán</h3>
          <p>Quý Khách Hàng có thể lựa chọn hình thức thanh toán phù hợp:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Thanh toán khi nhận hàng (COD):</strong> Thanh toán bằng tiền mặt khi nhận hàng tại nhà.</li>
            <li><strong>Chuyển khoản ngân hàng:</strong> Khách hàng thực hiện chuyển khoản theo thông tin được cung cấp sau khi đặt hàng thành công.</li>
            <li><strong>Ví điện tử (Momo, ZaloPay, VNPay...):</strong> Hỗ trợ thanh toán qua các ví điện tử phổ biến.</li>
          </ul>

          <h3 className="text-[16px] font-bold text-[#b22830]">4. Thời gian xử lý và giao hàng</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Đơn hàng sẽ được xác nhận trong vòng <strong>15-30 phút</strong> sau khi đặt hàng thành công.</li>
            <li>Thời gian giao hàng từ <strong>30-60 phút</strong> tùy thuộc vào khoảng cách và điều kiện giao thông.</li>
            <li>Trong một số trường hợp đặc biệt (thời tiết xấu, giờ cao điểm...), thời gian giao hàng có thể kéo dài hơn.</li>
          </ul>

          <h3 className="text-[16px] font-bold text-[#b22830]">5. Quy trình khiếu nại</h3>
          <p>Nếu có bất kỳ vấn đề nào với đơn hàng, Quý Khách Hàng vui lòng:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Liên hệ với chúng tôi qua hotline <strong>1900 1755</strong> hoặc email <strong>customerservice@highlandscoffee.com.vn</strong></li>
            <li>Cung cấp thông tin đơn hàng và mô tả vấn đề gặp phải</li>
            <li>Đội ngũ hỗ trợ sẽ phản hồi trong vòng 24 giờ làm việc</li>
          </ol>

          <div className="bg-[#fff8f0] border border-[#f0d9c0] rounded p-4 mt-6">
            <p className="text-[13px] text-gray-600">
              <strong>Lưu ý quan trọng:</strong> Chính sách này áp dụng cho các đơn hàng được đặt qua website{' '}
              <a href="https://order.highlandscoffee.com.vn" className="text-[#2F80ED] hover:underline">order.highlandscoffee.com.vn</a>.
              Đối với các đơn hàng tại cửa hàng trực tiếp, vui lòng tham khảo chính sách riêng của từng cửa hàng.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
