> Historical inventory before the owner-directed node consolidation; counts and type names may no longer match the current registry. Re-audit before relying on this list.

# NX-02 — Kiểm chứng validator theo node

Snapshot `0733210`, 05/11/2026. Kiểm tra source tĩnh; không dùng credential hoặc gọi provider. Đây là bảng công việc đang làm, **không phải chứng nhận mọi node an toàn**. Tại thời điểm này, các type `.v2` còn được giữ; quyết định sau đó là hợp nhất và loại bỏ chúng.

- **Có lỗ hổng:** thấy trực tiếp trong source; tác động và giới hạn ở dưới.
- **Đã xem một phần:** đã xem một số kiểm tra trước nhánh mock; chưa đánh giá hết field, expression, credential, retry và provider response.
- **Chưa kiểm chứng:** đã xác định đường thực thi nhưng chưa đủ bằng chứng kết luận validation.
- Trigger được kiểm tra ở nhiều giai đoạn: publish, cấu hình webhook/poll và nhận payload. Dispatch mock chỉ là một phần.

## Các lỗ hổng đã thấy

1. **L1 — HTTP mock:** `connector-executors.ts` trả thành công trước khi gọi `executeHttpRequest`; URL và header sai có thể pass mock rồi thất bại khi chạy live. Chưa chạy bài tái hiện; chưa đổi hành vi graph cũ.
2. **L2 — Sheets mock:** mock dùng giá trị mẫu mà không gọi kiểm tra spreadsheet ID, range và bảng values của live. Type cũ còn fallback operation không nhận diện sang read; type `.v2` kiểm tra operation và valueInputOption trước mock. Chưa chạy bài tái hiện.
3. **L3 — If:** `compare` mặc định so sánh bằng với operator không nhận diện. Bản local từ chối lựa chọn tĩnh không hỗ trợ khi publish, nhưng giữ mặc định cũ nếu thiếu/rỗng/null và vẫn cho phép expression. Version đã publish không đổi; expression có thể resolve thành giá trị không hỗ trợ lúc chạy và vẫn fallback equals. Test mới chưa chạy.
4. **L4 — Notification mock:** `notification-adapters.ts` và các adapter notification kiểm tra nội dung Google Chat/Discord/Telegram và Telegram destination trong luồng live sau nhánh mock. Mock có thể trả thành công cho cấu hình sẽ bị live từ chối. Kiểu destination Telegram và cấu trúc Discord embeds/allowed mentions được kiểm tra trước mock; không suy ra mọi đầu vào đều bị bỏ qua. Chưa chạy bài tái hiện.
5. **L5 — Cron:** trước thay đổi local, `validatePublishableGraph` không kiểm tra cron expression/timezone; scheduler bắt lỗi parse rồi trả `null`, khiến lịch sai có thể bị bỏ qua. Bản local dùng cùng `cron-parser` và timezone mặc định để kiểm tra khi publish; draft và version cũ vẫn đọc được. Test mới kiểm tra parser/publish, nhưng **chưa chạy**, chưa tái hiện publish/activate qua database và không chứng minh scheduler/provider hoạt động. Version đã publish trước đó không được tự sửa hay xác thực lại; không suy ra mọi lần scheduler trả `null` là do sai cấu hình.
6. **L6 — Steam snapshot cũ:** nhánh mock trong registry tạo snapshot từ bất kỳ giá trị Steam ID được stringify; luồng live truyền ID cấu hình hoặc credential vào request mà không dùng validator Steam ID của node `action.steam` mới. Provider có thể từ chối ID, nhưng mock không chứng minh ID hợp lệ. Chưa chạy bài tái hiện; giữ hành vi graph cũ cho đến khi kiểm tra tương thích.
7. **L7 — Approval:** `executeNode` chọn Google Chat với bất kỳ `notificationProvider` nào khác `http_webhook`; thời gian số được giới hạn vào 1–168 giờ ở bước tạo hạn. Bản local từ chối lựa chọn tĩnh không hỗ trợ khi publish, giữ mặc định cũ và cho phép expression. Version đã publish không đổi; expression resolve thành provider không hợp lệ vẫn fallback Google Chat. Test mới chưa chạy.

## Danh sách node

| Node | Đường xử lý chính | Trạng thái |
|---|---|---|
| `trigger.manual` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.gmail` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.rss.new-item` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.telegram.update` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.vercel.deployment` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.trello.board-action` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.sentry.issue-created` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.cron` | `apps/api/src/scheduler/cron-scheduler.service.ts` | L5: bản sửa kiểm tra publish đang chờ test |
| `trigger.webhook` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.uptime-kuma.alert` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.uptime-kuma.alert.v2` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.github.issue-opened` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.github.pull-request-opened` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.github.push` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `trigger.github.workflow-run-completed` | `apps/api/src/execution/execution.service.ts (dispatch; lifecycle riêng)` | Đã xem một phần |
| `condition.if` | `apps/api/src/execution/execution.service.ts` | L3: bảo vệ publish tĩnh local, chờ test |
| `condition.switch` | `apps/api/src/execution/execution.service.ts` | Đã xem một phần |
| `action.steam.account-snapshot` | `apps/api/src/execution/steam-adapter.ts` | L6: chưa dùng validator Steam ID của node mới |
| `action.steam` | `apps/api/src/execution/steam-operations.ts` | Đã xem một phần |
| `action.riot-lol` | `apps/api/src/execution/riot-lol.ts` | Đã xem một phần |
| `action.riot-tft` | `apps/api/src/execution/riot-lol.ts` | Đã xem một phần |
| `action.riot-valorant` | `apps/api/src/execution/execution.service.ts` | Planned — không thực thi |
| `action.riot-lor` | `apps/api/src/execution/execution.service.ts` | Planned — không thực thi |
| `action.riot-2xko` | `apps/api/src/execution/execution.service.ts` | Planned — không thực thi |
| `action.google-chat.webhook` | `apps/api/src/execution/notification-adapters.ts` | L4: nội dung chỉ kiểm tra khi live |
| `action.discord.webhook` | `apps/api/src/execution/notification-adapters.ts` | L4: nội dung rỗng chỉ kiểm tra khi live |
| `action.telegram.message` | `apps/api/src/execution/notification-adapters.ts` | L4: nội dung/destination chỉ kiểm tra khi live |
| `action.telegram.reply` | `apps/api/src/execution/telegram-message-operations.ts` | Đã xem một phần |
| `action.telegram.edit-message` | `apps/api/src/execution/telegram-message-operations.ts` | Đã xem một phần |
| `action.google-drive` | `apps/api/src/execution/connector-executors.ts` | Đã xem một phần |
| `action.google-drive.v2` | `apps/api/src/execution/connector-executors.ts` | Đã xem một phần |
| `action.google-sheets` | `apps/api/src/execution/google-workspace-adapter.ts` | L2: mock bỏ qua spreadsheet/range/values; operation lạ fallback |
| `action.google-sheets.v2` | `apps/api/src/execution/google-workspace-adapter.ts` | L2: mock bỏ qua spreadsheet/range/values |
| `action.http-request` | `apps/api/src/execution/http-request-adapter.ts` | L1: mock bỏ qua URL/header |
| `approval.request` | `apps/api/src/execution/execution.service.ts` | L7: bảo vệ publish tĩnh local, chờ test |
| `action.email` | `apps/api/src/execution/smtp-email.ts` | Đã xem một phần |
| `action.google-chat.oauth` | `apps/api/src/execution/google-chat-oauth.ts` | Đã xem một phần |
| `action.google-chat.oauth.v2` | `apps/api/src/execution/google-chat-oauth.ts` | Đã xem một phần |
| `action.google-chat.reply` | `apps/api/src/execution/google-chat-oauth.ts` | Đã xem một phần |
| `action.google-chat.edit-message` | `apps/api/src/execution/google-chat-oauth.ts` | Đã xem một phần |
| `action.openai` | `apps/api/src/execution/openai-text.ts` | Đã xem một phần |
| `action.gemini` | `apps/api/src/execution/gemini-text.ts` | Đã xem một phần |
| `action.mongodb` | `apps/api/src/execution/mongodb-find.ts` | Đã xem một phần |
| `action.mongodb.insert` | `apps/api/src/execution/mongodb-find.ts` | Đã xem một phần |
| `action.notion.search-pages` | `apps/api/src/execution/notion-search.ts` | Đã xem một phần |
| `action.notion.search-pages.v2` | `apps/api/src/execution/notion-search.ts` | Đã xem một phần |
| `action.notion.retrieve-page` | `apps/api/src/execution/notion-operations.ts` | Đã xem một phần |
| `action.notion.list-children` | `apps/api/src/execution/notion-operations.ts` | Đã xem một phần |
| `action.notion.retrieve-property` | `apps/api/src/execution/notion-operations.ts` | Đã xem một phần |
| `action.notion.query-data-source` | `apps/api/src/execution/notion-operations.ts` | Đã xem một phần |
| `action.notion.create-page` | `apps/api/src/execution/notion-create-page.ts` | Đã xem một phần |
| `action.notion.update-title` | `apps/api/src/execution/notion-create-page.ts` | Đã xem một phần |
| `action.rss.read` | `apps/api/src/execution/rss-read.ts` | Đã xem một phần |
| `action.trello.create-card` | `apps/api/src/execution/trello.ts` | Đã xem một phần |
| `action.trello.get-card` | `apps/api/src/execution/trello-operations.ts` | Đã xem một phần |
| `action.trello.update-card` | `apps/api/src/execution/trello-operations.ts` | Đã xem một phần |
| `action.trello.move-card` | `apps/api/src/execution/trello-operations.ts` | Đã xem một phần |
| `action.trello.archive-card` | `apps/api/src/execution/trello-operations.ts` | Đã xem một phần |
| `action.trello.list-cards` | `apps/api/src/execution/trello-operations.ts` | Đã xem một phần |
| `action.trello.find-cards` | `apps/api/src/execution/trello-operations.ts` | Đã xem một phần |
| `action.sentry.list-issues` | `apps/api/src/execution/sentry.ts` | Đã xem một phần |
| `action.sentry.list-issues.v2` | `apps/api/src/execution/sentry.ts` | Đã xem một phần |
| `action.sentry.get-issue` | `apps/api/src/execution/sentry-observability.ts` | Đã xem một phần |
| `action.vercel.list-deployments` | `apps/api/src/execution/vercel.ts` | Đã xem một phần |
| `action.vercel.list-deployments.v2` | `apps/api/src/execution/vercel.ts` | Đã xem một phần |
| `action.vercel.public-deployment-lookup` | `apps/api/src/execution/vercel-observability.ts` | Đã xem một phần |
| `action.supabase.select` | `apps/api/src/execution/supabase.ts` | Đã xem một phần |
| `action.supabase.select.v2` | `apps/api/src/execution/supabase.ts` | Đã xem một phần |
| `action.supabase.insert-row` | `apps/api/src/execution/supabase.ts` | Đã xem một phần |
| `action.reddit.list-posts` | `apps/api/src/execution/reddit.ts` | Đã xem một phần |
| `action.postgres.select` | `apps/api/src/execution/postgres-read.ts` | Đã xem một phần |
| `action.postgres.select.v2` | `apps/api/src/execution/postgres-read.ts` | Đã xem một phần |
| `action.gmail.read` | `apps/api/src/execution/gmail-read.ts` | Đã xem một phần |
| `action.gmail.read.v2` | `apps/api/src/execution/gmail-read.ts` | Đã xem một phần |
| `action.gmail.get-message` | `apps/api/src/execution/gmail-get-message.ts` | Đã xem một phần |
| `action.gmail.send` | `apps/api/src/execution/gmail-write.ts` | Đã xem một phần |
| `action.gmail.reply` | `apps/api/src/execution/gmail-write.ts` | Đã xem một phần |
| `action.gmail.create-draft` | `apps/api/src/execution/gmail-write.ts` | Đã xem một phần |
| `action.gmail.update-draft` | `apps/api/src/execution/gmail-write.ts` | Đã xem một phần |
| `action.gmail.modify-label` | `apps/api/src/execution/gmail-write.ts` | Đã xem một phần |
| `action.google-calendar.list-events` | `apps/api/src/execution/google-calendar.ts` | Đã xem một phần |
| `action.google-calendar.create-event` | `apps/api/src/execution/google-calendar.ts` | Đã xem một phần |
| `action.google-calendar.get-event` | `apps/api/src/execution/google-calendar.ts` | Đã xem một phần |
| `action.google-calendar.update-event` | `apps/api/src/execution/google-calendar.ts` | Đã xem một phần |
| `action.google-calendar.delete-event` | `apps/api/src/execution/google-calendar.ts` | Đã xem một phần |
| `action.google-calendar.availability` | `apps/api/src/execution/google-calendar.ts` | Đã xem một phần |
| `action.github` | `apps/api/src/execution/github-write-adapter.ts` | Đã xem một phần |
| `action.github.add-label` | `apps/api/src/execution/github-write-adapter.ts` | Đã xem một phần |
| `action.github.add-comment` | `apps/api/src/execution/github-write-adapter.ts` | Đã xem một phần |
| `action.github.merge-pull-request` | `apps/api/src/execution/github-write-adapter.ts` | Đã xem một phần |
| `action.github.list-issues` | `apps/api/src/execution/github-read.ts` | Đã xem một phần |
| `action.github.get-issue` | `apps/api/src/execution/github-read.ts` | Đã xem một phần |
| `action.github.update-issue` | `apps/api/src/execution/github-update-issue.ts` | Đã xem một phần |
| `action.github.list-pull-requests` | `apps/api/src/execution/github-read.ts` | Đã xem một phần |
| `action.github.get-pull-request` | `apps/api/src/execution/github-read.ts` | Đã xem một phần |
| `action.facebook-meta` | `apps/api/src/execution/execution.service.ts` | Planned — không thực thi |
| `action.instagram` | `apps/api/src/execution/execution.service.ts` | Planned — không thực thi |

## Ranh giới bằng chứng

- Bài `operation-metadata.test.ts` kiểm tra đường dispatch và fixture mock; không chứng minh mọi config bất hợp lệ bị từ chối hoặc tác dụng provider thật.
- `validatePublishableGraph` kiểm tra cấu trúc graph và một số trigger; validation action chủ yếu diễn ra tại adapter sau khi expression được resolve.
- Các trường bắt buộc có thể phụ thuộc quyền và dữ liệu thực tế; mock không xác nhận được các điều kiện đó.
- Không tạo schema song song hay đổi type cũ; ưu tiên kiểm tra, tái hiện và sửa từng lỗ hổng với kiểm thử tương thích.
