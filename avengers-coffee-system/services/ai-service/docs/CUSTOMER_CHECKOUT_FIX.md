# Sửa luồng chọn món, giỏ hàng, voucher và checkout

## Nguyên nhân từ log và code

- `ToolArtifacts.validate_reply()` có thể thay toàn bộ câu trả lời bằng tài liệu RAG khi model đọc nhầm chính sách sau khi áp voucher.
- Voucher bị cắt còn 4 dòng trong cửa chọn mã và 5 dòng trong UI/memory. Một lần đọc mới cũng có thể giữ lại mã từ lần đọc trước.
- Bản sửa trước đã ép trả lời mọi nhóm tùy chọn, trái với yêu cầu mới chỉ hỏi nhóm `required=true` từ Menu. Topping có một giá trị cũng không được tự thêm tính phí.
- `set_pending_products(..., merge=True)` không thay hàng cùng tên, làm mất cập nhật option qua nhiều lượt.
- Kết quả `finish_cart` không mang theo báo giá có cấu trúc. Kết quả áp mã thiếu một số trường tiền trong projection/validation và không đóng đầy đủ trạng thái chọn voucher.
- Tool chọn giao hàng/thanh toán chỉ kiểm tra xung đột với lựa chọn rõ ràng; model vẫn có thể đề xuất một lựa chọn khách chưa nói.
- Log lần test 19:31 cho thấy `finish_cart` xong, provider trả 503 rồi model gọi `apply_voucher` ngay trong cùng lượt `oke vậy được rồi`. Gateway chưa có bằng chứng chọn voucher độc lập từ câu khách nói.
- Luồng LLM gọi `set_checkout_choices` chưa chủ động đọc và đề xuất địa chỉ hồ sơ cho cả ba cách nhận hàng, dù luồng cũ đã có logic này.
- `use_defaults=true` bị từ chối cả với món không có tùy chỉnh hoặc chỉ có công thức cố định. Model gọi lại nhiều lần, khiến câu trả lời chậm. Sau bước đã đủ dữ liệu để hỏi khách, hệ thống vẫn gọi provider thêm để viết câu trả lời.
- Log 20:07–20:09: model gửi `toppings=[]` nhưng gateway không nhận `k cần thêm topping`; câu `theo mặc định` cũng thiếu cờ `use_defaults` nên tiếp tục bị hỏi topping.
- Lượt gợi ý matcha có `rag_evidence_count=0` nhưng lời đáp vẫn mô tả hương vị. Validation trước đây chỉ kiểm tra từ trùng với mô tả và trích dẫn, chưa ngăn thêm đặc tính ngoài nguồn.
- Trang `ProductDetail` hiển thị `mo_ta` rồi thêm đoạn Highlands và ba câu quảng cáo cho mọi sản phẩm. Đây là nội dung frontend viết sẵn, không nằm trong mô tả Menu chatbot đọc.

## Hành vi sau sửa

LLM vẫn đọc ý định và đề xuất tool. Gateway kiểm tra lựa chọn, quyền thay đổi và dữ liệu thật. Các bước thêm/sửa/xóa món, hỏi option, hoàn tất giỏ và quyết định voucher có phần trình bày tiếng Việt dựa trên kết quả tool: lời nói lịch sự, xuống dòng, in đậm, đủ thông tin và câu hỏi tiếp theo.

Trong luồng `llm_tools`, chỉ nhóm `required=true` chưa có giá trị/mặc định hợp lệ mới cần hỏi. Không yêu cầu khách chọn hết. Tùy chọn bỏ trống dùng mặc định của Menu; topping tùy chọn mặc định là không thêm, kể cả khi chỉ có một topping. Giá trị khách yêu cầu không hợp lệ vẫn bị chặn. Bot liệt kê các nhóm với nhãn bắt buộc/tùy chọn/mặc định để khách hiểu lựa chọn.

`k/ko/không cần thêm topping` được nhận là danh sách rỗng. `theo mặc định` được xác minh từ câu khách nói ngay cả khi LLM quên cờ tool; chỉ điền phần còn thiếu và giữ các lựa chọn/số lượng đã có. Model đoán tùy chọn hoặc topping tính phí khi khách yêu cầu mặc định không được thay thế mặc định Menu. Sau cập nhật giỏ, bot hiện cấu hình món và hỏi thêm/sửa/xóa/hoàn tất; không chuyển ngay sang thanh toán.

Nguồn mô tả RAG là `menu.san_pham.mo_ta`, lọc theo canonical product ID. Trả lời mô tả giữ nội dung đầy đủ của nguồn, không cho phép trùng vài từ rồi thêm hương vị/thành phần khác. Danh sách gợi ý chỉ hiện tên/giá và mô tả đã đọc cho đúng ID, không suy ra hương vị từ tên món. Trang chi tiết và modal cũng chỉ hiển thị `mo_ta`; thiếu mô tả thì báo chưa có, không dùng nội dung quảng cáo thay thế.

Khi hoàn tất giỏ, bot hiện toàn bộ mã mà service xác định đủ điều kiện. Khi khách chọn mã tốt nhất, gateway kiểm tra mức giảm lớn nhất từ dữ liệu mới và yêu cầu model sửa nếu đề xuất mã giảm ít hơn. Sau áp/bỏ qua mã, bot hiện lại giỏ, mã đang áp dụng, khoản giảm và tổng sau giảm từ báo giá, rồi hỏi cách nhận và hiển thị phương thức thanh toán thật. Các hình thức nhận hàng được hiện trong nội dung chat; payment cards dùng payload sẵn có của frontend.

`oke vậy được rồi` và lời đồng ý chung chỉ hoàn tất giỏ: **không tự áp và không tự bỏ qua voucher**. Gateway yêu cầu lựa chọn voucher rõ ràng từ khách, độc lập với tool model đề xuất. Số lượng món, câu phủ định và câu hỏi về mã không được coi là chọn mã. Sau khi cập nhật giỏ, mã đã chọn trước đó vẫn được kiểm tra lại tính hợp lệ khi cần.

Khi khách chọn giao tận nơi, lấy tại quán hoặc dùng tại chỗ, bot đọc địa chỉ hồ sơ và hỏi khách có đang ở đó không. Nếu có nhiều địa chỉ, bot liệt kê và nhận lựa chọn theo số/tên hoặc địa chỉ mặc định. Chỉ lượt xác nhận sau mới được dùng địa chỉ đã lưu. Với giao hàng, địa chỉ dùng làm điểm giao; với lấy tại quán/dùng tại chỗ, chỉ dùng tìm chi nhánh gần khách và vẫn phải chờ khách chọn chi nhánh. Địa chỉ mới khách đã nói rõ được ưu tiên. Hồ sơ trống/đọc lỗi thì bot hỏi địa chỉ hoặc khu vực hiện tại. Lựa chọn tiền mặt cùng câu giao hàng được giữ và xác nhận trong lời đáp.

Context cho LLM có `business.next_step`, ghi bước còn thiếu từ trạng thái thực tế. Các mốc hỏi option, hiện voucher, áp/bỏ qua voucher và đề xuất địa chỉ hồ sơ được trả ngay từ dữ liệu tool khi đang chờ khách; không cần thêm một lượt provider để viết lại. Món không có tùy chỉnh/công thức cố định không còn bị chặn vì `use_defaults`. Món có tùy chỉnh vẫn phải có sự đồng ý dùng mặc định.

Nếu báo giá lỗi sau một thao tác đã thành công, trạng thái thành công và replay vẫn được giữ, nhưng bot không khẳng định tổng mới hoặc tiếp tục checkout. Phí giao hàng chỉ được xác minh khi đủ hình thức nhận và địa chỉ. Đơn vẫn chỉ được tạo sau xác nhận bản tóm tắt hợp lệ ở lượt tiếp theo.

## Bổ sung: chi nhánh, gián đoạn và chi phí token (02/10/2026)

Chuỗi chat 20:34–20:56 có lỗi tìm quán lấy tại quán với `session_id=''` nhưng không truyền giỏ đang đặt. Kiểm tra giỏ trống dẫn đến thẻ “còn đủ món”; khi chọn quán mới kiểm tra giỏ thật. Gateway từ chối đúng nhưng model diễn giải thành lỗi kết nối. Có lượt sửa khu vực gọi model 7 lần, hơn 53.000 input token; frontend hết thời gian chờ dù backend vẫn tiếp tục. Log cũng có timeout/503 từ provider thật.

Đã sửa:

- Tra cứu vị trí vẫn chỉ đọc, nhưng nhận `cart_items` từ trạng thái server để kiểm tra đúng món. Tham số này không được thêm vào schema cho model. Tìm quán ngoài luồng đặt hàng với giỏ trống không còn khẳng định đủ món trong giỏ.
- Đọc Menu và override cho các chi nhánh bằng hai truy vấn theo lô. Không dùng số lượng kho để kết luận còn bán. Menu đang bán + đọc thành công và không có override thì kế thừa mặc định; `dang_kinh_doanh=false` chặn đặt; lỗi đọc/NULL/không có sản phẩm Menu vẫn chưa xác minh.
- Tái sử dụng connection pool thay vì tạo engine mới mỗi lần; không cache kết quả tình trạng bán. Trả connection tra cứu danh tính trước khi đọc inventory để tránh giữ lồng nhiều connection.
- Trả ngay kết quả server ở ranh giới hiện quán/chờ chọn, từ chối quán, tóm tắt và biên nhận. Chọn quán mới tìm được trong cùng lượt vẫn bị chặn. Khi từ chối, cập nhật đúng thẻ và giữ nguyên số thứ tự; hiển thị món còn bán, tạm ngưng và chưa đọc được, không diễn giải thành lỗi kết nối.
- Nhận đúng trạng thái `success` thật của tạo đơn, khóa thao tác tiếp theo, xóa UI xác nhận cũ và giữ replay cùng ID. Không cần gọi provider lần nữa để viết lại biên nhận.
- Tóm tắt lấy từ `order_summary`: món và tùy chọn, mã/giảm giá, phí giao nếu có, tổng, chi nhánh/địa chỉ, cách nhận và phương thức thanh toán. Dùng chữ đậm, xuống dòng, đánh số/gạch đầu dòng. Chấp nhận câu “xác nhận đặt đơn”; câu phủ định hoặc kèm thay đổi vẫn không xác nhận.
- Trang giỏ trước đây chỉ tải inventory 15 quán nhưng mở rộng hiển thị cả những quán chưa tải. Nay mở rộng sẽ kiểm tra toàn bộ danh sách, tối đa bốn request đồng thời, cập nhật từng quán ngay khi có kết quả. Không tải lại chỉ vì đổi số lượng món. Trạng thái đang tải, đọc lỗi và tạm ngưng có nhãn riêng.

**Đối chiếu dữ liệu thật bằng API công khai và SELECT, không sửa DB:**

| Chi nhánh | Matcha Latte Đào Dưa Lưới (70) | Bánh Trung Thu Matcha (120) |
| --- | --- | --- |
| D9 Tân Phú | Còn bán | Tạm ngưng (`dang_kinh_doanh=false`) |
| 180 Thạch Lam | Còn bán | Còn bán |
| 686 Trường Chinh | Còn bán | Còn bán |

“Chưa xác minh” không có nghĩa là đã bị set hết món. Nó có thể do chưa gửi request inventory, request lỗi hoặc chưa đọc được trạng thái Menu. Dữ liệu ở Thạch Lam hiện xác minh được cả hai món. Nếu inventory/DB thực sự lỗi, hệ thống vẫn cần chặn chọn quán đó trước khi có dữ liệu mới.

**Chi phí:** `SYSTEM_PROMPT` giữ nguyên 9.235 ký tự, vẫn 33 capability, không tăng giới hạn context hoặc thêm retry provider. Test mô phỏng xác nhận các ranh giới trên dùng một request model và replay không gọi model/tạo đơn lần nữa. Không đo token/độ trễ bằng hội thoại provider thật, nên không khẳng định mọi lượt chat có cùng token hoặc hết hoàn toàn timeout/503. Những lỗi provider còn lại vẫn phụ thuộc Gemini; số lượt gọi dư đã được giảm.

## Kiểm tra đã chạy

600 test offline pass trong 13 bộ (lần kiểm tra mới nhất):

- `tests/test_branch_latency_checkout_presentation.py`
- `tests/test_final_focus_availability_contract.py`
- `tests/test_customer_checkout_presentation.py`
- `tests/test_checkout_guarded_contract.py`
- `tests/test_compound_discovery_contract.py`
- `tests/test_gemini_guarded_continuation.py`
- `tests/test_product_option_state.py`
- `tests/test_cart_voucher_checkout_flow.py`
- `tests/test_voucher_profile_boundaries.py`
- `tests/test_optional_defaults_description_contract.py`
- `tests/test_llm_tool_orchestrator.py`
- `tests/test_rag_v2.py`
- `tests/test_natural_knowledge_routing.py`

Các authority, Redis và provider được mô phỏng. Socket/DNS/HTTP bị chặn khi chạy; không gọi Gemini hoặc service thật. Đây là kết quả của các bộ liên quan, không phải khẳng định toàn bộ test cũ của repository đều pass.

`npm run build -- --outDir /tmp/avengers-web-branch-final-build` của `web-customer` thành công. 13 test Node của `branchAvailability.test.js` pass. API đánh giá/inventory công khai và truy vấn SELECT trên DB đang chạy được đọc riêng để đối chiếu, không thuộc bài test mô phỏng; không chỉnh review/DB. Chi tiết: [PRODUCT_DATA_AUDIT.md](PRODUCT_DATA_AUDIT.md).

Test mới replay chuỗi lỗi, 18 voucher, tùy chọn qua ba lượt, topping đơn không tự thêm, chọn sai mã tốt nhất rồi sửa, bỏ qua/không có voucher, báo giá lỗi sau áp mã và ngăn tự chọn nhận hàng/thanh toán. Các kiểm tra checkout hiện có tiếp tục xác minh địa chỉ, chi nhánh, bản tóm tắt, xác nhận và không ghi lặp khi retry.

Bộ bổ sung replay lời hoàn tất giỏ chung kèm model tự áp/bỏ qua mã, bảo đảm không có thao tác áp mã thật. Kiểm tra kết thúc bước hiện voucher chỉ dùng một request model ngay cả khi request tiếp theo giả lập lỗi 503; kiểm tra ba cách nhận hàng, hồ sơ không có/một/nhiều địa chỉ, chọn nhầm địa chỉ, xác nhận trong cùng lượt bị chặn, từ chối địa chỉ, hỏi lại địa chỉ và chuyển chủ đề không tự xác nhận.

Log có lỗi provider `503 provider_transient`; thay đổi giảm các request dư ở ranh giới chờ khách, không khẳng định loại bỏ lỗi dịch vụ Gemini. Không gọi provider thật để xác minh tốc độ/khả dụng trong lần sửa này.

## Tự test trên ứng dụng

Tại thư mục chứa `docker-compose.yml`:

```sh
docker-compose up -d --build order-service ai-service web-customer
```

Mở cuộc hội thoại mới để tránh replay kết quả cũ. Reset hội thoại không xóa giỏ thật; kiểm tra giỏ trước khi bắt đầu.

1. `cho tôi xem 2 món cà phê đắt nhất và rẻ nhất`
2. `cho tôi caramel đá đi` — kiểm tra bot liệt kê cả tên topping thật.
3. `size lớn, ít đá, ít ngọt và sữa tươi nhé` — đủ nhóm bắt buộc thì bot thêm món ngay, không ép chọn topping. Kiểm tra giỏ ghi không thêm topping và không thu tiền topping.
4. Trong hội thoại riêng, thử `theo mặc định đi`, hoặc chọn ít đá/ngọt bình thường cho Matcha Latte Đào Dưa Lưới có size Vừa cố định. Phải thêm món theo Menu và giữ lựa chọn đã nói. Nếu có món pending từ bản cũ, thử `vậy được rồi k cần thêm topping`: không được hỏi lặp.
5. Thử sửa số lượng hoặc xóa/thêm món; kiểm tra đúng dòng giỏ và tổng mới.
6. `oke vậy được rồi` hoặc `hoàn tất giỏ hàng` — kiểm tra đầy đủ mã đủ điều kiện, chưa có mã tự áp và chưa hỏi cách nhận/thanh toán khi vẫn chờ chọn mã; không có mã nào thì chuyển sang cách nhận hàng.
7. `chọn mã tốt nhất đi bạn` — kiểm tra mã đã áp, mức giảm, giỏ và tổng sau giảm được hiện lại; tiếp theo có ba hình thức nhận và các phương thức thanh toán.
8. `cho tôi giao tận nơi và thanh toán tiền mặt` — phải ghi nhận cả hai lựa chọn, hiện địa chỉ hồ sơ và hỏi có đang ở đó không. Thử `oke bạn` và `không, tôi ở chỗ khác` trong hai hội thoại riêng. Với lấy tại quán/dùng tại chỗ cũng phải hỏi vị trí hồ sơ trước khi tìm quán, sau đó chờ chọn chi nhánh. Nếu hồ sơ có nhiều địa chỉ, thử chọn theo số hoặc tên. Nếu đã nói địa chỉ mới trong câu chọn hình thức nhận, bot dùng địa chỉ mới.
9. Kiểm tra bản tóm tắt cuối có đúng món, option, mã, phí, chi nhánh/địa chỉ và phương thức thanh toán. Chỉ xác nhận khi muốn tạo đơn thử.
10. Với giỏ Matcha Latte Đào Dưa Lưới + Bánh Trung Thu Matcha, chọn lấy tại quán/tiền mặt, nhập Phường Tây Thạnh. D9 phải ghi matcha còn bán, bánh tạm ngưng. Chọn D9 phải bị chặn bằng lý do món; chọn số của quán khác phải khớp số trên thẻ. Thử sửa khu vực từ Tân Phú sang Tây Thạnh: phải hiện danh sách mới và chờ khách chọn. Mở rộng quán trên trang giỏ: các quán ngoài 15 dòng phải được kiểm tra thay vì mãi “chưa xác minh”.
11. Hỏi mô tả Cà Phê Muối Avenger và so với `mo_ta` ở trang chi tiết: không tự thêm Highlands, loại hạt cà phê, thành phần hoặc công dụng ngoài nguồn. Danh sách matcha không có mô tả đã tra cứu thì chỉ hiện tên/giá.

Không build/restart Docker hoặc gọi hội thoại Gemini live trong lần sửa này. Đã build frontend vào thư mục tạm và đọc API review/inventory, SELECT tình trạng bán qua container đang chạy. Các thay đổi cũ trong workspace được giữ; không commit/push.


## Khách vãng lai và chuyển giỏ khi đăng nhập (02/10/2026)

Nguyên nhân: web giỏ dùng mã `anon-timestamp` khác mã UUID của chat; API giỏ bắt JWT nên các món guest chỉ hiện tạm trên giao diện. Khi đăng nhập chỉ đổi chủ giỏ, không gộp. Cache hội thoại toàn cục còn giữ conversation của tài khoản sau logout, dẫn đến lỗi quyền khi khách bấm Làm mới.

Đã thống nhất cart/chat bằng một UUID ngẫu nhiên lưu bền trên trình duyệt. Khách đọc Menu, tư vấn, cấu hình và thêm/sửa/xóa **giỏ thật** được. `CartAuthGuard` chỉ cấp quyền chính xác cho giỏ guest được chứng minh bằng `X-Guest-Session-Id`; không bỏ JWT cho API tài khoản. Chat cache/conversation được tách theo chủ; logout/login remount chat; token tài khoản không được gửi vào request guest.

Voucher và đặt hàng yêu cầu đăng nhập ở gateway tool, executor voucher, endpoint AI checkout và endpoint tạo đơn/voucher của Order Service. Phản hồi gate có nút **Đăng nhập để tiếp tục**, chuyển tới trang login và trở lại giỏ khi xong. Gate render từ kết quả backend, không gọi model thêm. Không tăng giới hạn token, lịch sử, context hay số tool đăng ký. System prompt ngắn hơn bản trước lượt sửa này (9.178 so với 9.235 ký tự); thao tác gộp giỏ không gọi LLM. Không đo token/live latency bằng provider thật.

`POST /cart/merge-guest` cần JWT tài khoản, capability giỏ nguồn và idempotency key. Một transaction khóa giỏ đích rồi giỏ nguồn, lấy lại giá Menu, giữ toàn bộ quantity/size/topping/đá/ngọt/sữa/custom attributes, chỉ gộp dòng có cấu hình giống nhau. Giỏ cũ trong tài khoản được giữ. Chỉ xóa giỏ nguồn sau khi mọi dòng chuyển thành công. Lỗi ở bất kỳ dòng nào rollback toàn bộ; retry cùng operation trả kết quả đã ghi, không cộng lần nữa. Web chờ các thao tác giỏ đang gửi, giữ operation qua reload nếu phản hồi lỗi và hiện nút thử đồng bộ lại. API vẫn dùng schema journal cart hiện có; đã đọc xác nhận cột owner là varchar, không sửa dữ liệu hay DDL live.

Kiểm tra cuối offline: **643 test AI của 16 suite**, **40 test Order Service của 4 suite**, **35 test Node frontend** đều pass. Có kiểm tra reset guest, đọc giỏ guest, chặn checkout HTTP, ranh giới JWT và chuyển giỏ có replay/rollback. Build Nest và Vite pass. Test không gọi LLM thật, không tạo đơn hoặc gộp giỏ tài khoản thật. Phần đánh giá sản phẩm giữ nguyên.

Tự test sau khi build cả ba service ở lệnh trên:

1. Logout, mở chat và bấm **Làm mới**: không hiện lại lịch sử tài khoản, khách vẫn trò chuyện/chọn món được.
2. Thêm món trong chat; so giỏ web. Thêm một cấu hình khác cùng món trên web; reload: cả hai dòng vẫn còn và đúng tùy chọn.
3. Sửa số lượng/xóa đúng dòng trong chat và web, kiểm tra đồng bộ hai nơi.
4. Nói `hoàn tất giỏ hàng` hoặc `dùng voucher rồi đặt hàng`: có lời mời và nút đăng nhập; chưa áp mã, chưa tạo đơn. Bấm Áp dụng voucher/Thanh toán trên trang giỏ cũng chuyển login.
5. Đăng nhập bằng nút đó: trở về giỏ, giữ đủ món/tùy chọn/số lượng khách đã chọn và giữ món sẵn có trong tài khoản. Dòng cùng cấu hình gộp số lượng; cấu hình khác giữ riêng.
6. Logout rồi đăng nhập lại: không cộng thêm món đã chuyển. Chat và giỏ tài khoản không hiện trong phiên khách. Nếu đồng bộ lỗi, giỏ nguồn vẫn còn, thông báo có nút thử lại.

Các món đã mất trước bản sửa và chưa từng lưu thành công trên backend không thể phục hồi từ giỏ server; cần chọn lại để test luồng mới.
