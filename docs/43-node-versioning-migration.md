# NX-02: thống nhất phiên bản node

Trạng thái: **thiết kế chuyển đổi, chưa thay đổi định dạng graph hoặc runtime**.
Đối chiếu source local tại `3620977`, 05/11/2026. Mục tiêu là giảm hai cách
đặt phiên bản mà vẫn chạy đúng graph, lịch sử và trigger đã lưu.

## Hành vi hiện tại và tham chiếu

[n8n](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/versioning/)
giữ phiên bản của node trong workflow đã lưu và dùng bản mới nhất khi tạo node
mới. Đây là tham chiếu hành vi; Fluxora không dùng cùng graph schema n8n.

Fluxora hiện lưu một `type` và `nodeVersion` tùy chọn. Phiên bản được chấp
nhận duy nhất là `1`; graph lịch sử thiếu trường này vẫn đọc như trước.
Hậu tố `.v2` là một **type khác**, không phải `nodeVersion: 2`. API parser,
canvas schema, registry executor và import/export đều tham gia hợp đồng đó.

Các cặp type đã tồn tại: `trigger.uptime-kuma.alert`,
`action.google-drive`, `action.google-sheets`, `action.google-chat.oauth`,
`action.gmail.read`, `action.notion.search-pages`, `action.sentry.list-issues`,
`action.vercel.list-deployments`, `action.postgres.select` và
`action.supabase.select`; bản mới có hậu tố `.v2`. Không phải tất cả thay đổi
giống nhau: có node thêm pagination, có node đổi output hoặc quy tắc write,
và Kuma có filter/dedup liên quan trigger. Không thể đổi tên theo chuỗi rồi
cho rằng mọi hành vi tương đương.

## Hợp đồng đích và quy tắc chuyển đổi

- Một type ổn định cộng phiên bản hành vi riêng cho từng node; danh sách phiên
  bản hợp lệ phải theo **type**, không phải chỉ một global `version === 1`.
- Bốn trường hợp đọc phải được định nghĩa riêng: type cũ không có version,
  type cũ với version `1`, type `.v2` không có version và type `.v2` với
  version `1`. Hai trường hợp `.v2` ánh xạ về hành vi mới, không được coi là
  hành vi cũ chỉ vì con số `1`. Type/version không hợp lệ phải báo lỗi trước
  khi dùng credential hoặc gọi provider.
- Việc đọc phải không sửa graph đã lưu. Không tự đổi draft, published version,
  history hoặc execution đang chờ; export/import cũ vẫn giữ nghĩa. Nâng cấp
  hành vi là thao tác tường minh trên draft, có thông báo khác biệt; publish
  là bước riêng. Chỉ tạo graph định dạng mới sau khi mọi thành phần đang chạy
  đọc và thực thi đúng định dạng đó.
- UI, schema, output handles, live readiness, executor và trigger validation
  phải dùng cùng quyết định type/version. Không thay bằng mapping chỉ trong
  editor: webhook và worker đọc graph trực tiếp từ database.
- Cần một compatibility registry duy nhất cho cặp type/version, có kiểm tra
  coverage và từ chối mâu thuẫn. Không thêm alias theo suy đoán hoặc tự tạo
  implementation mới cho một version chưa tồn tại.

Parser local hiện từ chối graph kết hợp cấu trúc API/canvas nếu `nodeVersion`
ở hai vị trí đều có giá trị nhưng khác nhau. Trước đây parser ưu tiên trường
trên cùng; graph không chuẩn từ nguồn khác có thể bị từ chối và cần sửa mâu
thuẫn trước khi mở. Graph chỉ có một vị trí hoặc hai giá trị giống nhau vẫn
giữ hành vi hiện tại. Đây không phải cơ chế hỗ trợ version 2.

Dispatch và reader dành riêng cho execution ở local đã nhận chín action theo
type chuẩn + `2` và chọn handler `.v2` hiện hữu. Fixture kiểm tra credential
readiness của từng cặp và một execution mock Supabase từ graph giả; version
không hỗ trợ vẫn bị từ chối. Parser API dùng để ghi/import workflow **vẫn từ
chối** graph `nodeVersion: 2`. Editor local đọc và hiển thị theo handler tương
ứng, giữ nguyên type/version khi export, nhưng chặn lưu draft có version `2`;
đây chưa phải định dạng được phép ghi. Fixture round-trip cho 10 cặp đã pass,
E2E inspector và chặn lưu được thêm nhưng chờ final verify. Các đường đọc graph đã lưu trong
workflow service, webhook và scheduler local cũng dùng reader mới; test cron
và ingress Kuma với action canonical v2 giả đã pass. Reader local nay cũng
ánh xạ Kuma canonical v2 sang filter và delivery path `.v2`; fixture xác nhận
filter, validation và dispatch cho hai biểu diễn. Chưa kiểm thử đầy đủ các
provider, mixed fleet hoặc rollback. Chưa thay định dạng lưu hay mặc
định của workflow.

Các hàm metadata và field descriptor local cũng nhận type/version và chọn
cùng mô tả với handler `.v2`; version không hợp lệ trả kết quả không có metadata.
Chúng chỉ mô tả cấu hình, không thay thế validation hoặc authorization runtime.

## Rollout và kiểm thử trước khi đổi định dạng ghi

1. Chụp fixture graph giả cho từng cặp, gồm thiếu/có `nodeVersion`, draft,
   published, export/import, node output và nhánh lỗi. Đối chiếu config và
   output với adapter tương ứng; riêng write kiểm tra request, identity và
   non-retry khi kết quả không chắc chắn. Fixture không chứng minh provider thật.
   Đã bổ sung fixture tổng hợp cho 10 cặp type, cả khi thiếu và có version `1`:
   parser API và editor import/export giữ nguyên type, version và config giả.
   Hai kiểm thử mục tiêu đã pass; chưa bao phủ execution, DB, trigger hoặc
   export được tạo bởi mọi bản phát hành cũ.
2. Thiết kế parser/registry và editor đọc song song cả hai định dạng; trước
   hết tiếp tục **ghi định dạng hiện hành**. Test biểu diễn mới cho cả action
   và trigger, bao gồm Kuma ingress, endpoint registration và published version.
3. Kiểm tra các worker, API, scheduler và web cùng hiểu định dạng mới. Test
   mixed fleet: source cũ từng bỏ qua `nodeVersion: 2` trên type cũ, nên có
   thể chạy sai hành vi thay vì báo lỗi. Không ghi định dạng mới khi còn worker
   cũ, job cũ hoặc chưa chứng minh chính sách rollback. Test queue, execution
   đang chạy/chờ approval và webhook đúng phiên bản published.
4. Chỉ sau reader-first rollout và diễn tập restore/rollback mới xem xét bật
   ghi định dạng mới cho node/draft mới. Không chạy migration hàng loạt trên
   graph đã publish. Rollback phải fail closed hoặc có định dạng tương thích,
   không được âm thầm hạ phiên bản hành vi. Theo dõi lỗi không được log secrets.
5. Xóa alias chỉ có thể xem xét sau khi chứng minh không còn graph, version
   lịch sử, execution hoặc export được hỗ trợ tham chiếu alias; hiện chưa có
   bằng chứng đó. Không xóa chúng trong đợt thiết kế này.

Lưu ý: [review NX](40-nx-release-review.md) đã có một fixture parser cũ cho
thấy nguy cơ bỏ qua `nodeVersion: 2`; nó không bao phủ toàn bộ image cũ hay
luồng production. Chưa được coi là bằng chứng mixed-fleet/rollback hoàn tất.
