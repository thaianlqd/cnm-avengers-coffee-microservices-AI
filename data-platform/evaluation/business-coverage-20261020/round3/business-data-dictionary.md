# Từ điển dữ liệu nghiệp vụ — AI Data Analyst

Sinh tự động từ `metadata/semantic_catalog.json` và `metadata/business_feature_registry.json`. Không sửa tay.

Phạm vi: 26 miền, 100 chỉ số công khai, 34 nhóm nghiệp vụ, 78/78 bảng nguồn đã phân loại.

## Ca làm và chấm công (`staff_shifts`)

Số ca, ca trễ và tỷ lệ ca đi trễ (trên ca đã chấm công) theo ngày làm.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Tổng số ca làm (`shift_count`) | lượt | có | Đếm bản ghi ca nhân viên theo ngày làm việc; không phải số nhân viên duy nhất hoặc giờ công. | Toàn bộ bản ghi của đối tượng |  |
| Số ca đi trễ (`late_count`) | lượt | có | Đếm ca có trạng thái chấm công DI_TRE theo ngày làm việc; chưa chuẩn hóa theo tổng ca nên không gọi là tỷ lệ đi trễ. | Toàn bộ bản ghi của đối tượng |  |
| Tỷ lệ ca đi trễ (`late_shift_rate`) | % | có | Phần trăm ca đi trễ (DI_TRE) trên các ca đã chấm công vào ca (DUNG_GIO, DI_TRE, VE_SOM) theo ngày làm; ca chưa chấm công (ASSIGNED), nghỉ phép (NGHI_PHEP) hoặc vắng mặt (VANG_MAT) không vào mẫu số. | Ca đã chấm công vào ca: DUNG_GIO, DI_TRE, VE_SOM | Ca vắng mặt không tính là đi trễ; xem số ca theo trạng thái chấm công để đánh giá vắng mặt. |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Chi nhánh và điểm bán (`stores`)

Đối chiếu nhiều tín hiệu cùng kỳ; quy mô khác nhau chưa chứng minh tốt/kém.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Doanh thu chi nhánh (`store_revenue`) | VND | có | Tổng giá trị đơn HOAN_THANH/DANG_GIAO theo điểm bán, theo ngày tạo đơn. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |
| Số đơn chi nhánh (`store_order_count`) | đơn | có | Đếm mọi đơn của điểm bán, gồm cả đơn hủy; không thay thế số đơn hợp lệ khi tính AOV. | Toàn bộ bản ghi của đối tượng |  |
| AOV chi nhánh (`store_aov`) | VND | có | Trung bình giá trị đơn HOAN_THANH/DANG_GIAO của điểm bán; cần trọng số số đơn hợp lệ để gộp giữa các điểm bán. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |
| Số khách mua hàng (`purchasing_customer_count`) | khách | có | Đếm người dùng duy nhất có đơn HOAN_THANH/DANG_GIAO trong phạm vi; cùng khách có thể mua ở nhiều điểm bán, không cộng khách giữa nhóm. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Không cộng số khách khác nhau hoặc các giá trị trung bình giữa các nhóm để suy ra tổng. Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng.

## Chăm sóc khách hàng (`customer_care`)

Hội thoại, tin nhắn và tin chưa đọc CSKH; nội dung chat không được phân tích.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số hội thoại CSKH (`support_conversation_count`) | hội thoại | có | Hội thoại CSKH mở theo ngày tạo; không suy ra mức hài lòng. | Toàn bộ bản ghi của đối tượng |  |
| Tin khách chưa đọc (`support_unread_customer_messages`) | tin | hiện trạng | Tổng tin khách gửi mà nhân sự chưa đọc hiện tại. | Toàn bộ bản ghi của đối tượng |  |
| Số tin nhắn CSKH (`support_message_count`) | tin | có | Tin nhắn CSKH theo vai trò người gửi. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Không có nội dung/liên hệ; chỉ số đếm và trạng thái. Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Câu trả lời khảo sát (`survey_answers`)

Lựa chọn trả lời và điểm theo từng câu hỏi khảo sát; chưa có mẫu số người được mời.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số lượt chọn trả lời khảo sát (`survey_answer_count`) | lượt | có | Số lựa chọn trả lời; câu chọn nhiều đếm mỗi lựa chọn, khác số người trả lời. | Toàn bộ bản ghi của đối tượng |  |
| Số phiếu trả lời khảo sát (`survey_respondent_count`) | phiếu | có | Số phiếu khác nhau có trả lời; không cộng giữa câu hỏi. | Toàn bộ bản ghi của đối tượng |  |
| Điểm khảo sát trung bình (`avg_survey_score`) | điểm | có | Trung bình điểm các câu dạng số; nên xem theo từng câu hỏi vì thang điểm có thể khác nhau. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng. Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Dòng món trong đơn (`order_items`)

Sản lượng và thành tiền ở mức dòng món.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số lượng sản phẩm bán (`quantity_sold`) | sản phẩm | có | Tổng số lượng trên dòng món thuộc đơn HOAN_THANH/DANG_GIAO; đếm số đơn vị bán, không phải số sản phẩm khác nhau. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |
| Doanh thu món (`item_revenue`) | VND | có | Tổng thành tiền dòng món thuộc đơn HOAN_THANH/DANG_GIAO; không mặc định bằng tổng tiền đơn. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |
| Lượt chọn topping (`topping_selection_count`) | lượt | có | Số lựa chọn topping trên các dòng món (một dòng chọn 2 topping = 2 lượt); không nhân theo số ly. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng.

## Giao dịch thanh toán (`payments`)

Giao dịch theo ngày giao dịch; không đồng nhất đơn hàng hay doanh thu bán hàng.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số giao dịch (`payment_count`) | lượt | có | Đếm mọi giao dịch theo ngày tạo giao dịch, gồm mọi trạng thái; không mặc định bằng số đơn thanh toán thành công. | Toàn bộ bản ghi của đối tượng |  |
| Doanh thu thanh toán (`payment_revenue`) | VND | có | Tổng số tiền giao dịch theo ngày tạo giao dịch, gồm mọi trạng thái; không mặc định là doanh thu thuần hoặc dòng tiền thành công. | Mọi giao dịch thanh toán, gồm mọi trạng thái; thời gian theo ngày tạo giao dịch. Không đồng nhất với doanh thu đơn hàng. |  |
| Tiền thanh toán thành công (`settled_payment_amount`) | VND | có | Tổng tiền giao dịch đã thanh toán (SUCCESS, THANH_CONG, DA_THANH_TOAN); khác số tiền mọi lần thử. | Toàn bộ bản ghi của đối tượng |  |
| Giao dịch chưa thanh toán (`unsettled_payment_count`) | giao dịch | có | Giao dịch đang chờ thu tiền hoặc thất bại; không phải doanh thu. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng.

## Giao hàng và shipper (`delivery`)

Chuyến giao theo ngày nhận chuyến: số chuyến, tỷ lệ thành công, thời gian giao; điểm và tổng chuyến shipper hiện tại.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Tổng chuyến giao (`total_deliveries`) | lượt | hiện trạng | Tổng bộ đếm chuyến giao tích lũy hiện tại của shipper; chưa có nhật ký chuyến hoặc lịch sử theo kỳ. | Toàn bộ bản ghi của đối tượng |  |
| Điểm hồ sơ tài xế (`driver_rating`) | điểm | hiện trạng | Trung bình trường điểm đánh giá hiện tại của shipper; chưa có cỡ mẫu đánh giá và lịch sử từng chuyến. | Toàn bộ bản ghi của đối tượng |  |
| Số chuyến giao (`delivery_count`) | lượt | có | Đếm mọi chuyến được phân công theo thời điểm nhận chuyến, gồm mọi trạng thái. | Toàn bộ chuyến giao | CANCELLED gồm chuyến bị hủy do hủy đơn hoặc phân công lại, không chỉ lỗi của shipper; FAILED là chuyến shipper báo thất bại. |
| Số chuyến giao thành công (`delivered_count`) | lượt | có | Đếm chuyến có trạng thái DELIVERED theo thời điểm nhận chuyến. | Chuyến giao có trạng thái DELIVERED | CANCELLED gồm chuyến bị hủy do hủy đơn hoặc phân công lại, không chỉ lỗi của shipper; FAILED là chuyến shipper báo thất bại. |
| Số chuyến không thành công (`failed_or_cancelled_delivery_count`) | lượt | có | Đếm chuyến đã kết thúc nhưng không giao thành công (FAILED hoặc CANCELLED). | Chuyến giao FAILED hoặc CANCELLED | CANCELLED gồm chuyến bị hủy do hủy đơn hoặc phân công lại, không chỉ lỗi của shipper; FAILED là chuyến shipper báo thất bại. |
| Tỷ lệ giao thành công (`delivery_success_rate`) | % | có | Phần trăm chuyến giao thành công trên các chuyến đã kết thúc (DELIVERED, FAILED, CANCELLED); chuyến đang xử lý không vào mẫu số. | Chuyến giao đã kết thúc: DELIVERED, FAILED, CANCELLED | CANCELLED gồm chuyến bị hủy do hủy đơn hoặc phân công lại, không chỉ lỗi của shipper; FAILED là chuyến shipper báo thất bại. |
| Thời gian giao trung bình (`avg_delivery_minutes`) | phút | có | Trung bình số phút từ lúc lấy hàng đến lúc giao xong, chỉ trên chuyến DELIVERED có đủ hai mốc thời gian. | Chuyến giao DELIVERED có thời điểm lấy hàng và kết thúc | CANCELLED gồm chuyến bị hủy do hủy đơn hoặc phân công lại, không chỉ lỗi của shipper; FAILED là chuyến shipper báo thất bại. |
| Chuyến giao lệch khóa tài xế (`delivery_driver_key_conflict_count`) | chuyến | có | Chuyến có hai khóa tài xế khác nhau; chưa chứng nhận phân tích theo tài xế. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Nguồn hiện tại chưa có lịch sử theo kỳ cho các chỉ số này. Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Không cộng số khách khác nhau hoặc các giá trị trung bình giữa các nhóm để suy ra tổng. Cần số lượt quan sát hoặc đánh giá để kiểm tra cỡ mẫu trước khi kết luận về chất lượng. Chỉ số phản ánh hiện trạng tại thời điểm quan sát; không suy ra diễn biến quá khứ. Nguồn có lỗi toàn vẹn đã biết; xem giới hạn chỉ số.

## Khung giờ bán hàng (`hourly`)

Lượng đơn theo giờ tạo đơn tại múi giờ kinh doanh.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số đơn theo giờ (`hourly_orders`) | đơn | có | Đếm mọi đơn theo giờ của ngày tạo đơn, gồm cả đơn hủy; chưa chuẩn hóa theo số ngày quan sát. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Khuyến mãi và voucher (`promotions`)

Đơn có voucher, giảm giá, doanh thu tập voucher và lượt sử dụng khuyến mãi; không có ROI hay mẫu số phát hành.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Doanh thu đơn có khuyến mãi (`voucher_revenue`) | VND | có | Tổng giá trị đơn HOAN_THANH/DANG_GIAO có mã voucher; mô tả tập đơn dùng voucher, chưa chứng minh hiệu quả tăng thêm. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO']; có voucher |  |
| Tổng tiền đã giảm giá (`discount_amount`) | VND | có | Tổng số tiền giảm trên đơn HOAN_THANH/DANG_GIAO có mã voucher; không phải chi phí đầy đủ của chiến dịch. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO']; có voucher |  |
| Số đơn áp dụng khuyến mãi (`voucher_order_count`) | đơn | có | Đếm đơn có mã voucher ở mọi trạng thái; khác quần thể doanh thu đơn voucher hợp lệ. | có voucher |  |
| Lượt sử dụng khuyến mãi (`promotion_redemption_count`) | lượt | có | Số lượt sử dụng khuyến mãi theo sổ sử dụng của dịch vụ định danh (một dòng mỗi lượt), theo ngày sử dụng. | Toàn bộ lượt sử dụng khuyến mãi đã ghi nhận | Khác chỉ số Số đơn dùng voucher (mã voucher ghi trên đơn); lượt không khớp đơn sẽ không có chi nhánh. |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng.

## Khách đăng ký và hội viên (`customers`)

Khách đăng ký theo ngày tạo; chi tiêu và điểm là hiện trạng, không phải khách mua trong kỳ.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số khách (`customer_count`) | khách | có | Đếm định danh khách đăng ký vai trò CUSTOMER theo ngày tạo tài khoản; không phải số khách đã mua. Chỉ cộng nhóm khách không giao nhau. | Vai trò: CUSTOMER |  |
| Tổng chi tiêu tích lũy (`total_spent`) | VND | hiện trạng | Tổng trường chi tiêu tích lũy hiện tại trên tài khoản CUSTOMER; chưa có lịch sử theo kỳ, không phải chi tiêu phát sinh trong kỳ đăng ký. | Vai trò: CUSTOMER |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Khả dụng bán (`inventory`)

Món × điểm bán đang mở/tạm ngưng; không quản lý số lượng tồn.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Vị trí bán đã cấu hình (`sale_positions`) | vị trí | hiện trạng | Cặp món × điểm bán có cấu hình mở bán. | Bản ghi cấu hình | Theo quy tắc checkout: chỉ vị trí đã cấu hình với trạng thái không phải mở bán mới chặn đặt món; món chưa cấu hình tại điểm bán không bị coi là ngưng bán.; Số lượng tồn trong nguồn không dùng cho nghiệp vụ hiện hành. |
| Vị trí tạm ngưng bán (`paused_sale_positions`) | vị trí | hiện trạng | Cặp món × điểm bán đang không mở bán (checkout chặn); không phải hết hàng. | Cấu hình mở bán khác true | Theo quy tắc checkout: chỉ vị trí đã cấu hình với trạng thái không phải mở bán mới chặn đặt món; món chưa cấu hình tại điểm bán không bị coi là ngưng bán.; Số lượng tồn trong nguồn không dùng cho nghiệp vụ hiện hành. |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Chỉ số phản ánh hiện trạng tại thời điểm quan sát; không suy ra diễn biến quá khứ. Nguồn hiện tại chưa có lịch sử theo kỳ cho các chỉ số này.

## Khảo sát khách hàng (`customer_surveys`)

Số phản hồi khảo sát; chưa có thang điểm hài lòng chuẩn.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số lượt phản hồi khảo sát (`survey_response_count`) | lượt | có | Đếm phản hồi khảo sát theo ngày tạo, chưa có mẫu số người được mời nên không tính tỷ lệ phản hồi. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Mạng lưới nhượng quyền (`franchise_network`)

Hồ sơ đăng ký, hợp đồng hiệu lực và kiosk; trạng thái hồ sơ là hiện tại.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số hồ sơ nhượng quyền (`franchise_application_count`) | hồ sơ | có | Hồ sơ đăng ký theo ngày nộp; trạng thái là hiện tại, không có lịch sử từng bước. | Toàn bộ bản ghi của đối tượng |  |
| Hồ sơ nhượng quyền đã duyệt (`franchise_approved_count`) | hồ sơ | có | Hồ sơ có trạng thái DA_DUYET hiện tại. | Toàn bộ bản ghi của đối tượng |  |
| Hợp đồng nhượng quyền hiệu lực (`active_franchise_contract_count`) | hợp đồng | hiện trạng | Hợp đồng HIEU_LUC hiện tại. | Toàn bộ bản ghi của đối tượng |  |
| Số kiosk trong danh mục (`kiosk_count`) | kiosk | hiện trạng | Kiosk trong danh mục nhượng quyền hiện tại. | Toàn bộ bản ghi của đối tượng |  |
| Kiosk chưa khớp điểm bán (`unmapped_kiosk_count`) | kiosk | hiện trạng | Kiosk không có chi nhánh cùng mã; số liệu bán của nó không gắn được điểm bán. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Chỉ số phản ánh hiện trạng tại thời điểm quan sát; không suy ra diễn biến quá khứ. Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Sản phẩm (`products`)

Sản lượng và doanh thu dòng món; không đồng nhất doanh thu đơn.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số lượng sản phẩm bán (`quantity_sold`) | sản phẩm | có | Tổng số lượng trên dòng món thuộc đơn HOAN_THANH/DANG_GIAO; đếm số đơn vị bán, không phải số sản phẩm khác nhau. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |
| Doanh thu sản phẩm (`product_revenue`) | VND | có | Tổng thành tiền dòng sản phẩm thuộc đơn HOAN_THANH/DANG_GIAO; không mặc định đối soát bằng doanh thu cấp đơn. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng.

## Sản phẩm yêu thích (`wishlist_favorites`)

Lượt lưu yêu thích; không phải lượng bán.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số lượt thả tim yêu thích (`favorite_count`) | lượt | có | Đếm bản ghi yêu thích sản phẩm theo ngày tạo; thể hiện quan tâm, không phải mua hàng hoặc chuyển đổi. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Thưởng loyalty và lên hạng (`loyalty_awards`)

Điểm thưởng ghi theo đơn và lượt lên hạng; nguồn hiện chưa có bản ghi.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Điểm loyalty đã thưởng (`loyalty_points_awarded`) | điểm | có | Điểm thưởng ghi theo đơn; nguồn hiện rỗng nên không suy ra từ số dư. | Toàn bộ bản ghi của đối tượng |  |
| Số lần lên hạng (`tier_upgrade_count`) | lượt | có | Lượt thưởng làm đổi hạng; không dựng lịch sử từ hạng hiện tại. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Nguồn chưa có bản ghi; 0 là thật. Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Thẻ quà tặng (`gift_cards`)

Phát hành, trạng thái và số dư thẻ quà; REDEEMED chưa chứng minh ghi có ví.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số thẻ quà phát hành (`gift_card_issued_count`) | thẻ | có | Số thẻ quà tặng phát hành theo ngày phát hành; chưa chứng minh đã thanh toán. | Toàn bộ bản ghi của đối tượng |  |
| Mệnh giá thẻ quà phát hành (`gift_card_issued_value`) | VND | có | Tổng mệnh giá phát hành; không phải doanh thu và không cộng với thanh toán đơn. | Toàn bộ bản ghi của đối tượng |  |
| Số dư thẻ quà chưa dùng (`gift_card_outstanding_balance`) | VND | hiện trạng | Số dư hiện tại của thẻ ACTIVE/CLAIMED. | Toàn bộ bản ghi của đối tượng |  |
| Số thẻ quà đã đổi (`gift_card_redeemed_count`) | thẻ | có | Thẻ có trạng thái REDEEMED; chưa chứng minh tiền đã ghi có vào ví. | Toàn bộ bản ghi của đối tượng | Luồng chuyển thẻ sang ví tạo giao dịch nạp PENDING rồi đặt thẻ REDEEMED; REDEEMED không chứng minh đã ghi có. |

Lưu ý: Nguồn có lỗi toàn vẹn đã biết; xem giới hạn chỉ số. Không có nội dung/liên hệ; chỉ số đếm và trạng thái.

## Tin tức (`news_content`)

Bài viết đã xuất bản và lượt xem tích lũy; không có CTR/engagement theo kỳ.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số bài viết đã xuất bản (`published_article_count`) | bài | có | Bài viết đang xuất bản theo ngày tạo. | Toàn bộ bản ghi của đối tượng |  |
| Lượt xem bài viết tích lũy (`article_view_total`) | lượt | hiện trạng | Bộ đếm tích lũy hiện tại; không có lịch sử, CTR hay người đọc duy nhất. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Chỉ số phản ánh hiện trạng tại thời điểm quan sát; không suy ra diễn biến quá khứ. Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Tiền COD và ví shipper (`shipper_finance`)

COD đã nộp/chờ, COD đang giữ, số dư ví shipper; tách ví khách.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Tiền COD đã nộp (`cod_remitted_amount`) | VND | có | Tiền thu hộ shipper đã nộp và được xác nhận. | Toàn bộ bản ghi của đối tượng |  |
| Tiền COD chờ xác nhận (`cod_pending_remit_amount`) | VND | có | Tiền nộp chưa được xác nhận. | Toàn bộ bản ghi của đối tượng |  |
| COD shipper đang giữ (`shipper_cod_holding`) | VND | hiện trạng | Tổng tiền thu hộ shipper đang giữ hiện tại. | Toàn bộ bản ghi của đối tượng |  |
| Số dư ví shipper (`shipper_wallet_balance`) | VND | hiện trạng | Tổng số dư ví shipper hiện tại; không phải tiền đã chi trả. | Toàn bộ bản ghi của đối tượng |  |
| Số ngoại lệ giao hàng (`delivery_exception_count`) | lượt | có | Sự cố shipper báo; nguồn hiện chưa có bản ghi. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng.

## Tài chính nhượng quyền (`franchise_finance`)

Combo, công nợ, royalty, đối soát, thu chi và ví chủ kiosk; tách doanh thu bán lẻ.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số đơn mua combo (`combo_order_count`) | đơn | có | Đơn kiosk mua combo nguyên liệu theo ngày đặt. | Toàn bộ bản ghi của đối tượng |  |
| Giá trị đơn mua combo (`combo_order_value`) | VND | có | Tổng giá trị đơn combo; là doanh thu cung ứng cho kiosk, khác doanh thu bán lẻ. | Toàn bộ bản ghi của đối tượng |  |
| Số combo đã đặt (`combo_units_ordered`) | combo | có | Tổng số combo đặt; không phải tồn kho món bán lẻ. | Toàn bộ bản ghi của đối tượng |  |
| Công nợ chưa thanh toán (`debt_outstanding_amount`) | VND | hiện trạng | Nợ kiosk chưa thanh toán hiện tại (gồm quá hạn). | Toàn bộ bản ghi của đối tượng |  |
| Công nợ quá hạn (`debt_overdue_amount`) | VND | hiện trạng | Nợ kiosk ở trạng thái QUA_HAN hiện tại. | Toàn bộ bản ghi của đối tượng |  |
| Phí phạt trễ hạn (`debt_late_fee_amount`) | VND | hiện trạng | Tổng phí phạt trễ hạn đã ghi nhận hiện tại. | Toàn bộ bản ghi của đối tượng |  |
| Royalty phải thu (`royalty_billed_amount`) | VND | có | Royalty tính cho tháng; phải thu, không phải tiền đã nhận. | Toàn bộ bản ghi của đối tượng |  |
| Royalty đã thanh toán (`royalty_paid_amount`) | VND | có | Royalty có trạng thái DA_THANH_TOAN. | Toàn bộ bản ghi của đối tượng |  |
| Số kỳ đối soát kiosk (`kiosk_reconciliation_count`) | kỳ | có | Kết quả đối soát doanh thu kiosk theo ngày đối soát. | Toàn bộ bản ghi của đối tượng |  |
| Đối soát kiosk cảnh báo đỏ (`kiosk_red_alert_count`) | kỳ | có | Kỳ đối soát mức DO; là tín hiệu kiểm tra, không kết luận gian lận. | Toàn bộ bản ghi của đối tượng |  |
| Số tiền thu chi nhượng quyền (`franchise_cashbook_amount`) | VND | có | Tổng tiền phiếu thu chi theo loại phiếu; nguồn hiện rỗng. | Toàn bộ bản ghi của đối tượng |  |
| Tiền chủ kiosk nạp ví (`owner_wallet_topup_amount`) | VND | có | Tiền chủ kiosk nạp vào ví identity. | Toàn bộ bản ghi của đối tượng |  |
| Chủ kiosk trả công nợ qua ví (`owner_debt_payment_amount`) | VND | có | Tiền trả công nợ từ ví (ghi âm ở nguồn, hiển thị dương). | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng. Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Ví khách hàng (`customer_wallet`)

Nạp, chi, hoàn qua ví khách và số dư hiện tại; tiền nạp không là doanh thu.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Tiền nạp ví thành công (`wallet_topup_amount`) | VND | có | Tổng tiền nạp ví SUCCESS; không phải doanh thu bán hàng. | Toàn bộ bản ghi của đối tượng |  |
| Chi tiêu bằng ví (`wallet_spend_amount`) | VND | có | Tổng thanh toán đơn bằng ví SUCCESS. | Toàn bộ bản ghi của đối tượng | Phần lớn giao dịch PAYMENT thiếu mã tham chiếu; chưa đối soát được từng đơn. |
| Tiền hoàn vào ví (`wallet_refund_amount`) | VND | có | Tổng hoàn tiền vào ví SUCCESS; khác đơn bị hủy chưa thanh toán. | Toàn bộ bản ghi của đối tượng |  |
| Lượt nạp ví đang chờ (`wallet_pending_topup_count`) | lượt | có | Lượt nạp chưa thành công; không cộng vào tiền nạp. | Toàn bộ bản ghi của đối tượng |  |
| Thanh toán ví thiếu tham chiếu (`wallet_unreferenced_payment_count`) | lượt | có | Thanh toán ví SUCCESS không có mã tham chiếu (lỗi toàn vẹn nguồn). | Toàn bộ bản ghi của đối tượng |  |
| Số dư ví khách hiện tại (`customer_wallet_balance`) | VND | hiện trạng | Tổng số dư hiện tại; không suy ra số dư quá khứ. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng.

## Vận hành kiosk (`kiosk_operations`)

Ca bán, doanh thu chốt ca, chênh lệch tiền và giá riêng của kiosk.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Số ca kiosk (`kiosk_shift_count`) | ca | có | Phiên ca bán hàng kiosk theo giờ mở ca. | Toàn bộ bản ghi của đối tượng |  |
| Doanh thu ca kiosk (`kiosk_shift_revenue`) | VND | có | Doanh thu hệ thống chốt ở ca đã đóng; là số đã chốt, không cộng lại với đơn hàng. | Toàn bộ bản ghi của đối tượng |  |
| Chênh lệch tiền mặt ca kiosk (`kiosk_cash_difference`) | VND | có | Tổng chênh lệch tiền mặt ca đã đóng; tín hiệu đối chiếu, không cáo buộc. | Toàn bộ bản ghi của đối tượng |  |
| Số giá riêng tại kiosk (`kiosk_price_override_count`) | cấu hình | hiện trạng | Số cặp kiosk × món có giá riêng hiện tại. | Toàn bộ bản ghi của đối tượng |  |
| Giá kiosk cao hơn niêm yết (`kiosk_price_above_list_count`) | cấu hình | hiện trạng | Cấu hình giá kiosk cao hơn giá niêm yết hiện tại. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng. Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Đánh giá chi nhánh (`store_reviews`)

Điểm dịch vụ và số lượt; không suy ra nguyên nhân.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Điểm phục vụ trung bình (`avg_store_rating`) | điểm | có | Trung bình số sao đánh giá chi nhánh, làm tròn hai chữ số; đọc cùng cỡ mẫu đánh giá, không cộng trung bình nhóm. | Toàn bộ bản ghi của đối tượng | Gồm mọi trạng thái (quản lý xem tất cả); API công khai chỉ hiện APPROVED — lọc "Hiển thị công khai" để khớp trang khách. |
| Số lượt đánh giá quán (`store_review_count`) | lượt | có | Đếm bản ghi đánh giá chi nhánh theo ngày tạo đánh giá; không phải số khách duy nhất. | Toàn bộ bản ghi của đối tượng | Gồm mọi trạng thái (quản lý xem tất cả); API công khai chỉ hiện APPROVED — lọc "Hiển thị công khai" để khớp trang khách. |
| Số đánh giá chi nhánh công khai (`public_store_review_count`) | lượt | có | Đánh giá APPROVED như trang công khai. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Không cộng số khách khác nhau hoặc các giá trị trung bình giữa các nhóm để suy ra tổng. Cần số lượt quan sát hoặc đánh giá để kiểm tra cỡ mẫu trước khi kết luận về chất lượng.

## Đánh giá sản phẩm (`product_reviews`)

Điểm quan sát và số lượt; cần đọc cùng cỡ mẫu.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Điểm đánh giá trung bình (`avg_product_rating`) | điểm | có | Trung bình số sao đánh giá sản phẩm, làm tròn hai chữ số; đọc cùng số lượt đánh giá, không cộng trung bình nhóm. | Toàn bộ bản ghi của đối tượng |  |
| Số lượt đánh giá (`review_count`) | lượt | có | Đếm bản ghi đánh giá sản phẩm theo ngày tạo đánh giá; không phải số người đánh giá duy nhất. | Toàn bộ bản ghi của đối tượng |  |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Không cộng số khách khác nhau hoặc các giá trị trung bình giữa các nhóm để suy ra tổng. Cần số lượt quan sát hoặc đánh giá để kiểm tra cỡ mẫu trước khi kết luận về chất lượng.

## Đơn hàng và doanh thu (`orders`)

Quy mô bán hàng, khách mua và kênh phục vụ.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Doanh thu (`revenue`) | VND | có | Tổng giá trị đơn HOAN_THANH hoặc DANG_GIAO, theo ngày tạo đơn; không bao gồm đơn hủy. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |
| Số lượng đơn (`order_count`) | đơn | có | Đếm mọi đơn theo ngày tạo, gồm cả đơn hủy; không dùng làm mẫu số AOV của tập đơn hợp lệ. | Toàn bộ bản ghi của đối tượng |  |
| Giá trị đơn trung bình (`aov`) | VND | có | Tổng giá trị chia số đơn trong cùng tập HOAN_THANH/DANG_GIAO. Không cộng hoặc lấy trung bình các AOV nhóm. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |
| Số khách mua hàng (`purchasing_customer_count`) | khách | có | Đếm người dùng duy nhất có đơn HOAN_THANH/DANG_GIAO trong phạm vi; cùng khách có thể mua ở nhiều điểm bán, không cộng khách giữa nhóm. | Trạng thái đơn: ['HOAN_THANH', 'DANG_GIAO'] |  |
| Tỷ lệ hủy đơn (`order_cancellation_rate`) | % | có | Phần trăm đơn bị hủy (DA_HUY) trên các đơn đã kết thúc (HOAN_THANH + DA_HUY) theo ngày tạo đơn; đơn đang xử lý không vào mẫu số. | Đơn đã kết thúc theo vòng đời order-service: HOAN_THANH, DA_HUY | Đơn còn đang xử lý (MOI_TAO, DA_XAC_NHAN, DANG_CHUAN_BI, DANG_GIAO) tại lần đồng bộ không vào mẫu số; kỳ gần nhất có thể thay đổi khi các đơn này kết thúc. |
| Tỷ lệ hoàn thành đơn (`order_completion_rate`) | % | có | Phần trăm đơn hoàn thành (HOAN_THANH) trên các đơn đã kết thúc (HOAN_THANH + DA_HUY) theo ngày tạo đơn; đơn đang xử lý không vào mẫu số. | Đơn đã kết thúc theo vòng đời order-service: HOAN_THANH, DA_HUY | Đơn còn đang xử lý (MOI_TAO, DA_XAC_NHAN, DANG_CHUAN_BI, DANG_GIAO) tại lần đồng bộ không vào mẫu số; kỳ gần nhất có thể thay đổi khi các đơn này kết thúc. |
| Đơn không gắn tài khoản (`anonymous_order_count`) | đơn | có | Đơn hiện không gắn tài khoản; chủ đơn có thể đổi sau liên kết. | Toàn bộ bản ghi của đối tượng | Đơn khách vãng lai đã liên kết tài khoản được tính theo chủ hiện tại. |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu. Không cộng số khách khác nhau hoặc các giá trị trung bình giữa các nhóm để suy ra tổng. Mỗi chỉ số được đo lường độc lập theo điều kiện nghiệp vụ riêng.

## Đối soát thu ngân (`cashier_reconciliation`)

Chênh lệch tiền có dấu; tổng bù trừ không đo mức sai lệch tuyệt đối.

| Chỉ số | Đơn vị | Lịch sử | Định nghĩa | Quần thể | Giới hạn |
|---|---|---|---|---|---|
| Tổng tiền chênh lệch (`total_cash_difference`) | VND | có | Tổng chênh lệch tiền mặt có dấu theo ngày tạo ca đối soát; số âm và dương có thể bù nhau, không phải tổng độ lệch tuyệt đối. | Toàn bộ bản ghi của đối tượng |  |
| Doanh thu tiền mặt hệ thống (`system_cash_revenue`) | VND | có | Tổng trường tiền mặt hệ thống theo ngày tạo ca đối soát; khác quần thể doanh thu đơn hàng. | Toàn bộ bản ghi của đối tượng |  |
| Số ca đã đối soát (`reconciled_shifts`) | lượt | có | Đếm ca đối soát theo ngày tạo ca, không suy ra tất cả ca đã được phê duyệt. | Toàn bộ bản ghi của đối tượng |  |
| Số ca lệch tiền lớn (`large_cash_discrepancy_shift_count`) | ca | có | Đếm ca đối soát có giá trị tuyệt đối chênh lệch tiền mặt lớn hơn 500.000 VND/ca. 500.000 VND là ngưỡng mặc định hệ thống, không phải chuẩn nghiệp vụ phổ quát. | Toàn bộ ca đối soát; đếm ca có /chênh lệch/ > 500.000 VND | Ngưỡng 500.000 VND/ca là mặc định hệ thống, có thể cấu hình; chênh lệch có dấu xem ở chỉ số Chênh lệch tiền. |

Lưu ý: Số liệu phản ánh theo thực tế ghi nhận từ hệ thống dữ liệu.

## Khái niệm chưa hỗ trợ (có giải thích)

| Khái niệm | Lý do | Giải thích |
|---|---|---|
| `ai_recommendation_uplift` | source_not_captured | Không có dữ liệu hiển thị/kết quả gợi ý để đo hiệu quả. |
| `cart_abandonment` | source_not_captured | Chỉ có giỏ hiện tại, không có lịch sử phiên để đo bỏ giỏ. |
| `chat_content_analysis` | policy_restricted | Nội dung hội thoại không đưa vào phân tích; có số hội thoại và tin nhắn. |
| `content_engagement` | source_not_captured | Chỉ có bộ đếm lượt xem tích lũy của bài viết. |
| `delivery_on_time_rate` | source_not_captured | Không có cam kết thời gian giao (SLA) nên không tính tỷ lệ đúng giờ. |
| `franchise_stage_duration` | source_not_captured | Chỉ có trạng thái hồ sơ hiện tại, không có lịch sử từng bước. |
| `gift_card_credited_amount` | source_integrity_issue | Luồng chuyển thẻ sang ví chưa chứng minh ghi có; chỉ báo trạng thái thẻ. |
| `integration_callbacks` | technical_excluded | Callback/outbox là dữ liệu kỹ thuật, không phải giao dịch nghiệp vụ. |
| `marketing_roi` | definition_unavailable | Chưa có chi phí marketing để tính ROI thực sự. |
| `notification_read_rate` | source_not_captured | Bản ghi thông báo không chứng minh đã gửi hay đã đọc. |
| `physical_stock_quantity` | definition_unavailable | Không quản lý số lượng tồn; chỉ bật/tắt mở bán. |
| `review_text_topics` | definition_unavailable | Đã hỗ trợ số sao; chưa phân loại nội dung nhận xét. |
| `shipper_payout` | source_not_captured | Không có sổ chi trả shipper; có số dư ví và COD hiện tại. |
| `table_occupancy` | source_not_captured | Không có sức chứa/lượt ngồi; hiện không đơn nào gắn bàn. |
| `wheel_spin_history` | source_not_captured | Không có sổ ghi lượt quay; chỉ có voucher vòng quay đã phát. |

## Nhóm nghiệp vụ B01–B34

| Nhóm | Trạng thái | Miền | Mục còn mở |
|---|---|---|---|
| B01 Đơn hàng/kênh | AVAILABLE | orders, order_items, hourly | UNVERIFIED_PROVENANCE: Đơn có trạng thái LAY_TAI_QUAN ít (4 đơn); funnel trạng thái theo thời gian cần lịch sử chuyển trạng thái |
| B02 Món/biến thể | AVAILABLE | products, order_items | NO_ROWS: custom_attributes của 72.063 dòng món đều {}: không có thuộc tính tùy chỉnh để phân tích; UNVERIFIED_PROVENANCE: Size ghi lẫn M/L/Vừa/Nhỏ/Lớn: báo nguyên văn, không tự gộp |
| B03 Khả dụng bán | AVAILABLE | inventory | SOURCE_NOT_CAPTURED: Không có lịch sử bật/tắt: thời gian ngưng bán, doanh thu mất không tính được |
| B04 Đánh giá sản phẩm | AVAILABLE | product_reviews | UNVERIFIED_PROVENANCE: 3.004/3.005 nhận xét có tiền tố [Dữ liệu mẫu]; SOURCE_NOT_CAPTURED: Chưa phân loại nội dung nhận xét (review_text_topics) |
| B05 Đánh giá chi nhánh | AVAILABLE | store_reviews | UNVERIFIED_PROVENANCE: HIEN_THI (2.065) chưa có quyết định ánh xạ công khai; mặc định quản lý xem mọi trạng thái, lọc review_visibility để khớp trang khách |
| B06 Khảo sát | AVAILABLE | customer_surveys, survey_answers | SOURCE_NOT_CAPTURED: Không có mẫu số người được mời nên không có tỷ lệ phản hồi; SOURCE_NOT_CAPTURED: Biểu mẫu không lưu version: tiêu đề câu hỏi lấy tại lúc trả lời |
| B07 Khách hàng/loyalty | AVAILABLE | customers, loyalty_awards | NO_ROWS: loyalty_order_award chưa có bản ghi: điểm thưởng/lên hạng = 0 thật; SOURCE_NOT_CAPTURED: Không có lịch sử hạng trước khi có award ledger |
| B08 Vòng quay | SOURCE_NOT_CAPTURED | — | SOURCE_NOT_CAPTURED: Không có ledger lượt quay; khái niệm wheel_spin_history được giải thích, chỉ báo voucher đã phát |
| B09 Ví khách hàng | AVAILABLE | customer_wallet | SOURCE_INTEGRITY_ISSUE: 62/72 PAYMENT SUCCESS thiếu reference: có metric wallet_unreferenced_payment_count, chưa đối soát từng đơn |
| B10 Thẻ quà tặng | SOURCE_INTEGRITY_ISSUE | gift_cards | SOURCE_INTEGRITY_ISSUE: transferGiftCardBalance tạo TOP_UP PENDING rồi đặt REDEEMED: tiền chuyển ví bị chặn (gift_card_credited_amount) |
| B11 Khuyến mãi/voucher | AVAILABLE | promotions | UNSUPPORTED_ANALYSIS: Không có khóa nghiệp vụ nối voucher identity với voucher đơn: bảng claim là outbox/idempotency kỹ thuật; hai namespace báo cáo riêng |
| B12 Yêu thích/giỏ hàng | AVAILABLE | wishlist_favorites | SOURCE_NOT_CAPTURED: Giỏ hiện tại không phải bỏ giỏ (cart_abandonment) |
| B13 Địa chỉ | POLICY_RESTRICTED | — | POLICY_RESTRICTED: Liên hệ/địa chỉ là PII: sensitive_request_concepts chặn |
| B14 Thanh toán/hoàn tiền | AVAILABLE | payments | UNVERIFIED_PROVENANCE: Trạng thái thành công ghi 3 cách (SUCCESS/THANH_CONG/DA_THANH_TOAN); payment_revenue gồm mọi lần thử |
| B15 Bàn/QR | SOURCE_NOT_CAPTURED | — | NO_ROWS: 0/40.460 đơn gắn ma_ban; SOURCE_NOT_CAPTURED: Không có sức chứa/lượt ngồi (table_occupancy) |
| B16 Ca làm/chấm công | AVAILABLE | staff_shifts |  |
| B17 Chốt ca/đối soát | AVAILABLE | cashier_reconciliation |  |
| B18 Giao hàng | AVAILABLE | delivery | SOURCE_INTEGRITY_ISSUE: 7.472/7.857 chuyến lệch khóa tài xế: metric delivery_driver_key_conflict_count, chưa chứng nhận phân tích theo tài xế |
| B19 Ví/COD shipper | AVAILABLE | shipper_finance | SOURCE_INTEGRITY_ISSUE: API getKpiData/getFinanceData trả số cố định (app NestJS, ngoài data-platform) — không ingest; NO_ROWS: shipper_schedule/shipper_exception chưa có bản ghi; SOURCE_NOT_CAPTURED: Không có sổ chi trả shipper (shipper_payout) |
| B20 CSKH/chat | AVAILABLE | customer_care | POLICY_RESTRICTED: Nội dung chat bị loại khỏi kho (chat_content_analysis) |
| B21 Tin tức/static | AVAILABLE | news_content | SOURCE_NOT_CAPTURED: Không có CTR/engagement theo kỳ (content_engagement) |
| B22 Mạng lưới điểm bán | AVAILABLE | stores, franchise_network | SOURCE_INTEGRITY_ISSUE: 1/51 kiosk không khớp chi nhánh (unmapped_kiosk_count); UNVERIFIED_PROVENANCE: master_data.co_so chưa xác minh write-path |
| B23 Onboarding nhượng quyền | AVAILABLE | franchise_network | SOURCE_NOT_CAPTURED: Không có lịch sử từng bước hồ sơ (franchise_stage_duration) |
| B24 Combo nhượng quyền | AVAILABLE | franchise_finance | SOURCE_NOT_CAPTURED: Bảng giao combo satellite không có ở nguồn |
| B25 Công nợ/royalty | AVAILABLE | franchise_finance | UNVERIFIED_PROVENANCE: Royalty phải thu khác tiền đã thu; chỉ DA_THANH_TOAN được tính đã trả |
| B26 Đối soát/thu chi | AVAILABLE | franchise_finance | NO_ROWS: thu_chi và biên bản vi phạm chưa có bản ghi; TECHNICAL_EXCLUDED: audit_log là nhật ký kỹ thuật, không phải giao dịch |
| B27 POS/ca/giá kiosk | AVAILABLE | kiosk_operations | SOURCE_INTEGRITY_ISSUE: 4/6 ca kiosk dùng co_so_ma không khớp chi nhánh |
| B28 Ví identity/chủ kiosk | AVAILABLE | franchise_finance | UNVERIFIED_PROVENANCE: Chỉ quan sát chủ kiosk dùng ví identity; tách khỏi ví khách |
| B29 Tài khoản/cấu hình/thông báo | TECHNICAL_EXCLUDED | — | TECHNICAL_EXCLUDED: Cấu hình/secret ngoài analytics; thông báo không chứng minh đã đọc |
| B30 Nguồn phụ trợ | UNVERIFIED_PROVENANCE | — | UNVERIFIED_PROVENANCE: Chưa xác minh lineage/write-path; không dùng cho ROI/P&L |
| B31 Khách vãng lai/liên kết/reorder | AVAILABLE | orders | SOURCE_NOT_CAPTURED: Không có event liên kết/reorder: đơn tính theo chủ hiện tại |
| B32 Điểm/điều phối tài xế | SOURCE_INTEGRITY_ISSUE | delivery | SOURCE_INTEGRITY_ISSUE: driver_rating là điểm hồ sơ cập nhật trọng số, không có lịch sử lượt chấm; SOURCE_NOT_CAPTURED: Không có SLA (delivery_on_time_rate) |
| B33 AI commerce/ML/RAG | POLICY_RESTRICTED | — | SOURCE_NOT_CAPTURED: Không có exposure/outcome (ai_recommendation_uplift); POLICY_RESTRICTED: Prompt/chat/audio ngoài analytics |
| B34 Callback/async/kỹ thuật | TECHNICAL_EXCLUDED | — | TECHNICAL_EXCLUDED: Callback/outbox là kỹ thuật; queued ≠ settled; dùng cho freshness/health |
