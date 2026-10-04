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

## Hai kịch bản chọn món và sửa giỏ 23:31–23:42 (03/10/2026)

Nguyên nhân đọc được từ code:

- Gateway trước đây coi món trong snapshot/focus/giỏ là đủ để chấp nhận đề xuất `add_to_cart`, chưa kiểm tra khách có chọn chính món đó ở lượt hiện tại. Vì vậy yêu cầu mua một **loại bánh/nước** có thể biến thành thêm một ứng viên.
- Bộ lọc chỉ sửa category khi model đã truyền `drink`/`food`; `all` có thể làm bánh matcha lẫn đồ uống. Từ chung `nước` còn có thể bị dùng như điều kiện tên sản phẩm, trả về rỗng.
- Mục giữ tùy chọn không in topping đã chọn. Một đề xuất đúng Menu nhưng sai lựa chọn khách vẫn có thể vượt kiểm tra membership.
- Kiểm tra target đọc toàn bộ câu thay vì từng thao tác. Số dòng lại được tính sau mỗi lần xóa; sửa món số 3 sau khi xóa món số 1 có thể bị chặn hoặc trỏ sai. Validator cũng chưa buộc hoàn thành các thao tác còn lại.
- `MANG_DI` là lấy tại quán, `TAI_CHO` là dùng tại chỗ. Model nhầm hai giá trị bị chặn bằng thông báo an toàn chung. Nay parser lựa chọn rõ ràng của khách là nguồn giá trị; vẫn kiểm tra quyền, số dư ví, dữ liệu giỏ và xác nhận địa chỉ.

Đã sửa:

1. Yêu cầu **bánh có vị matcha / một món nước** là tham khảo trước. Không tự thêm ứng viên; nếu model đề xuất thêm nhầm một yêu cầu loại món, gateway chuyển sang đọc catalog và hiện lựa chọn, không gọi LLM thêm. Bánh matcha dùng `food + matcha`; loại nước/bánh chung dùng category và search rỗng. Prompt hướng dẫn tìm đủ cả nước lẫn bánh khi khách hỏi hai nhóm.
2. Thêm món cần có lựa chọn cụ thể: tên đầy đủ/tên rút gọn không mơ hồ, số sản phẩm đúng snapshot, nút chọn sản phẩm hoặc tiếp tục cấu hình món đang chọn. `caramel đá` nhận đúng bản đá, không nhầm bản nóng. Mặc định không chép topping từ dòng giỏ khác. Topping đã chọn được in trong phần lựa chọn đang giữ; giá trị Menu khách nói rõ được giữ trước đề xuất khác của model.
3. Một câu **bỏ mochi + bánh trung thu lên 2 + món số 3 đổi size** được kiểm tra theo từng thao tác. ID/số dòng được cố định ở đầu lượt cho cả gateway và context model. Cập nhật đúng từng ID, số lượng tuyệt đối theo đúng đoạn câu. Chỉ báo xong khi các thao tác xác định được đã có kết quả; nếu gián đoạn, báo phần còn chưa thực hiện. Batch hoàn tất trả giỏ ngay, không cần thêm lượt model viết lại.
4. Câu hỏi/phàn nàn về bánh đang có trong giỏ không tự xóa bánh. Phủ định như **đừng xóa** được giữ nguyên. Khi lần đầu hiện giỏ đã có món từ trước, bot nói rõ các món đã lưu; làm mới chat vẫn giữ giỏ bền. Chỉ bản chat không đủ chứng minh Butter Croissant được tự thêm hay đã có trước, nên không tự dọn giỏ khách để che hiện tượng này.
5. **Lấy tại quán + QR/ví** được ghi nhận cùng nhau từ câu khách nói, kể cả model gửi thiếu một slot hoặc nhầm `TAI_CHO`. Địa chỉ hồ sơ vẫn được hỏi trước; khách chọn chi nhánh sau khi tìm các quán đủ món. Giới hạn số dư ví, tồn kho và xác nhận đơn giữ nguyên.
6. Khi khách nêu một phường khớp duy nhất với địa chỉ hồ sơ cho giao hàng, bot hỏi xác nhận đúng **số nhà + đường + phường**, lưu lại chủ sở hữu lời đề xuất. Câu **tôi đang ở đó** dùng đúng địa chỉ này, không dùng câu tham chiếu làm truy vấn bản đồ. Nếu bản đồ chỉ trả số nhà/khu vực gần giống, bot ghi rõ đó là **gợi ý khác, chưa xác nhận địa chỉ giao**; không tự đổi `42/3` thành `42`.
7. Danh sách tư vấn dù model đọc thêm option vẫn dùng tên/giá canonical, xuống dòng và in đậm; không tự chèn mô tả hương vị/best-seller chưa có bằng chứng. Mốc giỏ, topping, địa chỉ và lựa chọn nhận/thanh toán có phần trình bày từ dữ liệu tool.

**Kiểm tra cuối:** 789 test offline trong 21 suite đều pass, bao gồm guest/login/merge-cart, replay, voucher, tồn kho, địa chỉ, Gemini continuation và các trường hợp mới trong `tests/test_reported_shopping_journeys.py`. Có kiểm tra thực hiện đủ ba thay đổi trong một request model và chuyển đề xuất thêm nhầm loại món thành danh sách trong một request. Hai kỳ vọng cũ ở LAN21 đã được đối chiếu với HEAD trong bản sao tạm: capability bị lọc trước khi chạy, không còn log executor denial; test được căn theo ranh giới hiện tại và vẫn kiểm tra không ghi sai.

**Chi phí:** prompt 9.171 ký tự, ngắn hơn 9.178 trước lượt sửa này; vẫn 33 capability, output mặc định 600 token, không tăng giới hạn lịch sử/context/vòng tool/retry provider. Không gọi Gemini live để đo token hay độ trễ; số ký tự không phải số token. Không sửa DB, đánh giá sản phẩm hoặc tạo đơn thật. Chưa build/restart Docker.

Để tự test bản mới, chạy tại thư mục chứa compose:

```bash
docker-compose up -d --build ai-service
```

Kiểm tra lại hai kịch bản: xem nước + bánh trước khi chọn; chọn americano theo mặc định; chọn bánh matcha từ danh sách; thêm topping rồi sửa nhiều món trong một câu; lấy tại quán với QR/ví; trả lời **tôi đang ở đó** sau câu xác nhận địa chỉ. Với giỏ đang có món từ trước, kiểm tra dòng thông báo món đã lưu và chỉ xóa bằng yêu cầu rõ ràng.

Tự test sau khi build cả ba service ở lệnh trên:

1. Logout, mở chat và bấm **Làm mới**: không hiện lại lịch sử tài khoản, khách vẫn trò chuyện/chọn món được.
2. Thêm món trong chat; so giỏ web. Thêm một cấu hình khác cùng món trên web; reload: cả hai dòng vẫn còn và đúng tùy chọn.
3. Sửa số lượng/xóa đúng dòng trong chat và web, kiểm tra đồng bộ hai nơi.
4. Nói `hoàn tất giỏ hàng` hoặc `dùng voucher rồi đặt hàng`: có lời mời và nút đăng nhập; chưa áp mã, chưa tạo đơn. Bấm Áp dụng voucher/Thanh toán trên trang giỏ cũng chuyển login.
5. Đăng nhập bằng nút đó: trở về giỏ, giữ đủ món/tùy chọn/số lượng khách đã chọn và giữ món sẵn có trong tài khoản. Dòng cùng cấu hình gộp số lượng; cấu hình khác giữ riêng.
6. Logout rồi đăng nhập lại: không cộng thêm món đã chuyển. Chat và giỏ tài khoản không hiện trong phiên khách. Nếu đồng bộ lỗi, giỏ nguồn vẫn còn, thông báo có nút thử lại.

Các món đã mất trước bản sửa và chưa từng lưu thành công trên backend không thể phục hồi từ giỏ server; cần chọn lại để test luồng mới.

## Sửa nhiều dòng bằng câu nói tự nhiên (03/10/2026)

Log của câu `tôi k muốn lấy món 2 nữa, món 1 tôi muốn topping hạt sen và tiramisu thêm ngọt nhé, món 3 thì 2 cái nhé bạn` cho thấy model đã đề xuất đúng ba tool, nhưng server chặn xóa với `cart_change_not_requested`, rồi chặn sửa với `conflicting_cart_operations`. Bộ nhận diện chỉ tìm động từ sửa/xóa nên bỏ sót câu phủ định lấy món và các yêu cầu cấu hình/số lượng không có động từ sửa.

Đã nhận diện từng yêu cầu theo dòng giỏ ban đầu, giữ dấu phẩy trong danh sách topping, tách độ ngọt ngay sau topping và ánh xạ tên rút gọn chỉ khi Menu có đúng một lựa chọn. `tiramisu` có thể khớp `Syrup Tiramisu`; nếu Menu có nhiều loại Tiramisu thì yêu cầu làm rõ. Bằng chứng hoàn tất dùng trạng thái thực sự đã áp dụng, gồm cả topping/độ ngọt canonical mà server bổ sung khi model gửi thiếu. Với câu sửa nhiều dòng, không lấy số lượng hay tùy chọn của dòng khác để sửa nhầm.

Tự thử với giỏ ba món trong báo cáo: xóa Cà Phê Muối Avenger, Bạc Xỉu Nóng giữ số lượng/size và chuyển sang Hạt Sen + Syrup Tiramisu/Thêm ngọt, Bánh Trung Thu Matcha thành hai cái. Số món tham chiếu tính theo giỏ trước khi xóa; giá tiếp tục do Menu và Order Service xác định.

Kiểm tra: 19 trường hợp mới cùng 317 kiểm tra liên quan qua; các lượt model đều giả, khóa kết nối mạng và không dùng key thật. 18 lỗi trong bộ `test_guarded_tool_gateway.py` cũng tái hiện với bộ nhận diện trước lượt sửa này, không sửa các luồng đó. Giữ nguyên prompt/model/giới hạn token/lịch sử/retry.

## Nạp thêm ví khi số dư không đủ (03/10/2026)

Chat hiện thẻ nạp ví từ số dư và tổng giỏ đã đọc ở Order Service. Khách chọn 50.000/100.000/200.000/500.000đ hoặc mức đủ bù thiếu (trong giới hạn một lần nạp), nhập số tiền khác, hoặc nhắn `nạp 200k`. Mức nạp hợp lệ là số nguyên từ 10.000 đến 5.000.000đ. Số nhỏ như `1` vẫn thuộc lựa chọn chi nhánh/voucher, không bị luồng nạp ví chiếm. Tạo yêu cầu nạp và kiểm tra trạng thái gọi API trực tiếp, không thêm capability hay lượt model cho thao tác nạp.

Thẻ mở liên kết VNPAY ở tab mới để giữ hội thoại, giỏ và voucher. Chat theo dõi đúng ID giao dịch TOP_UP của tài khoản đăng nhập, khôi phục giao dịch còn chờ khi reload, chỉ báo thành công từ trạng thái SUCCESS của server rồi đọc lại số dư. Nạp một phần tính lại thiếu hụt; nạp thành công hiện nút tiếp tục bằng ví, giữ bước xem tóm tắt và xác nhận đơn. Ví được kiểm tra lại trước xác nhận; không đủ tiền thì giữ giỏ và trở lại thẻ nạp, kể cả xác nhận bằng nút UI.

API ví dùng JWT và kiểm tra chủ tài khoản; số tiền không hợp lệ bị chặn trước khi ghi giao dịch. Callback VNPAY cần chữ ký hợp lệ và số tiền khớp giao dịch trước khi cộng ví; callback lặp không cộng lần nữa. Callback thất bại lưu FAILED và không hiển thị thành công ở trang quay về. Sử dụng bảng ví/giao dịch và endpoint nạp hiện có, không thêm migration.

Kiểm tra offline: 329 kiểm tra AI liên quan, 88 kiểm tra Order Service, 43 kiểm tra frontend đều qua; build backend/frontend qua và ba trạng thái thẻ được render bằng dữ liệu giả. Không gọi Gemini/map/VNPAY thật, không dùng key của khách để test, giữ nguyên cấu hình prompt/model/token/context/retry. Tự thử với giỏ có tổng sau giảm giá lớn hơn số dư: chọn ví, chọn mức nạp hoặc nhắn số tiền, mở VNPAY, quay về chat, bấm tiếp tục và kiểm tra tóm tắt trước khi xác nhận.

### Thông báo khi provider chưa phản hồi — 04/10/2026

Log lượt `hello tôi muốn mua cà phê nóng` ghi nhận `network_timeout` và một lần HTTP 503 (`provider_transient`), hết ngân sách thời gian trước khi nhận được phản hồi đầu tiên. `tool_round_count=0`, `discovery_read_count=0`: chưa gọi công cụ tìm món. Không có bằng chứng lỗi đọc danh mục hay phân tích câu chọn món trong các lượt này. Các bộ đếm token bằng 0 chỉ có nghĩa chưa nhận được usage từ provider, không xác minh được chi phí thực tế của yêu cầu timeout.

Chỉ khi provider lỗi timeout/5xx và chưa chạy công cụ nào, phản hồi hiển thị AI tạm thời không phản hồi thay cho câu chưa xác minh được kết quả. Nếu công cụ đã chạy, giữ phản hồi dựa trên bằng chứng hiện có và cơ chế chống thực hiện lại; các lỗi xác minh khác giữ thông báo cũ. Log phân biệt `server_provider_unavailable`. Không đổi model, prompt, token, timeout, retry hay khóa API. 68 kiểm tra orchestrator, Gemini wire-contract và outage qua bằng provider giả; kiểm tra outage chặn socket/HTTP thật. Thay đổi thông báo không khắc phục trạng thái Gemini/đường truyền bên ngoài.

### Nới thời gian chờ provider — lượt lỗi 12:27–12:29, 04/10/2026

Ba lượt mới đều timeout ở lần gọi đầu khoảng 8 giây, lần tiếp theo còn khoảng 4 giây vì ngân sách cả vòng là 12 giây. Chưa gọi công cụ tìm món. Probe HTTPS GET không có key tới host Google nhận HTTP 404 trong khoảng 0,25 giây: xác nhận kết nối host tại thời điểm kiểm tra, không xác minh tốc độ inference hay trạng thái toàn dịch vụ.

Đổi riêng giới hạn chờ: 30 giây mỗi lần gọi, 45 giây cho một vòng, đồng bộ policy defaults, Compose, `.env.example` và hai biến trong `.env` đang chạy. Không đổi provider/model, prompt, giới hạn token, số lần thử tối đa, công cụ hay xử lý giỏ/đơn. Request chat ở frontend chờ tối đa 120 giây, khớp proxy hiện có; các request API khác giữ timeout cũ. Log ghi thời gian chờ thực cấp và tên lớp exception, không ghi nội dung lỗi chứa thông tin nhạy cảm.

73 kiểm tra offline qua. Regression dùng đồng hồ giả chứng minh phản hồi mất 10 giây bị cấu hình 8/12 cắt, nhưng cấu hình 30/45 nhận được ở lần gọi đầu; phản hồi mất 15 giây cũng nhận được bằng default mới. Khi provider không phản hồi, vòng vẫn dừng ở 45 giây và tôn trọng cấu hình/attempt budget đặt riêng. Không gọi LLM bằng key thật. Đây là sửa giới hạn chờ quá ngắn; vẫn cần khách tự xác nhận bằng một lượt chat thật và không đảm bảo khắc phục được sự cố bên Google nếu provider tiếp tục không phản hồi.

### Dự phòng đọc Menu khi provider timeout — 04/10/2026

Các lượt 12:27–12:29 hết ngân sách inference trước khi gọi Menu. Log mới 12:41 ghi nhận Gemini có phản hồi và một lỗi HTTP 503, nên không thể coi provider đã ổn định. Policy nay xoay tài khoản sau lỗi transient/account, tránh mỗi lượt lỗi quay lại cùng hai tài khoản đầu. Khi có provider dự phòng được cấu hình, dành cả thời gian lẫn lượt thử cho provider đó trong ngân sách vòng hiện có; không tăng số lần thử, thời gian chờ hay giới hạn token.

Khi lỗi timeout/503 xảy ra trước mọi công cụ, một yêu cầu xem danh sách bánh matcha có số lượng rõ ràng và không có điều kiện phụ được phép đọc `filter_catalog` qua gateway hiện có. Chat/card dùng kết quả Menu đã lọc; hai món phù hợp vẫn trả hai món kèm giải thích chưa đủ năm. Không gọi AI thêm; không áp dụng cho sửa giỏ, mặc định, chọn card, thanh toán, nguyên liệu/dị ứng, giá/ranking hay từ bổ nghĩa chưa hiểu. Menu lỗi vẫn báo chưa xử lý được; không biến lỗi đọc thành “không có món”. Lưu/replay kết quả như lượt bình thường, giữ nguyên giỏ.

Kiểm thử dùng provider/Menu/Redis/DB giả và chặn socket/DNS trước import. Không sử dụng key thật để gửi chat. Các thay đổi thời gian chờ 30/45 trong mục trước đã có sẵn; bản sửa này giữ nguyên cấu hình đó.

### Tiếp tục chọn tùy chọn sau câu “tự chọn” — 04/10/2026

Log 11:09–11:10 cho thấy chọn món số 1 đã đọc được option, sau đó model đề xuất `use_defaults=true` khi khách chưa đồng ý. Gateway trả `defaults_not_authorized` nhưng chưa lưu món/số lượng thành draft chờ. Lượt “tự chọn” không được nhận là câu trả lời option; đọc option còn đổi nguồn focus sang `canonical_option_provider`, rồi đề xuất thêm món bị chặn `product_choice_required`. Các lượt này có `provider_failure_count=0`, không phải lỗi provider hay hạn mức token.

Gateway nay lưu đúng món, số lượng và lựa chọn khách đã nói khi hỏi mặc định/tự chọn. Câu “tự chọn” và các biến thể ngắn chỉ mở tùy chọn Menu cho món đã được khách chọn. Không áp dụng size/topping model đoán, không ghi giỏ trước khi khách chọn giá trị. Kết quả đọc option hoặc đề xuất thêm đều có thể trả ngay lời hỏi option từ server. Draft tiếp tục hoạt động khi Redis không còn lịch sử; câu “tự chọn” không có món đã chọn hoặc đề xuất thêm món khác vẫn bị chặn.

Kiểm tra: 14 trường hợp mới và 219 kiểm tra liên quan đều qua (233 tổng), gồm cấu hình nhiều lượt, số lượng, mặc định, lựa chọn cụ thể, Gemini continuation, checkout và thông báo outage. Launcher xóa credential khỏi môi trường tiến trình test và chặn socket/DNS trước khi import; provider, DB, Redis, Menu và giỏ dùng fake. Không gọi key thật, không đổi prompt/model/token/context/retry, không sửa DB thật và chưa build/restart Docker. Nạp source mới bằng `docker-compose up -d --build ai-service`, rồi thử chọn món số 1 → tự chọn → chọn size/topping từ danh sách bot đưa ra.

### Lời chat cùng card bánh và sửa topping đúng lượt — 04/10/2026

Log 11:30 ghi nhận cả `add_to_cart` và `filter_catalog`, hai card bánh đã được tạo, nhưng bộ trình bày ưu tiên mốc giỏ và không ghép danh sách tư vấn vào lời đáp. Nay lời chat gồm giỏ vừa thêm và đúng tên/giá/số thứ tự của các card được xác minh trong lượt đó, vẫn chỉ tư vấn bánh trước khi khách chọn.

Log 11:32 không chứng minh topping đã cập nhật: thao tác đầu bị chặn `cart_reference_conflict`, thao tác tăng bánh lên hai mới thành công. Parser chưa tách “còn bánh trung thu…”, bỏ sót câu sửa theo tên rút gọn và có thể nhận chữ “sữa” như động từ “sửa”. Toàn câu bị gán cho bánh theo đoạn tên khớp dài nhất. Đến lượt bỏ Mochi, model đề xuất sửa topping từ yêu cầu cũ; gateway không chặn khi các clause hiện tại chỉ thuộc thao tác xóa, nên topping được sửa muộn. Đây là thao tác muộn được thể hiện trong log, không chỉ là lời đáp hiển thị snapshot cũ.

Đã tách câu sửa Bạc Xỉu và số lượng bánh thành hai target độc lập, nhận “topping cho tôi…” và typo số lượng “muốn 2 cáo” trong namespace sửa giỏ. Giữ nguyên câu mua thêm, chặn tên trỏ tới nhiều cấu hình, topping không có trong Menu và thao tác không thuộc yêu cầu hiện tại. Nếu một phần chưa thực hiện, lời đáp nêu rõ món còn thiếu. Sau xóa thành công, một đề xuất sửa không được yêu cầu bị chặn và lời đáp vẫn xác nhận đúng việc xóa đã làm.

Kiểm tra: 15 trường hợp mới và 265 kiểm tra liên quan đều qua (280 tổng), bao gồm cả hai thứ tự thao tác, lời chat/card cùng danh sách bánh, sửa topping và số lượng trong một lượt, báo thực hiện một phần, chặn sửa topping cũ khi bỏ Mochi, ambiguity và giá/tổng từ quote giả. Tất cả model, Menu, Order, DB và Redis dùng fake; launcher xóa credential khỏi tiến trình test và khóa socket/DNS trước import. Không dùng key thật, không đổi prompt/model/token/context/retry, không sửa giỏ/DB thật; chưa build/restart Docker. Nạp bằng `docker-compose up -d --build ai-service` và thử lại câu topping + số lượng rồi câu bỏ Mochi.

### Yêu cầu xem 5 bánh matcha nhưng chỉ có 2 kết quả phù hợp — 04/10/2026

Hội thoại báo lỗi có năm dòng lời chat, gồm hai bánh matcha và ba bánh khác. Không có log mới để xác định model đã dùng chính xác những đối số nào. Kiểm tra code cho thấy gateway chỉ sửa category về food; search_text trống hoặc lượt đọc rộng hơn vẫn được phép bỏ điều kiện matcha. Bộ trình bày cũng chưa có lời dẫn giải thích thiếu kết quả.

Với yêu cầu rõ một nhóm bánh matcha, gateway nay giữ food + matcha trên cả filter_catalog và get_recommendations, kể cả đọc lại để cố đủ số món. Số món muốn xem là giới hạn kết quả phù hợp, không cho phép bù bằng loại bánh khác. Kết quả không đúng nhóm/điều kiện được loại trước khi trở thành ứng viên, card hoặc snapshot lựa chọn. Khi khách muốn xem 5 nhưng tìm được 2, lời dẫn là: “Dạ, hiện mình tìm được **2 món bánh matcha** phù hợp trong Menu, chưa đủ **5 món** bạn muốn xem. Mình gửi bạn các món này nhé:”, rồi chỉ liệt kê hai món với tên/giá/số thứ tự khớp card. Đây là số kết quả tra cứu, không phải xác nhận tồn kho ở một chi nhánh.

Không tìm thấy thì trả lời rõ và hỏi khách muốn tham khảo loại bánh khác không, chưa tự tìm/thêm bánh khác. Lỗi service không bị diễn đạt thành không có món. Yêu cầu bánh trung thu matcha giữ thêm điều kiện trung thu; so sánh nước và bánh hoặc yêu cầu loại khác vẫn giữ phạm vi riêng. Không tăng prompt/model/token/context/retry hay thêm capability.

Kiểm tra: 16 trường hợp mới và 314 kiểm tra liên quan đều qua (330 tổng), bao gồm đọc rộng/lặp lại, recommendation, provider rows không đúng điều kiện, thiếu/đủ/không có kết quả, limit model gửi quá nhỏ, model chọn thiếu, subtype bánh và so sánh nước/bánh. Provider, DB, Menu, Order và Redis đều fake; launcher xóa credential khỏi tiến trình test và chặn mạng trước import. Không dùng key thật và chưa build/restart Docker. Nạp bằng `docker-compose up -d --build ai-service`, rồi thử lại đúng câu yêu cầu xem 5 bánh matcha.


### Sửa giỏ theo tên món và topping chưa rõ loại — 04/10/2026

Lượt “cho tôi bánh trung thu 2 cái, còn bạc xỉu thêm topping hạt sen và hạt nổ nhé” ghi nhận hai lần đọc tùy chọn, một update bị `cart_reference_conflict`, rồi update số lượng bánh thành công. Parser trước đây không tách ranh giới “còn” theo tên Bạc Xỉu trong giỏ, nên chỉ lập được một yêu cầu; phản hồi tổng kết không nêu topping còn thiếu.

Tách các mệnh đề theo tên/rút gọn tên món trong giỏ tại dấu câu hoặc liên từ, giữ nguyên dấu phẩy và “và” bên trong danh sách topping. Đối chiếu từng thay đổi với dòng giỏ và trường dữ liệu được khách yêu cầu. Tên topping rút gọn khớp nhiều lựa chọn Menu phải hỏi đúng các loại phù hợp. Lưu riêng lựa chọn Hạt Sen và dòng Bạc Xỉu đang chờ; câu trả lời đầy đủ hoặc rút gọn như “hạt nổ yến mạch nhé”/“yến mạch nhé” chỉ hoàn tất lựa chọn đó, giữ Hạt Sen, đọc lại Menu và cập nhật đúng dòng. Không tái sử dụng câu trả lời nếu cấu hình dòng đã thay đổi; câu hỏi, phủ định và yêu cầu xem thông tin không cho phép mutation.

Khi số lượng bánh đã cập nhật nhưng topping còn chờ, trả giỏ đã xác minh và nêu rõ chỉ hoàn tất một phần cùng câu hỏi chọn loại topping. Nếu chưa có cập nhật thành công, không báo đã cập nhật một phần. Trả lời từ bằng chứng server khi cần chọn topping hoặc đã hoàn tất các thao tác, không tăng lượt inference để hỏi cùng một thông tin. Cơ chế dedup theo client_message_id giữ nguyên; follow-up hoạt động khi mất Redis vì trạng thái chờ được lưu trong checkout prefs của session hội thoại.

230 kiểm tra offline liên quan qua, trong đó 19 trường hợp mới kiểm tra thứ tự thao tác, tên rút gọn, dấu câu/liên từ, giữ Hạt Sen, câu trả lời ngắn, mất Redis, gửi lại tin, sai dòng/sai trường, phủ định và dòng giỏ đã đổi. Không gọi provider thật, không dùng key của khách; không thay cấu hình model/token/retry/thời gian chờ.

### Câu trả lời chọn topping bị chặn khi model gửi lại cấu hình hiện tại — 04/10/2026

Lượt 13:08 “hạt nổ yến mạch đi bạn” đã khớp yêu cầu topping đang chờ, nhưng năm đề xuất update bị `cart_fields_not_requested`. Không phải timeout: provider phản hồi và đọc được option. Guard của bản trước chặn mọi trường ngoài topping, kể cả model chỉ nhắc lại số lượng/size/độ ngọt hiện tại, khiến lượt tiếp tục sửa đề xuất thay vì hoàn tất lựa chọn.

Trong đúng follow-up đã ràng buộc với dòng giỏ và cấu hình đang chờ, loại các trường có giá trị không đổi khỏi patch. Trường khác thực sự thay đổi vẫn bị chặn. Patch chỉ còn topping; lựa chọn đã lưu và câu trả lời hiện tại được đối chiếu lại với Menu, kể cả khi model không gửi topping trong patch. Giữ Hạt Sen cùng Hạt Nổ Yến Mạch, không thay số lượng, size, độ ngọt, đá/sữa hoặc bánh. Không đổi model, token, retry hay thời gian chờ.

239 kiểm tra offline liên quan qua. Bộ kiểm tra topping có 28 trường hợp, bổ sung câu trả lời chính xác khách gửi, đề xuất đầy đủ cấu hình không đổi, thiếu trường topping, replay, và đề xuất đổi trái yêu cầu các trường khác. Provider, Menu, giỏ, DB/Redis đều giả; socket và HTTP bị chặn trong các regression mới, credential provider bị xóa khỏi môi trường test. Không gửi chat thật bằng key khách.

### Chọn địa chỉ với đuôi hội thoại và bỏ qua voucher sau thời gian chờ — 04/10/2026

Log 13:57 ghi nhận hai lần `resolve_location` bị `profile_location_confirmation_required`, provider đều phản hồi thành công. Parser ordinal coi “ấy bạn” sau “địa chỉ 1” là phần tên đường, nên không nhận lựa chọn số. Parser tham chiếu nhận “địa chỉ đó” nhưng thiếu “địa chỉ đấy/ấy” và “ở đấy”. Bổ sung đuôi hội thoại trong riêng namespace địa chỉ và các tham chiếu này. Số địa chỉ vẫn đối chiếu với danh sách đã đưa ra; câu hỏi/phủ định không được xác nhận, model đề xuất địa chỉ khác số khách chọn vẫn bị chặn. Với lấy tại quán, địa chỉ chỉ là vị trí tìm quán, không tự xác nhận địa chỉ giao hoặc chọn chi nhánh.

Lượt “bỏ qua đi bạn” bị `voucher_choice_required`: pending action có TTL 300 giây, lượt khách trả lời diễn ra sau khoảng chín phút; durable `voucher_offer_pending` vẫn giữ bước voucher. Khi không có pending khác và quyết định voucher vẫn đang chờ, dùng offer đó làm chủ ngữ cho câu từ chối ngắn. Không tăng TTL, không thay xác nhận đơn; OK chung/câu hỏi/yêu cầu bỏ món không được xem là bỏ voucher.

25 regression mới dùng đúng câu khách, số địa chỉ thứ hai, mất Redis/hết hạn pending, replay và các trường hợp không được phép. 242 kiểm tra liên quan qua sau thay đổi cuối; một lượt mở rộng khác có 294 kiểm tra qua. Hai trường hợp option trong `test_cart_voucher_checkout_flow.py` vẫn fail và tái hiện khi khôi phục parser trước sửa trong tiến trình kiểm tra; chúng thuộc luồng cũ, không phải regression của bản địa chỉ/voucher này. Đã giữ nguyên các xử lý option hiện tại. Inference, giỏ, Menu/geo và persistence đều giả trong regression mới, socket/DNS/HTTP bị khóa; không dùng key thật, không đổi model/token/retry/thời gian chờ và không sửa giỏ khách để kiểm thử.
