# Audit khả năng mở rộng node — Fluxora và n8n

## Trạng thái phát hành mới nhất — 05/11/2026

PR [#84](https://github.com/phuuthanh-dev/fluxora/pull/84) đã merge tại
`ff4302dbf2e48618b1721770975666a094aaa2c8`. [Quality gate trên main](https://github.com/phuuthanh-dev/fluxora/actions/runs/41927994423)
và [deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/41929879005)
thành công. Sau deploy, landing, login, API liveness và readiness đều trả 200.
Đây là kiểm tra tại thời điểm, không chứng minh workflow hoặc provider thật.
PR phát hành Drive search có hướng dẫn, gợi ý expression từ node phía trước và
guard từ chối sử dụng dữ liệu đã che được nạp lại. Các mục chưa được chứng minh
trong bảng dưới vẫn chưa hoàn tất chỉ vì release thành công.

**NX-02 bản local sau PR #84, chờ verify:** dropdown cấu hình chung không còn
hiện nhầm option đầu khi giá trị chưa đặt hoặc không nằm trong danh sách. UI
hiển thị trạng thái tương ứng và giữ nguyên giá trị đã lưu cho đến khi người
dùng chọn lại; không tự đổi graph hay hành vi mặc định của API. Trường hợp
GitHub update issue được bổ sung vào E2E giả lập, chưa chạy.

### Snapshot trước PR #84

PR [#83](https://github.com/phuuthanh-dev/fluxora/pull/83) đã merge vào
`main` tại `3128cc661320ad38eff43f759c71ffbad5010346`. Quality gate của
[commit merge](https://github.com/phuuthanh-dev/fluxora/actions/runs/41913745808)
và [deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/41915564897)
đều thành công. Sau deploy, landing, login và API health trả HTTP 200; đây chỉ
là smoke check, không chứng minh workflow hoặc từng provider hoạt động thật.
Full `npm run verify` cục bộ cho commit `386a1db` có cùng source tree với PR
head: 968 test API, 76 test web và 213 Playwright, dùng database/Redis riêng,
dữ liệu giả và scheduler tắt. CI xác minh lại trên Node 22.

Các bảng và ghi chú bên dưới là **snapshot lịch sử**, trừ khi nêu rõ thời điểm
khác. Dùng trạng thái sau để xác định công việc còn lại, tránh triển khai lại
những operation đã có:

| Mục | Đã có trong bản phát hành | Chưa chứng minh hoặc chưa thực hiện |
|---|---|---|
| NX-02 | Executor registry, mô tả output/pagination, trường cấu hình dùng chung và hướng dẫn trang tiếp; giữ type cũ và `.v2`. Đã bỏ reader thử nghiệm numeric `nodeVersion: 2`. | Metadata mô tả không phải runtime schema; chưa có bằng chứng đầy đủ mock hợp lệ và redaction theo từng operation. Phân trang vẫn cần người dùng chủ động lấy trang tiếp. |
| NX-03 | Bộ chọn/lọc dữ liệu PostgreSQL, Supabase, Sheets mapping, Notion content/property và Trello card operations; có năm workflow mẫu. | Test giả và smoke check không chứng minh quyền hoặc hành vi live của từng operation/provider. |
| NX-04 | Các operation Gmail, Chat, Telegram, GitHub, Sentry và Vercel trong checklist đã có đường thực thi. | Chưa có live qualification đầy đủ cho từng operation, scope thực cấp và kết quả ghi không chắc chắn. |
| NX-05 | RSS và các trigger Kuma, Telegram, Trello, Sentry, Vercel có implementation và test giả lập. | Registration một số provider vẫn thủ công; chưa chứng minh delivery/recovery thật cho mọi provider, không cam kết exactly-once. |
| NX-06 | Gemini/OpenAI structured output, schema validation, usage và giới hạn theo request. | Không có kiểm soát tổng chi phí; khả năng schema phụ thuộc model/provider, và media/binary chưa triển khai. |
| NX-07 | [Ghi nhận quyết định](38-nx07-design-decisions.md) cho batch/item, binary, database changes, Reddit và Meta. | Đây là quyết định phạm vi, không phải implementation của các khả năng bị hoãn hoặc quyền truy cập provider. |

Không đánh dấu toàn bộ NX hoàn tất chỉ vì PR hoặc CI thành công. Không tự dùng
credential thật hay bật provider integration để lấp khoảng thiếu bằng chứng.

**Verify local sau PR #83:** commit `c2d6367` đã đạt `npm run verify` trong
môi trường cô lập với 971 test API, 78 test web và 214 Playwright; test dùng
database/Redis riêng, dữ liệu giả và scheduler tắt. Các commit tiếp sau commit
này chưa được kiểm tra bằng lượt verify đó và chưa được phát hành. Kết quả
không thay thế CI Node 22 hoặc kiểm thử provider thật.

Lượt verify cô lập tiếp theo tại `10f1dba` đã hoàn tất: 972 test API,
80 test web và 214 Playwright, cùng typecheck/build và harness checks. Lượt
này bao gồm kiểm thử trigger output đã che, webhook Trello/Sentry đến ngược
thứ tự và gợi ý expression. Database và Redis là tài nguyên thử riêng,
scheduler tắt; không sử dụng provider hoặc credential thật. Log có cảnh báo
GSAP/WebGL trong trình duyệt thử, các bài liên quan vẫn pass. Một commit chỉ
cập nhật tài liệu sau lượt này không thay đổi source đã kiểm thử. CI trên head
PR vẫn cần chạy; kết quả này không xác nhận mọi operation hoặc provider thật.

**Snapshot trước PR #84:** Drive search `.v2` có
bộ lọc theo tiền tố tên, loại file và thư mục cha trực tiếp, dùng folder picker
có fallback nhập ID. Nó tạo chính trường `query` đã có, không đổi graph hay
runtime cũ; query phức tạp và expression vẫn ở chế độ nâng cao. Điều kiện mới
xóa cursor cũ qua cơ chế hiện có. [Google mô tả `name contains` là khớp tiền tố
và `parents` chỉ khớp thư mục cha trực tiếp](https://developers.google.com/workspace/drive/api/guides/ref-search-terms),
cũng như yêu cầu [escape dấu nháy và backslash](https://developers.google.com/workspace/drive/api/guides/search-files).
[n8n Drive](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/file-operations/)
cung cấp chọn tài nguyên từ danh sách hoặc nhập ID; phần này học cách chọn, không
khẳng định parity toàn bộ. Test giả lập thuộc lượt verify `c2d6367` nêu trên;
chưa thử Google thật.

**Snapshot trước PR #84:** trước đây output được
lưu dưới dạng đã che, rồi được dùng lại khi tiếp tục sau approval; expression
có thể nhận nguyên chuỗi `[REDACTED]` và truyền nhầm cho action. Trigger data
cũng được lưu sau khi che. Bản local từ chối expression tham chiếu trực tiếp
hoặc lồng tới giá trị đã che trong trigger data hay output được nạp lại, trước
khi action đọc credential hoặc gọi provider; việc này cũng áp dụng khi truy cập
trigger data thông qua output của node trigger. Các giá trị không bị che và output
mới khác trong cùng lượt vẫn hoạt động như trước. Lỗi có thể đi qua error branch.
Đây là fail-closed, không khôi phục giá trị gốc; một giá trị hợp lệ có sẵn chuỗi
`[REDACTED]` trong dữ liệu đã lưu cũng có thể bị từ chối. Kiểm thử ở commit
`c2d6367` đã pass; kiểm thử cho trường hợp truy cập thông qua output của trigger
được bổ sung sau đó và đã pass trong lượt `10f1dba`. Chưa khẳng định xử lý được mọi
cách làm mờ tùy provider.

**NX-05 kiểm thử local:** trường hợp PostgreSQL giả lập cho
Trello và Sentry được mở rộng để nhận một sự kiện có identity lớn trước, sau
đó nhận và nhận lại identity nhỏ hơn. Kiểm thử xác nhận hai identity độc lập
được tạo execution riêng và lần nhận lại được deduplicate. Đây kiểm tra lớp
lưu delivery, không chứng minh provider gửi tuần tự, thứ tự thực thi workflow,
hay exactly-once; kiểm thử tích hợp giả lập đã pass tại `10f1dba`, chưa chạy
kiểm thử provider thật.

**NX-02 gợi ý expression local:** inspector dùng các trường output
đã biết để gợi ý đường dẫn cho node phía trước ngay cả trước lần chạy đầu;
kết quả từ lần chạy gần nhất chỉ hiển thị cho node thành công còn nằm trên
đường đi tới node đang sửa và cùng loại với graph được chạy. Các gợi ý chỉ là
khả năng: trường có thể khác theo operation và nhánh có thể không được chạy.
Không thay runtime schema, không thay graph hoặc bảo đảm output của provider.
Với Gemini/OpenAI, schema hợp lệ đã áp dụng còn gợi ý `json` và các trường
object có tên tương thích expression; schema động hoặc chưa hợp lệ không được
đoán. Những gợi ý này không xác nhận model hỗ trợ schema hay lần chạy thành công.

> Trạng thái kiểm tra 05/11/2026: PR #82 đã merge vào `main` tại
> `6c9a36ee4b68ce1083770dac2c283125d76c10e5`; workflow deploy tại commit đó
> [hoàn tất thành công](https://github.com/phuuthanh-dev/fluxora/actions/runs/41871198903).
> Các commit `ba23eed` và `6569fc9` bổ sung và bảo vệ Supabase Insert chỉ có
> trên `develop` local tại thời điểm kiểm tra, chưa thuộc PR hoặc deployment này.
> Các ghi chú dưới đây là bằng chứng theo thời điểm, không tự động mô tả bản
> hiện tại. CI không chứng minh provider thật, parity n8n hoặc toàn bộ NX-07.
> [Lịch sử chuyển production NX](42-ke-hoach-chuyen-production-nx.md).

Ngày đối chiếu: **2026-11-02**. Source Fluxora: **`04d67b60ed257304ca9aaeaa8dbe4e3969faa4db`**, sau PR #73; nhánh audit local `codex/node-expansion-audit`.

## 1. Kết luận và phạm vi

Fluxora có nền tảng phù hợp để mở rộng từng integration: danh mục App → Operation, field khai báo, resource picker, credential theo workspace, adapter chạy ở server, published version bất biến, webhook registration và execution history. **Không cần viết lại các phần này.** Nhưng độ sâu chức năng chưa tương đương n8n: nhiều app mới có một thao tác, một số danh sách chưa đi được trang tiếp theo, chưa có hợp đồng version riêng cho operation và chính sách retry cần phân biệt đọc với ghi.

Kiểm kê bằng TypeScript AST từ `apps/web/src/features/workflow/node-catalog.ts`, đối chiếu `packages/workflow-contracts/src/index.ts`:

| Chỉ số | Kết quả | Ý nghĩa |
|---|---:|---|
| App trong catalog | 25 | Bao gồm HTTP và hai app roadmap |
| App có ít nhất một node executable | 23 | Không đồng nghĩa đủ operation hoặc đã live-qualified |
| Loại node trong catalog/contract | 46 | Một loại có thể chứa nhiều operation, như Drive/Sheets |
| Loại node executable | 44 | 38 loại thuộc app + 6 loại core |
| Loại chưa executable | 2 | Facebook Meta, Instagram |
| Core hiện có | 6 | Manual, Schedule, Webhook, If/else, Switch, Approval |

Phần kiểm kê dưới đây là **ảnh chụp tại commit audit**, không tự cập nhật theo source. Tiến độ bản nháp sau audit được ghi riêng ở mục 6; chỉ xem mục đó là implementation đang chờ tích hợp và xác minh, không phải kết quả production. Không dùng tổng số node của hai sản phẩm để suy ra phần trăm hoàn thiện.

Ba agent chạy song song, kế thừa model phiên hiện tại, nhận context tối thiểu và chỉ đọc: Google Workspace; communication/productivity; data/DevOps. Coordinator kiểm tra contracts, runtime, HTTP, AI, Meta/Instagram, tổng hợp và kiểm chứng các phát hiện chính. Không có agent ghi cùng file hay tự tạo PR.

## 2. Cách đọc bằng chứng

- **Implemented:** có catalog, contract và đường thực thi, không chỉ có icon/form.
- **Test source:** thấy test với transport/dependency giả; không phải kết quả test mới hoặc live run, kể cả test có chữ “live”.
- **Historical live:** lần chạy được ghi nhận trước trong [coverage ledger](35-connector-coverage-and-discovery.md). Dùng đoạn cập nhật mới nhất; không biến một lần chạy thành cam kết SLA.
- **Native n8n:** node thuộc bundle chính thức. **Generic:** HTTP Request/Webhook; không tính là node chuyên biệt. Community và verified-community là hai trạng thái khác nhau.
- n8n docs được đọc ngày trên. Manifest được coordinator đối chiếu tại [commit `86d52c32e42602f2df9eeb3ce8d6a0ab992df92c`](https://github.com/n8n-io/n8n/blob/86d52c32e42602f2df9eeb3ce8d6a0ab992df92c/packages/nodes-base/package.json), package `nodes-base` **2.46.0**. Đây không phải số phiên bản toàn bộ n8n hay một installation đã test. Docs online có thể khác release đang dùng.
- S/M/L là độ phức tạp tương đối: S mở rộng adapter/form; M thêm schema/resource/auth và error semantics; L thêm lifecycle bền vững, binary hoặc engine semantics. Không phải cam kết số ngày.

## 3. Ma trận toàn bộ app

Các scope dưới đây là phần hữu ích nên đánh giá; không có nghĩa phải phủ mọi endpoint nhà cung cấp. Nguồn code ghi theo đường dẫn tương đối repository và dòng tại base commit.

### Google Workspace

| App ID | Fluxora hiện có; nguồn code | n8n chính thức | Khoảng thiếu và hướng mở rộng |
|---|---|---|---|
| `google-drive` | List/search metadata, upload/download **text**; không trigger. `apps/api/src/execution/execution.service.ts:907` | [File/folder/shared-drive actions](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/): copy/move/update/share/delete, upload/download; [polling trigger](https://github.com/n8n-io/n8n/blob/86d52c32e42602f2df9eeb3ce8d6a0ab992df92c/packages/nodes-base/nodes/Google/Drive/GoogleDriveTrigger.node.ts) theo file/folder. | P1/S–M: trả/nhận cursor ở **action**, giới hạn payload và retry upload. P2/M: get metadata, tạo folder, copy/move; P3/L: binary/export, change trigger. Picker phân trang không làm action tự phân trang. Search hiện dùng cú pháp query Drive; cần form tên/type/folder và chế độ advanced. |
| `google-sheets` | Read/append/update A1 range; matrix values, `USER_ENTERED`; không trigger. `execution.service.ts:935` | [Spreadsheet/sheet/row operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/) có lookup, append-or-update, tạo/xóa sheet; [row-change polling](https://github.com/n8n-io/n8n/blob/86d52c32e42602f2df9eeb3ce8d6a0ab992df92c/packages/nodes-base/nodes/Google/Sheet/GoogleSheetsTrigger.node.ts). | P1/M: chọn tab/header, map cột có type, `RAW`/`USER_ENTERED`, bounded range. P2/M: lookup/update/upsert theo key, tạo sheet. P3/L: row trigger cần baseline, identity và xử lý reorder. Sheets đọc theo range; không áp cursor của app khác máy móc. |
| `gmail` | Read tối đa 10 thư, plain text; polling thư mới có filter/checkpoint/lease/dedup, 1/5/15/60 phút. `apps/api/src/execution/gmail-read.ts:57`, `apps/api/src/scheduler/gmail-trigger.service.ts:88` | [Message/draft/label/thread actions](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/); [Message Received trigger cũng polling](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.gmailtrigger/). | P1/M: get-by-ID, cursor action, trạng thái poll lỗi. P2/M: label/read-status, draft/send/reply sau consent mới. P3/L: attachment và [Pub/Sub push](https://developers.google.com/workspace/gmail/api/guides/push) với renewal/dedup. Không coi polling hiện tại là sai hoặc mặc định phải đổi webhook. |
| `google-calendar` | List/get/create/update/delete/free-busy; list có token + timeMin; create có deterministic ID/reconciliation. `apps/api/src/execution/google-calendar.ts:28` | [Sáu nhóm action tương ứng](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/); [polling created/updated/cancelled/started/ended](https://github.com/n8n-io/n8n/blob/86d52c32e42602f2df9eeb3ce8d6a0ab992df92c/packages/nodes-base/nodes/Google/Calendar/GoogleCalendarTrigger.node.ts). | Không làm lại CRUD. P1/M: date window, search, event-picker pagination, explicit clear field. P2/M: all-day/time-zone/recurrence và attendee controls. P3/L: durable trigger. Event picker hiện chỉ 50 upcoming events; không nhầm với action có pagination. |
| `google-chat` | Gửi webhook hoặc user OAuth; space picker ≤100; không inbound trigger. `apps/api/src/execution/google-chat-oauth.ts:9`, `apps/api/src/notifications/google-chat.adapter.ts:18` | [Space/member reads, message create/get/update/delete/send-and-wait](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlechat/). Không thấy Chat trigger riêng trong bundle kiểm tra. | P0/M: sửa retry semantics. P1/M: space cursor, account/scope/API diagnostics. P2/M: reply thread, read/edit/delete message với scope tương ứng. P3/L: interaction/event subscriptions. Send-and-wait callback không đồng nghĩa nhận mọi tin nhắn. [App/user auth có quyền khác nhau](https://developers.google.com/workspace/chat/authenticate-authorize). |

Google sign-in chỉ xin identity; credential Drive/Sheets, Gmail, Calendar, Chat tách theo mục đích nhưng dùng cấu hình OAuth client chung. Source `apps/api/src/credentials/google-oauth.controller.ts:8`: Drive+Sheets dùng quyền rộng theo lựa chọn đã có của chủ dự án; Gmail hiện `gmail.readonly`; Calendar và Chat có scope riêng. Mở thêm action phải kiểm tra granted scopes và reconnect có chủ đích, không lấy Google login làm credential app hoặc tự thêm mọi scope.

### Communication và productivity

| App ID | Fluxora hiện có; nguồn code | n8n chính thức | Khoảng thiếu và hướng mở rộng |
|---|---|---|---|
| `email` | SMTP text **hoặc** HTML, To/Cc/Bcc/Reply-To; sender từ credential. Không attachment/inbound. `apps/api/src/execution/smtp-email.ts:39` | [Send Email](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/) có multipart, attachments, send-and-wait; [IMAP trigger riêng](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.emailimap/). | P0–P1/M: phân biệt accepted/partial rejection/delivery uncertain, không báo đã tới inbox chỉ vì SMTP trả thành công. P2/S: text+HTML và sender name. P3/L: binary attachments/IMAP. Giữ grouping Email UX hiện có, không gộp provider SMTP với Gmail OAuth. |
| `discord` | Incoming webhook content/embeds/username/avatar/allowedMentions; mặc định không parse mentions. `apps/api/src/notifications/discord.adapter.ts:118` | [Bot/OAuth actions](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discord/): channel/message/member operations, reactions, send-and-wait. Không thấy native event trigger riêng. | P1/S: payload bounds và xác nhận message receipt (`wait=true` chưa bắt buộc). P2/M: bot credential riêng, guild/channel picker, get/react. P3/L: event ingress nếu cần. Webhook URL không cấp quyền quản lý guild hay list channel; [auth modes](https://docs.n8n.io/integrations/builtin/credentials/discord/). |
| `telegram` | sendMessage, parse mode, DM/group/supergroup/channel, topic; manual IDs có hướng dẫn. `apps/api/src/notifications/telegram.adapter.ts:19` | [Message/media/chat/callback actions](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/) và [update webhook trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/). | P1/S–M: message length/plain-text safety, reply/edit. P2/L: message/callback trigger + approval bằng bot token, HTTPS, update-ID dedup, allowlist. [Một webhook mỗi bot](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/common-issues/) nên thiết kế test/live và registration ownership trước. Không hứa list mọi DM của bot. |
| `steam` | Snapshot profile/current game/library/recent games/playtime, optional achievements. `apps/api/src/execution/execution.service.ts:838` | Không có node trong bundle đã kiểm tra. [Community package của tác giả](https://github.com/dhayab/n8n-nodes-steam) có profile/games/achievements/friends; chưa xác minh trạng thái n8n-verified. HTTP generic cũng là một hướng. | P1/S: bounded arrays, lỗi từng subrequest và private/unavailable khác empty. P2/M: vanity-ID resolver, game picker. P3/L: activity polling nếu có use case. OpenID login không thay API key/SteamID64. Kiểu `gameid` và failure achievements cần test contract riêng, chưa kết luận bug live. |
| `trello` | Create card title/description; board/list picker, kiểm tra list thuộc board. `apps/api/src/execution/trello.ts:50` | [Board/card/list/label/checklist/comment actions](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.trello/); [model webhook trigger](https://github.com/n8n-io/n8n/blob/86d52c32e42602f2df9eeb3ce8d6a0ab992df92c/packages/nodes-base/nodes/Trello/TrelloTrigger.node.ts). | P1/M: get/find/update/move/archive card, comments/labels; pagination picker. P2/L: event trigger. Không làm lại create đã live-qualified. Cần [signature + HEAD handshake](https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/) và app secret cho webhook; API key/token hiện có chưa đủ để xác minh signature. |
| `notion` | Search pages trả id/title/cursor, nhưng executor chưa nhận cursor vào. Không đọc content hay write. `apps/api/src/execution/notion-search.ts:11,52` | [Blocks, data sources, database pages, page Markdown, users](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.notion/); [page-added/updated polling](https://github.com/n8n-io/n8n/blob/86d52c32e42602f2df9eeb3ce8d6a0ab992df92c/packages/nodes-base/nodes/Notion/NotionTrigger.node.ts). | P1/S–M: cursor, page/content read, data-source query + property picker, create/update task pages. P2/L: polling. Token chỉ thấy tài nguyên được share. API đang pin `2022-06-28`; cần [database/data-source migration](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03) trước khi mở rộng, không đổi version âm thầm cho workflow cũ. |

### Data và DevOps

| App ID | Fluxora hiện có; nguồn code | n8n chính thức | Khoảng thiếu và hướng mở rộng |
|---|---|---|---|
| `github` | Issue create, add label/comment, merge PR; 4 event triggers; registration/signing/delivery dedup đã có. `apps/api/src/execution/execution.service.ts:712`, `apps/api/src/webhooks/webhook.service.ts:126` | [File/issue/PR/release/repository/workflow actions](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.github/); [native trigger + hook lifecycle](https://github.com/n8n-io/n8n/blob/86d52c32e42602f2df9eeb3ce8d6a0ab992df92c/packages/nodes-base/nodes/Github/GithubTrigger.node.ts). | P0/M: ambiguous comments/issue dedup and expected-head merge protection. P1/M: issue/PR list/get/update with pickers/cursors. P2/M: workflow dispatch/release nếu có use case. Managed hook feature có trong source; setting deploy chưa kiểm tra trong audit. Repo picker không chứng minh token có quyền write/hook/merge. |
| `mongodb` | Find ≤100 docs và insert một doc ≤200 KB, guided filter/fields; database/collection picker. `apps/api/src/execution/mongodb-find.ts:151` | [Find/aggregate/insert/update/delete/find-and-update/search indexes](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mongodb/); không thấy native trigger trong bundle. | P1/M: projection/sort/keyset, ObjectId/BSON types. P2/M: update/upsert/delete **một** doc bằng identity/filter rõ ràng. Guarded SRV seed có; unrestricted replica discovery chưa có. Giữ `WRITE_UNCERTAIN` và disabled driver retries; không tự thêm change stream trước thiết kế resume token. |
| `postgres` | `SELECT *` giới hạn dòng; schema/table picker, verified TLS + custom CA. Builder có columns/conditions nhưng runtime truyền arrays rỗng. `apps/api/src/execution/postgres-read.ts:39` | [Select/SQL/insert/upsert/update/delete](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/); [DB change/channel trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.postgrestrigger/). | P1/M: expose columns/filter với parameter binding, order/cursor. P2/M: keyed writes, transaction + affected-row ceiling. P3/L: LISTEN lifecycle/reconnect/loss và privileges. Không mặc định mở arbitrary SQL chỉ để giống n8n; transaction hiện read-only. |
| `supabase` | Public table `select=*`, ≤100 rows/200 KB; table discovery bằng Data API hoặc optional Management token. `apps/api/src/execution/supabase.ts:68` | [Create/get/list/update/delete rows, custom schema](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/); không thấy native trigger trong bundle. | P1/M: typed columns/filter/order/pagination. P2/M: insert/keyed update/delete với RLS và mutation bounds. P3/L: row changes có reconnect/dedup. Không ép elevated Management key để đọc data; picker denied vẫn dùng manual. |
| `sentry` | List issues theo org/project/status ≤100; org/project picker. `apps/api/src/execution/sentry.ts:33` | [Event/issue/project/release/org/team actions](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sentryio/); không thấy native trigger trong bundle. | P1/S–M: get issue, cursor, search filters. P2/M: resolve/reopen, signed alert ingress. Giữ region US/Germany/global, token least privilege, không lưu nguyên payload nhạy cảm. Current `hasMore` không trả continuation. |
| `vercel` | List project deployments ≤100; team/project picker, Personal fallback khi team API 403. `apps/api/src/execution/vercel.ts:41` | Không có node trong bundle kiểm tra; [HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/) + [Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) là hướng generic; community status chưa xác minh. | P1/S–M: get deployment/status, continuation (`pagination.next` đang không được expose). P2/M: signed project events + lifecycle. Create/promote/rollback/environment changes là scope riêng tác động cao, chưa chọn làm mặc định. |
| `reddit` | App-only OAuth list public posts new/hot ≤100, metadata; chưa live-qualified. `apps/api/src/execution/reddit.ts:20` | [Native post/comment/profile/subreddit/user actions](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.reddit/); không thấy trigger riêng. | **Provider-blocked.** Chỉ đánh giá read/search/comment/after cursor khi có đường truy cập được phép. n8n có node không cấp API access cho Fluxora. Không dùng RSS như cách lách lâu dài; xem timeline dưới. |
| `rss` | Read RSS/Atom ≤100 items, XML 1 MB, Atom content fallback; không trigger. `apps/api/src/execution/rss-read.ts:72` | [RSS Read](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedread/) + [RSS Feed Trigger polling](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedreadtrigger/). | P1/L: new-item trigger dùng checkpoint/lease/atomic enqueue, GUID→link→hash identity, first-run policy, conditional requests. Feed truncation không phải pagination; catch-up phải bounded. Summary có thể là HTML: sanitize tại nơi render. |
| `uptime-kuma` | Inbound monitor-alert, status 0–3, header secret, test notification không tạo execution. `apps/api/src/webhooks/webhook.service.ts:75` | Không có node trong bundle kiểm tra; generic Webhook nhận [payload upstream](https://github.com/louislam/uptime-kuma/blob/df601c58d9205562f34cfe5ef35264b341019d19/server/notification-providers/webhook.js). | P1/M: monitor/status filters, durable identity/replay/dedup policy; hiện dedup phụ thuộc caller-supplied idempotency key. Công bố ordering/loss/retry limits. Không tự dựa internal API để quản lý monitor khi chưa có supported management contract. |

**Reddit:** [thông báo chính thức 08-10-2026](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026) đóng yêu cầu public Data API mới từ 31-10-2026; bắt đầu rút quyền app chưa đăng ký 12-01-2027; phần public API còn lại kết thúc tháng 03-2027. RSS dừng 13-11-2026. Cần đánh giá migration/approval theo app cụ thể, không tiếp tục phát triển write features với giả định token sẽ lấy được như trước.

### AI, HTTP và roadmap social

| App ID | Fluxora hiện có; nguồn code | n8n chính thức | Khoảng thiếu và hướng mở rộng |
|---|---|---|---|
| `gemini` | Text generateContent, model picker lọc supportedGenerationMethods, prompt/max output/timeout. `apps/api/src/execution/gemini-text.ts:18,42` | [Text, audio, document, image, media, video, file-search operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.googlegemini.md). | P1/M: structured JSON output có schema validation, system instruction, usage metadata, capability-aware model choices. P2/M–L: image/document analysis sau binary contract. Không cần agent/RAG framework chỉ để tóm tắt hoặc trích field. API key khác Google OAuth. |
| `openai` | Responses API text, `store:false`, bounded output, model list; không tools/media/conversation. `apps/api/src/execution/openai-text.ts:24,35` | [Responses/chat, moderation, image/audio/file/video/conversation](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/). | P1/M: structured output/usage + tương thích model; picker hiện lọc cú pháp ID chứ chưa chứng minh Responses text capability. Không migration lại sang Responses vì đã dùng. P2/M–L: media theo use case; API key/chi phí và live proof riêng. |
| `http` | Request method/URL/body/header + vault bearer/basic/API key/custom-header auth; public outbound guards. `apps/api/src/execution/execution.service.ts:742`, `apps/api/src/execution/http-credential.ts:3` | [Generic auth + predefined provider credentials, form/binary, pagination, batching, status/headers](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/). | P0–P1/M: bounded response reader, typed query/body, safe headers and cursor bounds. P2/M: reuse provider credentials **chỉ với host/method policy**, không attach token vào URL tùy ý. Generic HTTP là advanced escape hatch, không thay guided connector cho non-tech. |
| `facebook-meta` | Planned `available:false`; không executor. `apps/web/src/features/workflow/node-catalog.ts`, `packages/workflow-contracts/src/index.ts:64` | [Facebook Graph API GET/POST/DELETE](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.facebookgraphapi/), [Lead Ads trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebookleadadstrigger/), Facebook Trigger. | P3/L, riêng product decision: chọn một use case page/lead, app review, scope, account eligibility, registration và delete lifecycle. Không hiển thị “ready” chỉ vì đã có form/token. Lead Ads có xung đột test/live webhook cần thiết kế trước. |
| `instagram` | Planned `available:false`; không executor. Cùng catalog/contract trên. | [Instagram object thuộc Facebook Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/instagram/); Graph API/generic HTTP cho action theo API. Không suy ra native Instagram action riêng từ template marketing. | P3/L: tách comment/mention/message event khỏi publishing/media action. Chọn đúng API/auth flow và account eligibility trước, rà app review theo use case. Không cam kết upload/schedule mọi loại media ngay lượt đầu. |

## 4. Phát hiện kiến trúc cần xử lý trước

| ID / mức | Bằng chứng tại source | Tác động | Phương án tối thiểu và tiêu chí chấp nhận |
|---|---|---|---|
| A1 / P0 | `google-chat-oauth.ts:42` đặt 5xx không retry, nhưng `execution.service.ts:517` OR với `isRetryableFailure`; `retry-policy.ts:6` cho phép 5xx. | Có thể resend khi cấu hình >1 attempt; audit chưa quan sát duplicate thật. | Retry decision phải biểu đạt explicit deny khác unspecified. Test engine+adapter với write 5xx/timeout và read 429; không chỉ unit-test adapter. Giữ Calendar reconciliation và Trello/Mongo uncertain-write guards đã có. |
| A2 / P0–P1 | SMTP `SendMailResult.accepted` có trong type nhưng không dùng; `normalizedDelivery` luôn `delivered:true` (`smtp-email.ts:33,63,134`). Một số create/comment/append dùng generic retry. | Thành công gửi request không đồng nghĩa inbox delivery hoặc mọi recipient được chấp nhận; write replay có thể trùng. | Chuẩn hóa accepted/partial/uncertain, giữ compatibility output cũ có version; đánh dấu side effect per operation. Không hứa exactly-once nếu provider không hỗ trợ idempotency/reconciliation. |
| A3 / P1 | HTTP `response.text()` tại `execution.service.ts:760`; Drive/Sheets `response.text/json()` tại `:907–965` không dùng bounded reader như `provider-json.ts:5`. | Payload lớn có thể tiêu thụ bộ nhớ, DB execution storage và render quá nhiều. Chưa load-test/exploit. | Streaming byte limit, timeout/cancellation, truncate hoặc lỗi có nghĩa; object output có giới hạn. Không fetch hết rồi mới cắt. Giữ fixed provider hosts/SSRF guards. |
| A4 / P1 | Nhiều action mất cursor; Notion helper trả cursor nhưng executor không nhận; PostgreSQL builder có filter nhưng `postgres-read.ts:39` truyền `[]`. | Người dùng tưởng đọc hết hoặc lọc được vì picker có filter. | Capability matrix phân biệt action/picker; standardized page envelope **mới** và backward-compatible adapter, max pages/items/bytes. Cung cấp single-page + next cursor trước, không tự thêm vòng lặp không giới hạn. |
| A5 / P1 | `NodeDefinition` và `NodeConfigurationField` ở web catalog; dispatcher dài ở `execution.service.ts:635`; resource endpoint/response mapping nằm trong `resource-picker.tsx:82`; `workflow-editor.tsx:273` hard-code Calendar help bằng key `pageToken`. | Thêm app phải chạm nhiều mapping; dùng lại cùng key có thể hiển thị help sai provider. | Chuyển dần metadata thuần và config/output schema vào shared contracts; executor/discovery registry ở server. Field có help/group/constraints; không suy provider từ key. Typed exhaustiveness và parity assertions thay duplicated switch. Không cần public plugin SDK hay microservice cho từng app. |
| A6 / P1 | `WorkflowNode` (`packages/workflow-contracts/src/index.ts:119`) chỉ id/type/position/config; immutable graph không pin implementation version của node. | Code adapter mới có thể đổi hành vi workflow đã publish. Đây là compatibility gap, chưa thấy execution bị phá. | Định nghĩa default v1, version config/output và migration opt-in trong draft; không rewrite published graph. Học [n8n node versioning](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/versioning.md), không copy full plugin framework. |
| A7 / P1 | `credential.service.ts:317` managed OAuth upsert bằng fixed provider label; callback chỉ enforce returned scopes cho Chat/Gmail/Calendar, không Drive/Sheets. | Khó giữ nhiều tài khoản Google trong cùng workspace; consent thiếu quyền có thể chỉ lộ khi run. | Credential identity/account label + target reconnect ID, validate/store granted scopes; test hai tài khoản không ghi đè. Giữ scope rộng đã được chủ dự án chọn, không đổi sang drive.file trong audit này. |
| A8 / P2 | `execution.service.ts:358–376` context `steps`, queue và visited per node; output là `Record`, không item stream/binary contract. | List trả 20 item không tự tạo 20 downstream actions như n8n. | Document semantics hiện có. Nếu cần bulk, lập spec riêng cho item identity, mapping, branch join, retry per item và binary lifecycle. [n8n tự xử lý arrays of items](https://docs.n8n.io/build/work-with-data/understand-n8ns-data-structure.md); không thể đạt bằng thêm dropdown. Loops/merge/sub-workflows hiện ngoài spec. |
| A9 / P1–P2 | Generic retry backoff có nhưng không mang `Retry-After`; Gmail checkpoint/lease/atomic dispatch đã có; Kuma dedup cần caller key. | 429 có thể retry quá sớm; thêm trigger bằng timer đơn giản dễ mất hoặc trùng sự kiện. | Reuse primitives, provider-specific cursor/identity, bounded backoff, lifecycle create/activate/deactivate/delete. Test restart, duplicate, out-of-order và expired cursor. Không giả định mọi webhook đều ký HMAC hay mọi app hỗ trợ push. |

Không cần copy toàn bộ n8n. Mẫu nên học là [resource/operation và conditional fields](https://docs.n8n.io/connect/create-nodes/build-your-node/tutorial-build-a-declarative-style-node.md), versioning, discovery có fallback và trigger lifecycle. Không sao chép option tắt TLS, arbitrary execution hoặc community-plugin loading vào MVP chỉ để “đủ tính năng”.

## 5. UI/UX khi số app tiếp tục tăng

Giữ node library App → Operation, categories, search, favorites/recent và sidebar vừa hoàn thành. Không tạo một nhóm “Developer workflows” thay cho từng app; đó là tên use case/template, không phải loại node runtime.

Đề xuất mở rộng component hiện có:

1. App detail nhóm **Triggers / Actions / Searches**; tên operation là động từ + resource. Drive/Sheets có thể hiện operation rõ hơn ở UI nhưng giữ node type và config cũ đọc được. Credential status và runtime availability là hai trạng thái riêng.
2. Inspector theo thứ tự **Connection → Resource → Operation fields → Options → Retry/error**. Resource/field phụ thuộc đổi thì clear lựa chọn không còn hợp lệ; hiển thị loading, empty, denied, expired và retry riêng.
3. Search trong options đang tải phải ghi đúng “lọc danh sách đã tải”; bổ sung remote search/cursor khi provider hỗ trợ. Giữ **By ID / Expression** cho quyền discovery bị hạn chế và giá trị từ upstream.
4. Schema-driven mapping cho Sheets headers, Notion properties, DB columns; operator control theo type. JSON/SQL nâng cao không là mặc định cho non-tech.
5. Action ghi/xóa có summary tác động rõ: resource đích, số item tối đa, scope cần thêm, retry outcome. Tránh popup xác nhận mỗi field; dùng live/debug boundary hiện có.
6. Output phân biệt `items/rows`, pagination, provider receipt, partial/truncated và delivery uncertain. Metadata discovery không được quảng cáo như action đã thực thi.
7. Provider bị chặn như Reddit có trạng thái và lý do; planned Meta/Instagram vẫn disabled. Chưa nên hiển thị điểm “production ready” chung cho cả app từ một test success.

## 6. Thứ tự thi công đề xuất

Đây là backlog từ audit tại `04d67b6`. NX-01 được triển khai trong đợt tiếp theo; trạng thái validation/release nằm trong report bên dưới. Các mã `NX-*` chỉ là checklist của báo cáo, không thay ID được phê duyệt trong `docs/19-agent-state.md`.

| Thứ tự | Checklist / phạm vi | Phụ thuộc và done criteria |
|---|---|---|
| 1 — NX-01 | [x] Implementation: retry explicit deny; SMTP accepted/partial/uncertain; bounded HTTP/Drive/Sheets; HTTP/Google/GitHub/notification write ambiguity. | Không đổi graph/schema; giữ output keys thành công và bổ sung SMTP submission metadata. Final verification/release: `.agent/reports/2026-11-02-connector-delivery-safety.md`. Không tuyên bố live qualification mới hoặc exactly-once. |
| 2 — NX-02 | [ ] Typed operation metadata/registries và field help; versioning tối thiểu; expose pagination thống nhất; account-aware OAuth. | Refactor theo app, không big-bang rewrite; mọi executable type có executor/schema/mock/redaction metadata, planned node không chạy. Default v1 đọc graph cũ. Không cần public SDK. |
| 3 — NX-03 | [ ] PostgreSQL/Supabase filters/columns/order; Sheets tab/header mapping; Notion cursor/content/properties; Trello get/find/update/move/archive. | NX-01; schema/discovery từ NX-02. Resource permission denial vẫn dùng ID; keyed writes có ceiling; old saved graphs không mất config. Mỗi app có workflow mẫu có ích từ đầu đến cuối. |
| 4 — NX-04 | [ ] Gmail get/cursor rồi label/draft/send/reply; Chat thread/edit; Telegram reply/edit; GitHub issue/PR reads và guarded updates; Sentry/Vercel detail/cursor. | NX-01–02. Xin scope mới chỉ khi cần; token phù hợp từng operation; message/write ambiguity hiển thị được. Không làm lại existing create/read/CRUD đã có. |
| 5 — NX-05 | [ ] RSS new-item; Kuma filters/dedup; sau đó Telegram/Trello/Sentry/Vercel triggers theo use case. | Reuse scheduler/registration primitives, không tái dùng giả định protocol. Baseline/cursor/lease/duplicate/out-of-order/restart/deactivation có test; test/prod ownership rõ. Google polling tiếp theo theo nhu cầu. |
| 6 — NX-06 | [ ] Gemini/OpenAI structured output + validated schema/usage/model capabilities; media/binary sau khi có lifecycle. | Có output contract và cost limits. Mock/provider compatibility tests; real AI test vẫn tùy credential và ngân sách được chủ dự án cho phép. |
| 7 — NX-07 | [ ] Quyết định riêng về item/batch engine, binary storage, DB change listeners, Meta/Instagram và Reddit migration. | Các ranh giới và đề xuất ban đầu được ghi trong [NX-07 decisions](38-nx07-design-decisions.md); implementation, môi trường và điều kiện provider chưa được xác nhận là hoàn tất. Không dùng như lý do chặn các bước 1–6. Không cam kết đầy đủ n8n endpoint parity. |

Theo yêu cầu hiện tại của chủ dự án, phần NX còn lại do coordinator trực tiếp thực hiện và tự audit code đã nhận từ sub-agent; không phân thêm sub-agent cho đợt này. Báo cáo từ agent chỉ là đầu mối để kiểm tra source và bằng chứng, không thay thế review. Chạy **một final quality gate** sau khi hoàn tất chỉnh sửa; chỉ rerun khi có failure hoặc sửa mới.

### Đối chiếu code với tiêu chí NX — snapshot 2026-11-03

Baseline `origin/main` `3c9ac35`, PR draft head `ff0740a` và snapshot code
`388ac7b`. Snapshot `388ac7b` đã qua full verify cô lập; CI Node 22 cũng đã
pass tại PR head `ff0740a`. Các ghi chú restore và trạng thái CI được thêm sau
lượt CI này. Mục này tóm tắt trạng thái hiện tại; các ghi chú
theo lượt bên dưới có thể nhắc đến kết quả hoặc việc chờ kiểm thử tại thời
điểm cũ. Không đánh dấu hoàn thành chỉ dựa trên sự tồn tại của code.

Lượt verify cho `388ac7b` bao gồm test của version guard, OpenAI refusal,
backup/restore giả lập, giới hạn AI và phân trang Trello được mô tả bên dưới.
Kết quả không thay thế diễn tập restore toàn bộ schema, thử provider thật hoặc CI.

Sau đó, trên PostgreSQL 16 Compose riêng với bảng và dữ liệu giả, script thực
tế đã backup/restore thành công một dòng; bảng được tạo sau backup vẫn tồn tại.
Restore archive bị cắt trả lỗi, giữ dữ liệu ngay trước lần thử và giữ release
lock. Đây không phải diễn tập toàn bộ schema Fluxora, queue, credential hay
khôi phục production; không suy ra rollback về release trước đã an toàn.

Một diễn tập PostgreSQL 16 riêng tiếp theo đã áp dụng 34 migration Fluxora,
backup bằng script thật và restore vào database mới trống. Prisma không phát
hiện khác biệt schema; user, workspace/member, workflow đã publish, graph,
execution, node output, continuation, ciphertext credential và migration
records giả đã khớp. Credential chỉ giải mã bằng khóa thử tương ứng; backup
database không chứa `APP_ENCRYPTION_KEY`. Một execution mock có continuation
token được phục hồi vào Redis giả ban đầu trống và chạy đúng một lần, không đọc
credential hay gọi provider; fixture không tạo/duyệt approval request. Chưa
kiểm chứng mọi record/job, old worker, in-place restore hoặc
cutover/rollback production; không tự động replay tác động provider.

Sau khi restore lại cùng snapshot giả, client Prisma, parser graph và vault
legacy được thử trên database đã migrate: đọc được workflow kiểu cũ và giải
mã credential giả, nhưng client cũ không expose continuation token mới và
parser cũ từ chối node type `.v2`. Với fixture giả định `nodeVersion: 2` trên
node type cũ, parser cũ bỏ qua version; NX hiện tại từ chối version 2 nên đây
chỉ là rủi ro tương thích tương lai. Source parser/vault đối chiếu khớp
`3c9ac35`; chưa thử toàn bộ API/worker hay image production và không suy ra
có thể downgrade an toàn.

| Mục | Code bản nháp đã có | Còn thiếu bằng chứng hoặc công việc |
|---|---|---|
| NX-02 | Registry executor/operation, fields dùng chung, một số cursor, OAuth theo connection; graph cũ không bắt buộc `nodeVersion`. Một số thay đổi hành vi dùng type `.v2` riêng. | `nodeVersion` mới chỉ nhận `1`; registry chưa chứng minh đủ schema/mock/redaction cho từng executable node. Cần review compatibility theo operation và final verify. |
| NX-03 | Chọn/filter dữ liệu quan hệ, Sheets mapping và `.v2`, Notion page/content/data-source, các thao tác card Trello; có mẫu workflow cho năm app. | Review tính đầy đủ của từng thao tác và workflow mẫu với hợp đồng provider; test giả không chứng minh kết nối thật. Không tuyên bố CRUD đầy đủ cho mọi app. |
| NX-04 | Gmail read/get/send/reply/draft/label; Chat và Telegram reply/edit; GitHub issue/PR read và update issue; Sentry/Vercel detail/cursor. | Kiểm tra quyền thực cấp, output và lỗi ghi không chắc chắn theo từng provider. Live qualification của operation mới chưa đầy đủ; không suy ra từ test mock. |
| NX-05 | RSS checkpoint/receipt và recovery; Kuma, Telegram, Trello, Vercel, Sentry webhook receiver và bảo vệ delivery ở mức khác nhau. PR có fence khi Cron và webhook cũ nhận execution. | Webhook provider có thể vẫn cần đăng ký thủ công; kiểm tra điều kiện provider và recovery thực tế. Các fence và retention đã qua verify cô lập/CI tại `20858a6`, chưa qua production. Không cam kết exactly-once. |
| NX-06 | Structured JSON schema/output cho Gemini/OpenAI, metadata usage và giới hạn theo request. | Chưa có kiểm soát tổng chi phí hoặc chứng minh model bất kỳ hỗ trợ schema; media/binary chưa triển khai. Xem [giới hạn chi phí](39-nx06-ai-cost-controls.md). |
| NX-07 | Tài liệu quyết định cho item/batch, binary, database change capture, Reddit và Meta. | Các hệ thống này chưa được coi là đã triển khai chỉ vì có thiết kế; phụ thuộc provider và phạm vi triển khai phải xét riêng. |
| Phát hành | GitHub Quality gate đã pass tại PR head `ff0740a`; full verify cô lập pass cho source `388ac7b`. Có diễn tập cô lập và guard từ chối fleet legacy. | First cutover và rollback về release trước chưa được chứng minh. PR #75 vẫn draft tại thời điểm ghi; ghi chú restore mới chưa lên PR. Xem [review phát hành](40-nx-release-review.md). |

### Tiến độ bản nháp sau audit — chưa phát hành

- **Steam snapshot cũ local:** tái sử dụng chính sách outbound và parser giới hạn của node Steam mới, kiểm tra API key bị Steam phản hồi lại trước khi lưu output; không thay cấu trúc output hoặc tự sửa graph cũ. Mỗi phản hồi snapshot giới hạn 5 MB và lỗi nếu vượt ngưỡng, không cắt dữ liệu âm thầm; kết nối bị chuyển hướng sang origin khác bị chặn. Điều này có thể khiến workflow với thư viện rất lớn hoặc phản hồi có chứa key chuyển sang nhánh lỗi, thay vì xử lý như trước. Achievement HTTP không thành công vẫn trả `null`. Metadata các trường output được đối chiếu với mock và fixture Steam giả; test mới chưa chạy và chưa có live qualification. Không có bằng chứng từ audit này rằng key đã bị lộ.
- **NX-02 notification receipt local:** metadata ghi các trường receipt chung cho Google Chat webhook, Discord, Telegram send/reply/edit, dựa trên `NormalizedDeliveryResult` và adapter; `messageId` có thể tùy provider. Fixture mock mới kiểm tra các trường được khai báo và không đọc credential, chưa chạy. Điều này không chứng minh delivery thật hay khả năng chống trùng.
- **NX-02 metadata dữ liệu/GitHub local:** khai báo các trường output đã đối chiếu trong adapter cho MongoDB find/insert, PostgreSQL/Supabase đọc cũ, RSS read và GitHub create/label/comment/merge/get; bổ sung các trường ổn định còn thiếu cho GitHub list. Metadata không khẳng định output có nội dung, quyền provider hoặc khả năng thực hiện live. Gợi ý expression hiện bao gồm trường có dấu `-`, phù hợp cú pháp đã hỗ trợ ở backend; các key chứa khoảng trắng hoặc ký tự khác vẫn chưa được gợi ý. Test mock có config hợp lệ và kiểm tra resolver đã thêm, chờ final verify.
- **NX-04 Calendar mock local:** output mock của get/update/delete trước đây chỉ có `id`, `operation`, `mocked` và thiếu các trường như `summary`, `updated` hoặc `deleted` mà live trả. Bản local bổ sung các trường tương ứng, giữ lại ba trường mock cũ; mock create bổ sung `recovered: false`. Metadata liệt kê trường chung và test dùng transport/credential giả so sánh hai chế độ, chưa chạy. Giá trị mock chỉ là ví dụ, không chứng minh provider đã thực hiện thay đổi. [n8n phân biệt dữ liệu mock/pin trong lúc phát triển với execution production](https://docs.n8n.io/build/work-with-data/pin-and-mock-data/); Fluxora chưa có tính năng pin tương đương.
- **NX-04 Google Chat OAuth mock local:** mock send/reply bổ sung `sentAt` giống receipt live và `simulated: true` để phân biệt với giao hàng thật; giá trị timestamp chỉ là thời điểm mô phỏng. Node legacy giữ message ID mock cũ. Metadata và test so sánh receipt với transport/credential giả đã bổ sung, chưa chạy; không chứng minh quyền Google hay gửi thật.
- **NX-03 Sheets mock local:** response `append` từ [Google Sheets API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append) đặt số hàng/cell trong `updates`, còn mock cũ chỉ có trường ở cấp ngoài. Mock local bổ sung `spreadsheetId`, `tableRange`, `updates` cho append và `updatedRange`, `updatedColumns` cho update; giữ các trường mock cũ để tránh làm hỏng workflow thử đã lưu. Inspector nhắc dùng `updates.updatedRows`/`updates.updatedCells` cho live append; các số mock chỉ là dữ liệu ví dụ. Test so sánh output với provider giả và E2E được thêm, chưa chạy; không thay đổi response live hoặc khẳng định dữ liệu đã ghi.
- **NX-05 Trello/Sentry delivery local:** bổ sung integration test PostgreSQL riêng cho việc nhận trùng đồng thời, phát hiện cùng key nhưng nội dung khác, khôi phục execution chưa bắt đầu, từ chối sau deactivate hoặc rotate secret và chấp nhận sự kiện mới sau rotation. CI bật test bằng `FLUXORA_PROVIDER_DELIVERY_INTEGRATION`; test chỉ dùng dữ liệu giả và queue giả, chưa chạy. Không thay cho kiểm thử chữ ký/provider thật, không chứng minh mọi race hoặc exactly-once.
- **NX-02/03 output và retry local:** metadata bổ sung các trường output đã xác định từ adapter Notion retrieve, Trello card, Sentry detail, Vercel public lookup, Reddit, HTTP và SMTP. Với SMTP, `delivered` chỉ là trường tương thích; `submissionStatus`/`deliveryConfirmed` phản ánh việc nhận gửi, không xác nhận vào inbox. Notion search nay hủy response body khi provider trả lỗi trước khi thông báo retry; nội dung lỗi không được đọc hoặc lưu. Test mock có config hợp lệ và test hủy stream được thêm, chưa chạy; không chứng minh các provider thật hay đầy đủ mọi trường output.
- **NX-02 trigger output local:** metadata chỉ khai báo wrapper `received` dùng chung cho 15 trigger; payload bên trong vẫn theo provider và không được xem là có schema đồng nhất. Bổ sung các trường chung của approval và Drive legacy; 92 executable type nay đều có ít nhất một trường output được mô tả, không đồng nghĩa schema đầy đủ, mock có cấu hình hợp lệ cho mọi node hay mọi nhánh được kiểm thử. Test mới kiểm tra wrapper với payload giả trong mock/live mà không đọc credential, chưa chạy.
- **NX-02 inventory 05/11:** registry hiện bao phủ 92 executable type nhưng 53 entry chưa khai báo trường output đã biết; mô tả field của editor cũng không phải runtime schema. Test registry xác nhận đường dispatch/mock không đọc credential và planned node không chạy, nhưng một số mock có thể trả lỗi input nên chưa chứng minh mọi operation chạy thành công với config hợp lệ. Redaction là cơ chế tập trung có ngoại lệ cursor/usage được đánh dấu, không phải metadata riêng đã được xác minh cho từng node. Cần đối chiếu hợp đồng thật theo từng operation; không điền danh sách trường phỏng đoán chỉ để đủ coverage.
- **NX-02 hướng dẫn phân trang trong kết quả local:** inspector dùng metadata có sẵn và `nodeType`/version, input, output của lần chạy đã ghi để hiển thị phần Pagination thu gọn khi operation thực sự hỗ trợ và có trường output tương ứng. Hướng dẫn không hiển thị lại giá trị cursor, không khẳng định thiếu cursor là đã đủ dữ liệu và không tự yêu cầu trang tiếp. Điều kiện operation lấy từ input lần chạy, không lấy từ draft có thể đã sửa. [n8n Gmail Get Many](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/message-operations/) có lựa chọn Return All/Limit; Fluxora hiện vẫn xử lý từng trang thủ công, không tuyên bố tự lấy tất cả như n8n. Test hành vi và UI đã bổ sung; cần kiểm thử lại trước release.
- **Lượt verify cô lập 05/11, commit `466f229`:** `npm run verify` exit 0: 957 test API, 71 test web và 211 Playwright, không bỏ qua bài; PostgreSQL 16.15 được migrate riêng 35 migration, Redis và cổng web/API tách biệt, scheduler tắt, không dùng credential thật. Node local là 23.7.0; CI Node 22 và kiểm thử provider thật vẫn là bằng chứng riêng. Trước đó lượt trên `ccd22d2` có 210/211 Playwright đạt: test theme editor chặn request có thể thuộc lần điều hướng trước. Commit `466f229` chờ editor đầu tiên tải xong trước khi chặn request của lần tải lại; test này chạy riêng đạt 5 lần và đạt tiếp trong lượt verify đầy đủ. Một lượt khởi chạy trung gian dùng tên database thiếu chữ `test` bị guard từ chối; không liên quan database người dùng. Log headless có cảnh báo WebGL và GSAP target rỗng. Không suy ra tất cả tiêu chí NX hay cutover/rollback production đã hoàn tất.
- **Lượt verify cô lập 05/11:** `npm run verify` trên commit `4198e17179e88ab94df5b1098120fa40d23c2da9` kết thúc exit 0: 957 test API, 70 test web và 211 Playwright; các nhóm integration được bật, API/web không bỏ qua bài nào. PostgreSQL 16.15 rỗng được migrate riêng, Redis và cổng web/API tách biệt, scheduler tắt, dữ liệu/credential giả; Node local là 23.7.0, còn CI dùng Node 22. Checkout thử chỉ thay đổi `apps/web/next-env.d.ts` do Next tạo lại. Log có cảnh báo headless WebGL và một số GSAP target rỗng. Kết quả không chứng minh provider thật, production cutover/rollback, hay toàn bộ tiêu chí NX còn mở; PR và CI trên commit phát hành vẫn cần thực hiện.
- **2026-11-05, Supabase insert local:** thêm operation ghi một dòng với danh sách cột/kiểu giá trị, gợi ý cột dùng chung discovery hiện có và fallback nhập tên. Giá trị số nhập dưới dạng chuỗi bị từ chối nếu chuyển sang JSON number làm đổi giá trị thập phân; số đã bị làm tròn từ bước trước không thể khôi phục, nên dùng text khi cần độ chính xác cao. Data API dùng identity của connection và RLS; `return=minimal` chỉ xác nhận provider chấp nhận, không trả dòng hoặc chứng minh giá trị sau trigger. Lỗi ghi không chắc chắn không tự retry. Chưa gọi provider thật, chưa chạy final verify hoặc release; PostgreSQL/Supabase read graph cũ không thay đổi. Tham khảo [n8n Supabase operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/) và [PostgREST return preferences](https://docs.postgrest.org/en/v14/references/api/preferences.html).
- **Supabase insert timeout local:** node ghi mới áp dụng `timeoutMs` từ 1.000 đến 120.000 ms, mặc định 10.000 ms; giá trị không hợp lệ hoặc expression không phân giải bị từ chối trước khi đọc credential. Timeout sau khi gửi có thể đã ghi dữ liệu, nên trả `DELIVERY_UNCERTAIN` và không tự retry. Test adapter mô phỏng abort và typecheck API/web đã pass; chưa thử provider thật. Node đọc cũ vẫn giữ timeout 10 giây và không thay đổi hành vi `timeoutMs` lịch sử.
- **Supabase insert expression local:** node ghi mới từ chối expression lồng trong giá trị khi dữ liệu upstream không tồn tại, thay vì âm thầm ghi chuỗi bị thiếu; helper `default` vẫn dùng được. Các node cũ giữ cách phân giải trước đây. Phần timeout hiển thị trong nhóm Advanced cùng cảnh báo kiểm tra bảng trước khi thử lại. Đã build lại contracts rồi typecheck API/web; lượt typecheck trước dùng bản contracts đã build cũ, nên không đủ chứng minh riêng thay đổi metadata mới. Chưa chạy final verify hoặc thử provider thật.
- **Supabase read precision local:** node đọc `.v2` mới bật mặc định tùy chọn từ chối output JSON có số bị đổi khi chuyển thành JavaScript number, kể cả số nằm lồng trong object hoặc array; trả `UNSAFE_PROVIDER_NUMBER` thay vì truyền giá trị đã làm tròn. Có thể dùng view database chuyển giá trị cần chính xác sang text. Graph `.v2` đã lưu mà không có tùy chọn này giữ cách đọc trước đây; người dùng có thể bật tùy chọn trong draft. Parser số dùng chung với structured AI output. Thay đổi tương thích và fixture bổ sung sau lượt verify `4198e17` chưa qua quality gate hoặc provider thật.
- **NX-02 offset metadata local:** hai node đọc PostgreSQL/Supabase `.v2` mô tả `offset`, trường output `page` và các tham số cần giữ ổn định. `page.completeness` vẫn là `unknown`; metadata không tự tạo `nextOffset` hay khẳng định còn trang tiếp. Node cũ không đổi. Test đối chiếu output mock đã pass; metadata chỉ mang tính mô tả, không quyết định quyền hay thực thi.
- **NX-02 versioning:** đã loại thử nghiệm reader/dispatch `nodeVersion: 2` khỏi bản local vì chưa thể ghi và chưa chứng minh cần thiết. Reader graph lưu sẵn, API, editor và executor từ chối numeric version không hỗ trợ; các type `.v2` hiện hành và graph cũ được giữ. Ánh xạ favorite/recent chỉ dùng trong thư viện node. Test thay đổi đang chờ final verify; graph numeric v2 nếu được ghi thẳng vào database ngoài API sẽ bị từ chối. Chi tiết tại [quyết định versioning](43-node-versioning-migration.md).
- **NX-02 registry local:** metadata của các node Notion, Trello và GitHub vốn được tách tạm khi sub-agent làm song song đã được gom vào registry chính. Mọi key khai báo trực tiếp chịu cùng kiểm tra kiểu `CheckedRegistry`; thay đổi này không tự bổ sung schema, mock hay redaction, và chưa qua final verify.
- **NX-06 output metadata local:** Gemini/OpenAI mô tả các trường chung `text`, `model`, `finishReason`; inspector giải thích `json` chỉ có khi bật structured output và usage phụ thuộc dữ liệu hợp lệ từ provider. Fixture mock cho cả hai chế độ và hai provider đã pass; mock không chứng minh model hoặc provider thật hỗ trợ schema.
- **Gemini model selection local:** node mới không tự chọn `gemini-2.5-flash`, vì [Google giới hạn quyền truy cập model 2.5 theo lịch sử sử dụng](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash). Người dùng chọn model qua connection hoặc nhập thủ công; graph đã lưu giữ nguyên. Lỗi 404 gợi ý kiểm tra model/quyền project và không tự retry. Google còn ghi [Gemini 2.0 Flash đã ngừng](https://ai.google.dev/gemini-api/docs/models/gemini-2.0-flash). Việc model hiện trong danh sách không bảo đảm quyền gọi, khả năng structured output hay chi phí; test mới chờ final verify, không gọi provider thật.
- **NX-06 mẫu workflow local:** thêm mẫu Gemini và OpenAI tạo structured summary rồi gửi Google Chat. Mẫu yêu cầu tự chọn model trước cả mock và live, cùng connection Chat trước live; prompt chỉ chứa dữ liệu mẫu và mô tả có nhắc chi phí. Dashboard hiển thị mô tả và connection cần cho mẫu được chọn trước khi tạo. Không tự tạo credential hay gửi thông báo; fixture mock và E2E chờ final verify và không chứng minh model thật hỗ trợ schema.
- **NX-06 precision local:** structured output số bị từ chối nếu mất chữ số khi chuyển JSON sang JavaScript number; workflow cũ có thể chuyển sang error branch trong trường hợp này. Dùng schema string nếu cần số hoặc ID chính xác cao. Test parser, hai adapter giả lập và Supabase insert đạt; tính năng `JSON.parse` source đã kiểm tra trên image Node 22 local. Không khẳng định số thập phân biểu diễn chính xác trong phép toán nhị phân. Xem [giới hạn NX-06](39-nx06-ai-cost-controls.md).
- **NX-05 Telegram activation local:** hộp thoại kích hoạt giải thích endpoint và webhook bot cần được cấu hình riêng, Fluxora chưa xác minh webhook từ xa, và đăng ký mới có thể thay webhook bot hiện tại. Hướng dẫn chi tiết trong panel endpoint vẫn giữ nguyên; không tự gọi `setWebhook`. So sánh [n8n Telegram Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/) và [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook). E2E đã cập nhật và chờ final verify; chưa thử provider thật.
- **NX-03 Supabase update/delete — đối chiếu 05/11:** [n8n](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/) có update/delete row; Fluxora chưa có. `Prefer: handling=strict, max-affected=1` là ứng viên cho giới hạn phía server, nhưng [PostgREST](https://docs.postgrest.org/en/v12/references/api/preferences.html) nói tính năng có ở 12.2 trong khi [Supabase JS](https://supabase.com/docs/reference/javascript/using-modifiers-maxaffected) ghi v13+. Không suy ra mọi project hỗ trợ; chỉ kiểm tra `Preference-Applied` sau request không ngăn được ghi quá mức trên server không thực thi preference. Trước khi mở action cần kiểm chứng trên instance cô lập có hỗ trợ và không hỗ trợ: điều kiện trùng/không khớp, rollback, RLS, trigger và lỗi không chắc chắn; phải có cơ chế fail-closed **trước khi gửi mutation**. Không dùng Management token để vượt RLS. Action update/delete chưa được thêm hoặc thử live.
- **Supabase mutation — thử nghiệm PostgREST cô lập:** với bảng giả và hai dòng cùng điều kiện, `PATCH` kèm `handling=strict,max-affected=1` trên PostgREST 11.2.2 trả 200 và sửa cả hai dòng; 12.2.3 và 13.0.7 trả 400 và không sửa dòng nào. Trên ba bản đó, `Accept: application/vnd.pgrst.object+json` cùng `return=representation` trả 406 và rollback khi hai dòng khớp. Một GET thử preference không hợp lệ trả 200 trên bản 11, 400 trên bản 12 và 13. Các kết quả này chỉ áp dụng cho fixture và cấu hình thử; chưa chứng minh hành vi DELETE, RLS, database trigger, proxy, quyền của provider thật hay trường hợp lỗi giữa request và response. Đặc biệt không dùng kết quả GET làm bảo đảm rằng mutation sau đó sẽ được proxy/server thực thi cùng preference. Chưa bật action update/delete.
- **Supabase mutation — hệ quả UX và quyền:** [PostgREST mô tả response singular](https://docs.postgrest.org/en/v11/references/api/resource_representation.html) trả 406 khi kết quả không phải đúng một dòng, bao gồm cả không có dòng. [Supabase](https://supabase.com/docs/reference/javascript/update) ghi rằng muốn trả dòng sau update phải yêu cầu `select`; điều này có thể cần quyền đọc ngoài quyền ghi. Filter theo tên cột không tự chứng minh cột có unique constraint, và đọc đếm trước khi ghi không thay thế giới hạn nguyên tử vì dữ liệu có thể đổi giữa hai request. Vì thế UX không nên hứa phân biệt không tìm thấy, không đủ quyền và nhiều dòng chỉ từ mã 406; lỗi sau khi gửi vẫn cần phân loại theo bằng chứng provider, không log response thô. Đây là phân tích thiết kế, chưa phải một action update/delete được hỗ trợ.

- NX-03 starter workflows, bản local sau `ff0740a`: mẫu PostgreSQL và Supabase
  không điền sẵn `example_table`, mẫu Trello không điền ID board giả có định
  dạng hợp lệ. Người dùng phải chọn bảng/board trước cả mock và live; live còn
  cần connection. Test cho cấu hình thiếu, mock với fixture và luồng tạo mẫu
  trên dashboard đã được cập nhật và pass trong lượt verify cô lập ngày
  2026-11-04. Chỉ mẫu tạo workflow mới thay đổi; graph đã lưu không bị sửa.
- NX-02, bổ sung sau CI `20858a6`: picker Gemini trước đây chỉ tải trang đầu dù provider có `nextPageToken`. Bản local thêm nút tải trang tiếp, kiểm tra token rỗng/không hợp lệ, tránh lặp token hoặc trả token chứa API key và vẫn cho nhập model thủ công. Test adapter và E2E được cập nhật nhưng chưa chạy; không coi CI trước đó là xác nhận cho thay đổi này. Theo [Google Models API](https://ai.google.dev/api/models), các trang phải giữ cùng tham số `pageSize`.
- NX-06 sau CI `20858a6`: model picker Gemini hiển thị input/output token limit và trạng thái thinking nếu Google trả metadata hợp lệ cho model đã chọn; không suy đoán khi thiếu. Đây chỉ là thông tin tại thời điểm discovery, không xác nhận structured output hoặc bảo đảm giới hạn chi phí; backend vẫn áp dụng giới hạn cấu hình riêng. Thêm test adapter/UI, chưa chạy. [Google Model resource](https://aistudio.google.com/api-reference/models#Resource:Model).
- Execution audit sau CI `20858a6`: `run()` trước đây chỉ đối chiếu mode của job với mode lưu trong database đối với approval continuation; job ban đầu sai mode có thể chạy adapter live cho một execution mock. Bản local bỏ qua job sai mode trước khi claim hoặc đọc credential và đưa mode đã lưu vào điều kiện claim nguyên tử. Bỏ qua không có nghĩa là tự khôi phục một execution chỉ có job sai: execution đó vẫn cần cơ chế recovery hoặc kiểm tra vận hành. Test giả lập đã bổ sung nhưng chưa chạy; guard này chưa xác nhận cutover hoặc an toàn khi chạy lẫn worker cũ/mới.
- HTTP adapter audit sau CI `20858a6`: API đích có thể lặp lại giá trị HTTP credential dưới tên field bất kỳ hoặc trong raw text, vượt qua redaction dựa vào tên key. Bản local từ chối output chứa nguyên văn credential được dùng, bao gồm Basic wire encoding và encoding thông thường của query key; request ghi báo `DELIVERY_UNCERTAIN` và không tự retry, vì provider có thể đã ghi. Kiểm tra này có thể từ chối trùng khớp vô tình với credential quá ngắn và không phát hiện bí mật bị cắt hoặc mã hóa tùy ý; credential nhập trực tiếp trong config không thuộc lớp bảo vệ này. Test giả lập đã bổ sung nhưng chưa chạy.
- Trello audit sau CI `20858a6`: `before` được chuyển thành thời điểm tạo theo giây, và thứ tự các card nhận về quyết định ranh giới trang. Bản local không đưa cursor khi response bị lặp, không theo thứ tự thời gian hoặc card sau ranh giới có cùng giây; response nằm ngoài `before` bị từ chối. Áp dụng cho node và picker, kèm cảnh báo kết quả có thể thay đổi. Kiểm tra thứ tự trong một trang không chứng minh provider đã trả đủ toàn bộ card hoặc sắp xếp ổn định; cần xác nhận với provider thật. Test giả lập đã bổ sung, chưa chạy. Theo [Trello paging](https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/#paging), `before` và `since` dựa trên thời gian.
- Notification audit sau CI `20858a6`: Google Chat webhook, Discord, Telegram và HTTP approval webhook dùng transport có thể theo redirect cùng origin. Với 307/308, POST có thể bị gửi lần hai trước khi adapter kiểm tra response; ngay cả 303 cũng tạo request phụ. Bản local dùng transport chặn redirect cho write; response 3xx không có Location được báo receipt không chắc chắn. Không tự retry và cần dùng URL đích cuối. Regression giả lập cho cả bốn adapter và các loại redirect đã thêm nhưng chưa chạy; không khẳng định provider thật không bao giờ redirect hoặc có thể bảo đảm exactly-once.
- Workflow mẫu Steam → Telegram và node Telegram message mới mặc định plain text thay cho Markdown, để tên người chơi hoặc giá trị động chứa ký tự định dạng không vô tình làm request bị từ chối. Người dùng vẫn chọn Markdown/HTML được; editor có nhắc về dữ liệu từ bước trước. Workflow đã lưu giữ nguyên `parseMode`. Test mẫu và round-trip đã bổ sung, chưa chạy; không khẳng định mọi lỗi Telegram 400 trước đây do định dạng.
- RSS recovery sau CI `20858a6`: lỗi `RSS_NOT_READY` do connection bị thiếu trước đây buộc người dùng reset và chấp nhận bỏ qua dữ liệu. Bản local cho phép kích hoạt lại khi đã xử lý connection, giữ snapshot và receipts; lần poll kế tiếp vẫn kiểm tra overlap và báo gap nếu cần. Chỉ lỗi này được tiếp tục mà không reset; lỗi snapshot gap, checkpoint hỏng và lỗi khác vẫn cần review. UI nêu cách xử lý connection. Test scheduler, lifecycle với database thử và UI đã bổ sung nhưng chưa chạy; không bảo đảm giữ được item đã biến mất khỏi feed trong thời gian gián đoạn.

- **Lượt verify local mới nhất:** ngày 2026-11-03, `npm run verify` đạt trên checkout cô lập với PostgreSQL, Redis và cổng thử riêng: 52 kiểm tra deployment, 893 test API, 60 test web, 201 Playwright, typecheck và build. Các nhóm integration được bật và API/web không bỏ qua bài nào. Source đã đối chiếu khớp snapshot kiểm thử, ngoại trừ `apps/web/next-env.d.ts` do Next tự sinh và không thuộc commit dự kiến; ghi chú tài liệu được cập nhật sau lượt chạy. Máy local dùng Node 23; GitHub CI dùng Node 22 đã pass cho commit `20858a6` (run `41625821559`). Không dùng kết quả này để khẳng định provider thật, first cutover hoặc rollback sang release cũ an toàn.

- **Lượt xác minh trước đó:** `npm run verify` hoàn tất thành công trên snapshot cô lập: 52 kiểm tra deployment, 883 test API, 60 test web và 195 Playwright; typecheck/build đạt, các nhóm test này không bỏ qua bài nào. Cấu hình provider và dữ liệu đều tổng hợp; PostgreSQL/Redis và cổng tách biệt. Đối chiếu sau chạy khớp source trừ `apps/web/next-env.d.ts` do Next.js tự sinh lại đường dẫn build E2E; file này không nằm trong thay đổi dự kiến. Ghi chú này được thêm sau lượt chạy. Kết quả không chứng minh provider thật, first cutover hay rollback sang release cũ, và không thay thế CI trên commit sẽ phát hành.
- CI commit `f8734e5` chưa đạt: Playwright 194/195, bài phân trang execution không thấy dữ liệu trang tiếp theo; log không đủ để xác định nguyên nhân và không có trace artifact. Test gốc chạy lại 10/10 trên máy local; bản test local hiện chờ animation mở panel kết thúc, chờ response đúng cursor rồi vẫn kiểm tra cả hai trang hiển thị, chạy lại 3/3. Đây không chứng minh nguyên nhân trên CI là animation và không phải một lượt full verify mới; CI cần chạy lại trên commit có sửa test.

- Review rollback: nhãn `nx-v1` không chứng minh image cũ hiểu mọi node và cấu hình đã lưu. Ví dụ, draft local thêm Sheets v2 và Notion data-source mà commit NX trước chưa có, dù Dockerfile dùng cùng nhãn. Script rollback local giờ từ chối image API, worker hoặc web khác image hiện tại trước khi dừng dịch vụ; chỉ cho tự động khởi động lại đúng image đang dùng. Đây là giới hạn tạm thời để tránh downgrade không an toàn, **chưa phải giải pháp rollback về release trước**. Cần hợp đồng tương thích graph, config, database và queue được chứng minh riêng; nhánh legacy không đổi. Bộ rollback cô lập đạt 14/14, gồm Docker giả lập với image web riêng, trường hợp thiếu web và kiểm tra migration trên PostgreSQL thử. Kết quả không chứng minh rollback thật trên VPS.
- Docker rehearsal cho đúng rào chắn trên: Compose thử dùng mạng nội bộ, không publish cổng, PostgreSQL và bảng tổng hợp; các container API/worker/web chỉ chạy tiến trình Node chờ, không chạy ứng dụng. Hai API image có cùng nhãn NX nhưng ID khác vì image đích chỉ thêm một label thử. Lệnh rollback thật từ chối trước khi dừng; bốn container vẫn chạy và không ghi nhận sự kiện stop, lock được giải phóng. Docker thật được dùng cho inspect/Compose/SQL, riêng `pull` được thay bằng no-op vì image có sẵn. Stack thử sau đó được dừng, không xóa volume/container. Bài này chỉ xác nhận một đường từ chối, không kiểm thử rollback thành công, trạng thái queue/graph thực hay first cutover.
- Docker rehearsal khởi động lại cùng image: stack nội bộ riêng không publish cổng dùng API/worker NX đã build cục bộ, PostgreSQL/Redis tổng hợp và web HTTP giả; scheduler và provider bị tắt. Script rollback local dừng API rồi worker, khởi động lại cùng image, kiểm tra liveness/readiness/web qua `docker exec` và giải phóng lock; một dấu kiểm tổng hợp trong PostgreSQL và một key Redis vẫn đọc được sau đó. `pull` được thay bằng no-op và Compose chạy lại migration của image thử. Stack được dừng sau thử nghiệm. Kết quả chỉ chứng minh đường khởi động lại cùng image khi không có job đang chạy, không chứng minh downgrade, job/provider đang xử lý, sự cố giữa các pha hoặc triển khai/khôi phục production.
- Cùng stack Docker cô lập: worker được dừng trước, một execution `MOCK` với manual trigger được ghi vào PostgreSQL và enqueue hai lần cùng job ID; Redis chỉ giữ một job chờ. Sau khi script khởi động lại cùng image, execution có một node `SUCCEEDED` và BullMQ ghi một attempt, lock được giải phóng. Đây là một job tổng hợp đã xếp hàng, không phải kiểm tra xử lý đang chạy, provider thật, mọi dạng job hoặc exactly-once; worker đã chủ động dừng trước khi script bắt đầu.

- Lượt verify cô lập trên source trước sửa timeout dashboard: 881 test API và 60 test web đạt; typecheck, build và kiểm tra deployment cũng đạt. Playwright đạt 194/195, một bài dừng ở bước đăng ký vì thời gian chờ URL 5 giây; trace cho thấy đăng ký HTTP 201 mất khoảng 2,7 giây và dashboard tải thêm khoảng 3 giây. Sau khi tăng thời gian chờ riêng của helper và test, chạy lại file dashboard đạt 21/21. Đây là hai lượt khác nhau, không phải một lượt `npm run verify` hoàn chỉnh thành công; source sau sửa vẫn cần verify cuối. Hai test deployment được bỏ qua theo điều kiện môi trường.

Các thay đổi sau thuộc bản nháp NX; kết quả quality gate mới nhất và giới hạn của bằng chứng được ghi ở cuối mục này:

- NX-03 audit: PostgreSQL/Supabase selection v2 từ chối số nguyên ngoài phạm vi an toàn của JavaScript trước khi đọc credential hoặc gọi provider. Dùng giá trị text cho ID lớn để tránh làm tròn; backend không thể khôi phục chữ số đã mất ở bước upstream. Các test mock/live giả lập đã bổ sung và chờ lượt verify cuối. Hành vi node v1 không đổi.

- NX-02: metadata mô tả, node version, một số cursor và Google OAuth nhiều tài khoản. Metadata chưa thay thế authorization hay retry policy.
- NX-02 audit bổ sung: probe dispatcher ở chế độ mock đã đi qua toàn bộ loại node đăng ký với cấu hình rỗng, chấp nhận lỗi validation có cấu trúc, xác nhận node planned bị từ chối và không đọc vault. Kiểm tra này phát hiện handler thiếu, nhưng không chứng minh mock với cấu hình hợp lệ hoặc output schema của từng node. Registry hiện chưa cung cấp đầy đủ metadata executor/schema/mock/redaction như tiêu chí NX-02; mục này vẫn chưa hoàn tất.
- NX-02 shared fields: kiểu field và registry mô tả UI cho 73 node dùng declarative fields đã chuyển vào contracts; editor đọc từ cùng nguồn. Một số node core và Telegram vẫn dùng form chuyên biệt. Đây không phải validation schema hay chính sách bảo mật, vốn tiếp tục thuộc backend. Kiểm tra so sánh trước/sau cho thấy 85 định nghĩa catalog không thay đổi; final verification và release chưa thực hiện.
- NX-02 executor registry: toàn bộ 65 node action thực thi đã dùng registry có kiểu ở server và gọi lại adapter cũ, giữ variant v1/v2 và tham số workspace/node/execution. Các adapter Steam, Google, HTTP, thông báo và GitHub cũ đã tách khỏi runner; core trigger/condition/approval vẫn ở runner. So sánh 195 trường hợp mock giữa dispatcher trước và sau cho kết quả giống nhau; 226 kiểm tra có mục tiêu đạt. Validation/redaction registry đầy đủ, final verify và kiểm thử provider thật chưa hoàn tất. Không sử dụng metadata UI để quyết định quyền hoặc retry.
- NX-02 registry audit: TypeScript hiện yêu cầu mọi action được khai báo thực thi phải có executor và từ chối action không thuộc danh sách đó khi biên dịch. Kiểm tra này chỉ đảm bảo có đăng ký, không chứng minh adapter hoạt động đúng hoặc đủ validation, mock và redaction.
- NX-02 dispatch live giả lập: GitHub, Notion, Trello, Google Drive và Gemini đã chạy qua registry với workspace/credential giả; test chặn mạng bằng transport giả và xác nhận header, output cùng phân trang Drive v1/v2. Đây là kiểm tra routing có chọn mẫu, không phải thử provider thật hay bảo đảm mọi operation đã live-qualified.
- NX-02 pagination metadata: Drive v2 mô tả cursor theo operation (`list`/`search`; không áp dụng cho upload/download), còn Drive v1 giữ nguyên. Gmail và Calendar bổ sung các cấu hình cần giữ khi lấy trang sau. Kiểm tra dispatcher giả lập đạt; metadata chỉ mô tả, chưa tự chạy phân trang hoặc thay validation của adapter.
- NX-02 pagination context: bản local bổ sung danh sách connection/resource/filter cần giữ khi tiếp tục Notion, Sentry và Vercel; đây là metadata mô tả, không ràng buộc cursor với config bằng mật mã và không tự xử lý phân trang. Editor xóa giá trị lọc Notion phụ thuộc khi đổi connection. Test metadata và editor đã bổ sung, chờ final verify.
- NX-02 picker context: bản local chặn request sử dụng cursor hoặc GitHub owner cũ trong lúc picker chuyển workspace, connection, tài nguyên cha hoặc loại property. Sau khi state được đặt lại, picker tải trang đầu của ngữ cảnh mới; response cũ vẫn bị bỏ qua. Kiểm tra E2E giả lập Trello và Notion được bổ sung, chờ final verify; thay đổi này không ràng buộc cursor nhập thủ công của node với connection.
- NX-02 Trello/GitHub pagination: metadata bản local ghi rõ connection, resource và bộ lọc cần giữ giữa các trang. Editor xóa mốc `before` của Trello khi đổi trạng thái lọc hoặc giới hạn, giống cách đã xóa khi đổi board/connection; các graph cũ không bị sửa cho tới khi người dùng chỉnh draft. Mốc nhập qua expression hoặc API vẫn do người dùng quản lý và thứ tự dữ liệu provider có thể thay đổi. Test metadata và E2E mới chờ final verify.
- NX-02 pagination audit: Google Calendar báo lỗi phản hồi không hợp lệ khi provider trả cursor sai định dạng thay vì âm thầm báo hết trang. Cursor hợp lệ và phản hồi không có cursor giữ hành vi cũ; 12 kiểm tra Calendar giả lập đạt.
- NX-02 pagination/filter audit: bản local từ chối một số expression không phân giải được ở tài nguyên, filter và cursor của Calendar, Notion, Gmail, Drive, Sentry và Vercel trước khi đọc credential; tránh tự trở lại trang đầu hoặc chọn bộ lọc mặc định. Các node v1 có phiên bản v2 riêng tiếp tục giữ hành vi cũ; field tùy chọn bị xóa hoặc để trống vẫn cho phép bắt đầu trang đầu. 39 kiểm tra Calendar, Notion và tương thích phân trang giả lập cùng API typecheck đã đạt; không chứng minh mọi node đều có validation thống nhất và chưa phải final verify.
- Release script review: `deploy.sh` nay truyền thống nhất image và commit đã chọn cho mọi lệnh Compose, kể cả khi caller không export tên image. Đây là sửa lỗi cấu hình sẵn có; không giải quyết rủi ro mixed-fleet hay cho phép deploy production khi guard chưa đạt.
- NX-03: selector cột/điều kiện PostgreSQL và Supabase, mapping Google Sheets, Notion và Trello operations. Bản nháp giữ hành vi node quan hệ cũ và yêu cầu nâng cấp draft có chủ đích sang loại `.v2` riêng; tương thích này chưa được kiểm chứng.
- NX-03 Sheets input: bản nháp thêm node `action.google-sheets.v2` để chọn `USER_ENTERED` hoặc `RAW` khi append/update. Node cũ luôn giữ `USER_ENTERED`, kể cả khi có field lạ cùng tên; nâng cấp chỉ sửa draft và mặc định giữ cách cũ. `RAW` giữ chuỗi như `=1+2` là văn bản, còn `USER_ENTERED` cho Sheets diễn giải thành công thức hoặc kiểu dữ liệu. Xem [Google ValueInputOption](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption). [n8n cũng cung cấp tùy chọn Cell Format](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/sheet-operations/); đối chiếu UX, không khẳng định hai node có cùng toàn bộ hành vi. Chưa thử provider thật; cần final verify và release an toàn.
- NX-03 examples: the local draft adds selectable starter workflows for PostgreSQL, Supabase, Google Sheets, Notion and Trello. These create drafts with manual triggers and example resource values; users must choose their own connection and resources before live execution. The starter flows and dashboard selector have not yet passed the final gate.
- NX-03 end-to-end examples: bản local bổ sung mẫu đọc dữ liệu rồi gửi tóm tắt tới Google Chat cho từng app trên. Mẫu mặc định dùng manual trigger và không điền connection; người dùng cần chọn tài nguyên và webhook trước khi chạy live. Test kết nối đầu ra mock với nội dung thông báo đã được bổ sung, chờ final verify; không gửi thông báo thật.
- NX-03 Notion write: bản local bổ sung tạo trang con trong một trang được chia sẻ, với bộ chọn trang cha và các trường tiêu đề/nội dung văn bản; một node riêng cập nhật tiêu đề của trang được chọn. Không tạo database page hoặc sửa property tùy ý. Cập nhật tiêu đề có thể ghi đè thay đổi đồng thời và không sửa nội dung trang. Request giữ Notion API version `2022-06-28`; timeout, redirect, 408, 429, 5xx và phản hồi thành công không hợp lệ được báo kết quả không chắc chắn, không tự retry. Các kiểm thử giả lập adapter, dispatcher, credential và picker đã được bổ sung nhưng chưa chạy final verify; chưa kiểm thử Notion thật. Tham khảo [Notion create page](https://developers.notion.com/reference/post-page), [update page](https://developers.notion.com/reference/patch-page) và [n8n Notion operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.notion/).
- NX-03 Notion property picker: bản local lấy tối đa 100 tên/ID property của trang đã chọn qua credential thuộc workspace, không trả giá trị property. Đổi trang hoặc connection xóa lựa chọn phụ thuộc; thiếu quyền hoặc metadata có thể nhập ID/expression thủ công. Các ID không dùng được hoặc vượt giới hạn được cảnh báo. Chưa kiểm thử Notion thật và đang chờ final verify; đây chưa phải database/data-source query hay mapping ghi property.
- NX-03 Notion data source: bản nháp bổ sung operation đọc một trang entries và picker cho data source được chia sẻ. Operation mới gọi API `2025-09-03`, không thay đổi version `2022-06-28` của node cũ; page size/cursor có giới hạn, kết quả có `queryCompleteness` khi provider báo giới hạn. Có tùy chọn lọc theo thời gian chỉnh sửa, một property dạng status/select/checkbox và sắp xếp theo thời gian tạo/chỉnh sửa. Status/select có picker theo property, với fallback nhập đúng tên thủ công; không hỗ trợ mọi loại property hoặc nhiều property. Timestamp trùng và dữ liệu thay đổi vẫn có thể làm dịch trang. Chưa kiểm thử provider thật hay final verify. [Notion upgrade guide](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03), [query data source](https://developers.notion.com/reference/query-a-data-source), [n8n Notion operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.notion/).
- NX-04: GitHub issue/PR reads, Gmail get-message/cursor, Sentry và Vercel detail/cursor; GitHub merge có tùy chọn ràng buộc head SHA theo [GitHub API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request), còn graph cũ không cung cấp SHA giữ hành vi cũ. Telegram reply/edit có bản nháp dùng connection của workspace và không tự retry khi kết quả POST không chắc chắn. [n8n](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/) có edit-message; reply dùng `sendMessage` với `reply_parameters` theo [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage). Google Chat có bản nháp send trả thread, reply và edit; edit yêu cầu người dùng chọn riêng quyền `chat.messages` theo [Google Chat API](https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces.messages/patch). Gmail send/reply/create/replace-draft/change-label đã được kết nối trong bản nháp local, yêu cầu scope tương ứng và test mode giả lập; adapter không tự retry kết quả ghi không chắc chắn. Chưa chạy verify, chưa có live qualification và chưa được phát hành; các rủi ro rollout/recovery và Google verification vẫn là điều kiện trước release.
- NX-04 GitHub update: bản local thêm thao tác cập nhật một trường title, body hoặc state của issue, có picker repository/issue, kiểm tra resource không phải PR trước PATCH và không tự retry nếu kết quả ghi không chắc chắn. [n8n hỗ trợ Issue Edit](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.github/); [GitHub nói conditional request cho PATCH không được hỗ trợ trừ khi endpoint quy định khác](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests). Vì vậy bước đọc trước không khóa issue, thay đổi đồng thời vẫn có thể bị ghi đè và UI nêu rõ giới hạn. Test giả lập adapter, dispatcher, credential readiness và tương tác picker đã đạt trong lượt verify cô lập bên dưới; chưa thử provider thật hoặc phát hành.
- NX-03/04 write-guard audit: expression không phân giải được trong GitHub expected head SHA, merge method hoặc issue idempotency key bị từ chối thay vì âm thầm bỏ bảo vệ hay chọn mặc định, kể cả khi expression nằm trong chuỗi có tiền tố. Graph cũ không cấu hình các trường này giữ hành vi cũ. Trello update và pagination cũng từ chối field hiện diện nhưng không phân giải được để tránh ghi thiếu hoặc đọc lại trang đầu. Các kiểm tra dùng connector giả, không gọi GitHub/Trello thật; chưa qua final verify.
- NX-04 calendar write audit: create/update/delete không tự theo redirect; update/delete trả lỗi không tự retry khi network, redirect, 408, 429 hoặc 5xx làm kết quả không chắc chắn. Create vẫn dùng ID xác định và đối chiếu conflict cho retry thông thường, nhưng redirect cần người dùng kiểm tra. 24 kiểm tra Calendar và outbound giả lập đạt; chưa có live qualification mới.
- NX-04 calendar availability audit: FreeBusy chỉ được đọc từ ID của lịch được chọn; không suy ra lịch duy nhất được trả về là lịch cần kiểm tra. Nếu chọn `primary`, Fluxora gọi CalendarList trước để lấy ID thực và xác nhận cờ primary, rồi dùng ID đó cho FreeBusy. Điều này thêm một request đọc, cần quyền CalendarList hiện có trong connection; lỗi hoặc kết quả không khớp báo không xác định thay vì khẳng định lịch rảnh. [CalendarList.get](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/get), [FreeBusy.query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query). 14 kiểm tra Calendar giả lập đạt; thay đổi chưa được thử với Google thật.
- NX-04 observability output audit: Sentry/Vercel resource pickers, danh sách và chi tiết liên quan từ chối phản hồi khi các trường provider sẽ được hiển thị hoặc lưu chứa nguyên token hiện tại. Kiểm tra xảy ra trước khi cắt ngắn nội dung, áp dụng cả node v1/v2 và có thể báo lỗi cho một kết quả vốn hợp lệ nếu nội dung trùng token. Các kiểm tra dùng token và provider giả; đây không phải cơ chế phát hiện mọi bí mật, và chưa qua final verify hoặc thử provider thật.
- NX-06: structured output Gemini/OpenAI có kiểm tra schema và giới hạn output theo từng request. Giới hạn token không phải giới hạn chi tiêu; chưa chạy provider thật trong đợt này.
- NX-06 safety audit: Gemini/OpenAI từ chối `maxOutputTokens` hoặc `timeoutMs` nếu expression của trường đó không phân giải được, thay vì âm thầm thay bằng mặc định có thể cao hơn giới hạn người dùng muốn. Workflow cũ không có trường vẫn dùng mặc định cũ. Phản hồi lỗi provider được đóng mà không lưu nội dung; lượt generation tính phí vẫn không tự retry. Test giả lập đã bổ sung, chưa chạy final verify; đây không phải giới hạn chi tiêu hay aggregate quota.
- NX-06 prompt ceiling: bản local bổ sung `AI_MAX_PROMPT_CHARACTERS` cho cả Gemini/OpenAI, mặc định giữ mức cũ 100.000 UTF-16 code units; giới hạn thấp hơn do operator chọn được kiểm tra trước khi đọc credential hoặc gọi provider. Cấu hình sai bị từ chối, không cắt ngắn prompt. Cần cấu hình nhất quán ở mọi API/worker và drain worker cũ khi giảm giới hạn. Test đã bổ sung, chưa chạy; đây là giới hạn kích thước, không phải giới hạn token hoặc chi phí.
- NX-06 audit: phản hồi Gemini/OpenAI có chứa nguyên API key đang dùng sẽ bị từ chối bằng lỗi không ghi key; kiểm tra cả text, giá trị JSON đã giải mã, tên trường và metadata trả về. Đây là bảo vệ cho key của connection hiện tại, không phải cơ chế phát hiện mọi bí mật có thể xuất hiện trong nội dung AI. Các test dùng phản hồi và key giả; chưa có live qualification hay final verification sau thay đổi.
- NX-05: Kuma v2, RSS new-item, Telegram update và Vercel deployment có bản nháp local cho nhận sự kiện và phục hồi lượt chưa bắt đầu. Telegram dùng webhook do chủ bot tự cấu hình, xác thực secret header, lọc chat/event và dedup theo update ID; Fluxora không tự thay thế webhook trên bot. Vercel nhận secret ký từ account webhook, xác thực raw body và lọc event/project/account; Fluxora không tạo hoặc xác nhận webhook từ xa. Vercel account webhook tùy thuộc gói dịch vụ và event bị bỏ lỡ trong lúc chưa cấu hình có thể hết hạn sau thời gian retry của provider. Dedup phụ thuộc thời gian giữ execution và khóa mã hóa, không đảm bảo exactly-once; execution Vercel được giữ tối thiểu 24 giờ kể từ khi hoàn tất để bảo vệ cửa sổ retry, nên tổng lịch sử có thể vượt giới hạn số lượng trong thời gian này. Các migration mới đã áp dụng trên database local để mở preview; chưa kiểm thử hoặc deploy production. Trello và Sentry issue-created triggers đã được nối trong bản nháp local và chưa verify hay live-qualify. Cần hoàn thiện lifecycle, xác minh tương thích mixed fleet và khôi phục sau sự cố trước khi phát hành.
- NX-05 editor audit: draft có nhiều trigger vẫn lưu được, nhưng backend chỉ cho publish graph có đúng một trigger. Cảnh báo trong editor hiện giải thích rõ giới hạn đó thay vì chỉ báo có nhiều trigger; đã có trong lượt verify cô lập bên dưới.
- NX-05 activation UX: hộp thoại bản local mô tả cả trigger polling, cùng thông báo rằng execution đã nhận có thể tiếp tục sau khi tắt. Với Gmail, thông tin nêu khả năng xử lý thư khi bật lại; với RSS, cảnh báo item có thể biến mất khỏi feed trong lúc tắt. Các thông báo chỉ mô tả hành vi hiện tại, không hứa khôi phục mọi event; kiểm tra E2E đang chờ final verify.
- NX-05 RSS audit: ghi lỗi của lượt poll giờ khóa workflow trước checkpoint và kiểm tra lại trạng thái active, version và lease. Lỗi từ lượt đọc hoàn tất sau khi workflow đã tắt sẽ không chuyển checkpoint sang ERROR; test PostgreSQL cô lập mô phỏng thứ tự này đã đạt trong lượt verify bên dưới. Nếu lỗi ghi nhận trước khi thao tác tắt giành được khóa thì lỗi vẫn được lưu theo thứ tự giao dịch.
- NX-05 Gmail checkpoint audit: bản local cũng khóa workflow trước khi ghi checkpoint thành công hoặc lỗi, rồi kiểm tra workflow còn active, đúng published version và lease còn hiệu lực. Phản hồi Gmail rỗng hoặc lỗi đến sau khi tắt workflow sẽ không làm tiến history hoặc chuyển checkpoint sang ERROR; nếu giao dịch ghi thắng khóa trước thao tác tắt, kết quả được giữ theo thứ tự giao dịch. Test giả lập và PostgreSQL cô lập đã được bổ sung, chưa chạy final verify; không khẳng định exactly-once hoặc thử Gmail thật.
- NX-05 Gmail reset/queue audit: sau khi job được xếp hàng, bản local chỉ ghi `dispatchedAt` cho receipt còn chờ và còn trỏ tới chính execution đó. Một acknowledgement đến muộn không ghi đè thời điểm hoặc quyết định reset đã được chủ workspace xác nhận; nếu receipt không còn khớp, poll dừng và không tiến checkpoint. Job đã xếp hàng có thể đã bắt đầu, không thể thu hồi chỉ bằng thay đổi receipt. Test giả lập và test PostgreSQL gọi luồng reset thật được bổ sung, chờ final verify; chưa thử Gmail thật.
- NX-05 Gmail reservation audit: trước đây poll có thể tạo receipt sau khi owner đã tắt workflow và reset, nếu reset xảy ra giữa lần kiểm tra lease và thao tác tạo receipt. Bản local khóa workflow rồi checkpoint, kiểm tra lại trạng thái/phiên bản/lease và chỉ sau đó tạo hoặc đọc receipt; đổi lại mỗi message cần thêm một transaction. Test PostgreSQL cô lập mô phỏng đúng khoảng dừng này đã được bổ sung nhưng chưa chạy final verify. Không khẳng định đã quan sát lỗi trên production hoặc ngăn được job đã bắt đầu trước reset.
- Execution approval audit: bản local lấy khóa execution, node và approval theo thứ tự, sau đó mới đọc đồng hồ PostgreSQL để kiểm tra hạn. Khi người dùng gửi quyết định sau hạn, kể cả hết hạn trong lúc chờ khóa, approval được đánh dấu hết hạn và execution/node thất bại cùng transaction; không tiếp tục nhánh approved. Bản local cũng bổ sung quét approval hết hạn theo lô mỗi phút vào maintenance hiện có, khóa theo cùng thứ tự và chỉ cập nhật khi execution đang chờ, có đúng một node chờ và một approval pending, đồng thời output node tham chiếu đúng approval đó. Dữ liệu cũ thiếu liên kết hoặc mơ hồ được giữ nguyên để tránh đoán sai; các bản ghi chờ hợp lệ đã hết hạn sẽ được xử lý sau khi triển khai. Test giả và PostgreSQL cô lập cho quét, cạnh tranh và rollback đã được bổ sung, **chưa chạy final verify**; chưa khẳng định hoạt động production.
- Approval decision local: thao tác duyệt/từ chối cũng chọn và kiểm tra lại node theo `approvalRequestId`, thay vì lấy node đang chờ đầu tiên. Từ chối dữ liệu cũ bị thiếu hoặc sai liên kết, không tự tiếp tục nhầm nhánh; đây là thay đổi tương thích đối với bản ghi không nhất quán, cần được xử lý riêng. Fixture PostgreSQL bao gồm cả trường hợp liên kết thay đổi giữa lần đọc đầu và khi lấy khóa node; các fixture mới chờ final verify.
- Tự review test approval: kiểm tra cạnh tranh được siết lại để quan sát transaction đã qua khóa execution/node và đến câu lệnh khóa approval trước deadline; bản cũ chỉ quan sát bắt đầu transaction nên chưa chứng minh được thứ tự đó. Kiểm tra này chưa chạy sau khi sửa và không chứng minh hết mọi đường cạnh tranh hoặc xử lý approval hết hạn tự động.
- NX-05 webhook audit: Trello, Sentry và Vercel từ chối event phù hợp nếu signing secret hiện tại xuất hiện trong identifier sẽ được lưu; không thay đổi identifier dùng định tuyến và dedup. Nội dung tự do của Trello/Sentry vẫn được xử lý riêng. 15 kiểm tra protocol/ingress giả lập đạt, chưa chứng minh provider thật hoặc bảo vệ mọi bí mật khác.
- NX-07: các quyết định và điều kiện provider nằm ở [NX-07 decisions](38-nx07-design-decisions.md); không đồng nghĩa các tính năng đó đã được triển khai.

Vercel event choice is deliberately explicit: its [account webhook setup](https://vercel.com/docs/webhooks) lists created, succeeded, error and canceled deployments, while its [integration guidance](https://vercel.com/docs/integrations/create-integration/submit-integration) places `deployment.ready` under Checks. The [event reference](https://vercel.com/docs/webhooks/webhooks-api) also describes `deployment.succeeded` as dependent on registered checks. A new node therefore defaults to `deployment.created`; event availability and exact account-webhook behavior remain to be confirmed on a real eligible account. Existing draft `deployment.ready` values remain supported rather than silently remapped.

The draft execution engine now assigns an internal random token when a worker claims a running phase. Initialization, node updates, lease renewal, approval transition, skipped-node updates and completion require that phase's token. A new additive migration has been applied only to the local preview database; the corresponding synthetic concurrency check is pending the final verification. Older workers do not honor this token, so the change does **not** make mixed-version deployment or rollback safe on its own.

On 2026-11-03 a read-only GitHub Actions check showed the most recent successful production deploy workflow targeted `3c9ac35560126d6f7240f428efe0734275896218`; it does not establish the images currently running on the server. A separate non-interactive SSH attempt was rejected, so the production container inventory and in-flight processes could not be inspected. The current deploy starts replacement API/worker services without establishing a fleet-wide drain, and the rollback script does not check whether an older worker understands new graphs or approval continuations. Do not claim that either direction is safe solely because CI passed.

A subsequent read-only SSH inspection using the existing deployment key confirmed that the production web, API and worker containers were running image `3c9ac35560126d6f7240f428efe0734275896218`. The database had four active workflows and no execution in a non-terminal status at that instant. This is a point-in-time observation, not a drain: a webhook, schedule or OAuth refresh may start immediately afterward. The production deploy script currently replaces services without fencing incoming requests and draining the old processes, while rollback can reintroduce a worker that does not understand new continuation and graph semantics. Keep this release out of automatic deployment until a concrete cutover and rollback procedure has been validated against the actual host; do not infer safety from an idle snapshot.

The next local draft adds an NX migration/image-label check to rollback, a lock shared by new deploy/rollback scripts, and a forward-deploy check that refuses an uncertified target or a still-active incompatible Compose API/worker before migration. These measures fail closed for the covered boundaries and prevent overlap between scripts that both honor the lock. A migration record marked rolled back remains a blocking signal because that marker does not prove the schema or saved data was restored. The focused deployment suite passed 28 checks locally, including the migration query against a disposable PostgreSQL database and simulated mixed fleets. The previous full `verify` and PR CI passed before this additional draft, not after it. The new changes do not fence the old API, drain old workers, protect against old scripts that ignore the lock, or validate future schema changes. They have not been deployed to production or included in the existing green PR commit.

A read-only check against the actual VPS found both Compose API/worker containers running without the NX image label. The new forward gate would therefore refuse the present fleet; the check did not run the deployment script or alter either container. Stopping containers solely to satisfy this gate is not a safe cutover procedure.

The local gate now also examines stopped, created and dead Compose API/worker
containers and refuses a fleet missing either service. Stopping the legacy containers therefore
cannot by itself satisfy the gate. This intentionally also blocks fresh or
containerless recovery installations until a separate, verified bootstrap or
cutover procedure exists. It is not a durable attestation: manually deleting
containers, changing labels, or bypassing the script is outside the gate's
proof. The amended synthetic tests passed in the isolated verification recorded below.

The local gate now inspects the immutable image ID backing each active
container, rather than looking up a mutable tag recorded in its configuration.
The post-replacement worker check also compares the actual running image ID to
the requested image. Synthetic tests cover a tag repointed to a compatible
image while an incompatible image is still running, and a replacement worker
whose tag matches but image ID does not. These checks do not fence the legacy
API or establish an atomic release.

The previous Actions workflow copied deployment files over the active `infra`
directory before acquiring its lock or checking compatibility. The current
local draft uploads a separate bundle per Actions run and executes the staged
script. It takes the release lock and checks target/fleet compatibility before
promoting tooling; prior script versions are backed up, and the guarded lock,
rollback and deploy scripts are installed first using per-file atomic renames.
If promotion is interrupted, the lock is retained for inspection. Compose is
not promoted: if the bundle differs from the active Compose contract, release
fails closed. It is checked again before promotion and before migration.
Synthetic tests exercise rejected fleets, differing Compose, incomplete
bundles, promotion failure, retained locks and successful tooling backup.
An additional synthetic shell test delivers SIGTERM during a tooling rename;
it observes the saved prior rollback script, retained lock and no migration.
The broader deployment contract suite also passed locally. Neither test
simulates a host crash, a lost filesystem write, or an old script already
executing concurrently.

The script set is not promoted as a single atomic transaction. In particular,
an already-running legacy manual deploy or rollback may ignore the new lock;
this remains an operator coordination requirement. Staged bundles and tooling
backups consume disk and have no automatic cleanup policy. These changes do
not fence the legacy API, implement the first cutover, or establish real VPS
behavior; final verification and an isolated interruption rehearsal remain
outstanding. No production files were changed in this audit.

The next draft additionally stops a compatible worker with an indefinite Docker timeout before migration or rollback, checks that the previously running containers exited successfully without OOM, retains the release lock on an uncertain stop or partially started migration, and checks that the requested replacement worker is running before releasing that lock. Repeated SIGTERM/SIGINT signals are handled idempotently by the new worker. Focused synthetic deployment tests passed for an unclean worker exit and the lock; the worker drain was also exercised using isolated Redis and repeated OS signals. These checks do not prove provider side effects, and the changes have not yet completed final verification. None of them makes the first legacy API shutdown graceful. If the SSH client or Actions times out while Docker is still stopping a worker, inspect the daemon and retained lock rather than retrying blindly.

The release draft also checks for already-started, queued legacy executions without a continuation token after worker drain. Legacy approval dispatch had no durable token and could leave such a run without a matching job; an old initial job can also be confused with the intended continuation. The scripts stop and retain the release lock for operator investigation instead of guessing or automatically restarting workers. This is a conservative detector, not recovery and not a substitute for fencing the legacy API; its new integration check has not yet run through the final gate. When preparation fails before migration for unrelated dependency or backup reasons, only the exact workers that were running before the attempt are restarted.

The local NX release draft additionally refuses migration or NX rollback when an execution is still marked RUNNING after the known API and workers have drained, and retains the lock if the database query fails or returns an unexpected result. This detects stale or still-active execution records; it cannot establish that unknown workers, detached requests, or provider-side effects are absent. The associated synthetic and disposable-database tests are pending final verification. The legacy rollback path is unchanged; first cutover is still blocked.

An isolated mixed-version rehearsal on 2026-11-03 used an API/worker built from the actual `3c9ac35` source, the new worker, a disposable PostgreSQL database with NX migrations, a separate Redis instance and a synthetic approval graph. A stale `initialOnly` job was delivered to an execution that already had an approval continuation token. The new worker ignored the stale job and subsequently executed the matching continuation; the old worker accepted the stale job, marked the execution `SUCCEEDED` and left its successor `SKIPPED`. This proves an incorrect outcome is possible when old workers consume new jobs; it is not a live-provider or production test.

For the first cutover, the unresolved engineering requirement is to prevent new API requests, webhooks and scheduler jobs while in-flight old API work is drained; then drain every old worker before the new API can enqueue NX jobs. The procedure must preserve queued work, treat in-flight OAuth refresh or provider writes as potentially uncertain, account for missed schedules during maintenance, and verify that a compatible recovery image is available before lifting the fence. A point-in-time count of running executions and a Docker health check cannot establish these properties. Test interruptions at each cutover phase in an isolated stack before using the procedure on the VPS. The existing `3c9ac35` API does not install graceful shutdown hooks, so simply issuing `docker compose up` or stopping its container with a longer timeout is not a proven drain.

Source review of `3c9ac35` shows the legacy worker does call BullMQ `worker.close()` on SIGTERM and has `maxStalledCount: 0`; the handlers are not guarded against receiving both SIGINT and SIGTERM, and this source observation is not an end-to-end drain rehearsal. Legacy OAuth refresh applies a 20-second fetch abort signal, then writes the refreshed credential through Prisma. That network timeout does not by itself prove that every request, scheduler scan or database update has finished. The API and worker therefore cannot be treated as equally proven drainable solely from their process exit status.

Further source review found that legacy Google account sign-in token exchange
and token-info verification, and Steam OpenID verification, do not specify an
application timeout. Thus the separate 20-second Google credential-refresh
timeout cannot justify a fixed 20-second wait before stopping the legacy API.
The local NX draft adds 20-second abort signals to these three provider requests.
Seven isolated Google, Steam and GitHub authentication tests passed, including
synthetic provider timeouts and the absence of a new session after a failed
Google sign-in. They do not use real providers, measure the full 20-second
timeout, or replace final verification. These changes do not modify the
already-running legacy image, guarantee an overall request or database deadline,
or establish a safe first cutover.

The next local draft additionally requires an explicit `io.fluxora.graceful-drain=v1` image label, then stops and inspects the compatible API before stopping workers and starting a migration. On a pre-migration dependency or backup failure, it attempts to restart only the API/worker containers observed running before the stop; uncertain stops or migrations retain the release lock. NX rollback applies the same compatibility and API-before-worker drain. Before releasing the lock both paths inspect the running API as well as the worker and compare immutable image IDs with the target; a health response alone is not enough. The label is an operator/build assertion rather than proof against manually built images, unmanaged processes, forced stops, host failure or detached asynchronous work. The added script tests have not yet run, no interruption rehearsal has exercised this revision, and the current unlabeled production image remains blocked. Legacy rollback remains a separate existing path and is not established as a graceful drain.

The owner accepted a short maintenance window with API/workflow interruption and
reconciliation of schedules during the window. This approval removes the need
to preserve continuous availability; it is not evidence that old in-flight work
has finished. An isolated, network-free experiment extracted the actual
`3c9ac35` cron `tick` and `createScheduledExecution` methods, held a previously
selected workflow across deactivation, and observed a new synthetic execution
and queue dispatch afterward. The legacy scheduled-execution method does not
recheck `isActive`. Thus merely deactivating workflows and seeing a zero count
once is not a scheduler fence. The existing Gmail activation path preserves an
existing history checkpoint but resets its lease after obtaining a baseline;
do not reactivate while a previous poll may still be running. No production
data or provider was touched by this experiment.

Read-only production inspection on 2026-11-03 found a separate staging worker
as well as the production worker. Both use the same textual `db` and `redis`
service aliases and default queue name, so comparing URLs alone would falsely
suggest shared infrastructure. Docker inspection shows their networks are
disjoint: each worker shares a network with its own Compose database and Redis,
not with the other stack's containers. This is evidence of the observed Docker
topology, not a proof against external forwarding, an unmanaged consumer or a
future configuration change. Both workers must be accounted for in any
rehearsal; no staging or production container was stopped or changed.

The local NX draft now tracks timer-started cron, Gmail, RSS, approval,
webhook-recovery and execution-maintenance jobs; their destroy hooks stop the
timers and wait for accepted scans. A synthetic blocked cron scan and 36
focused scheduler/recovery tests passed. A later local draft enables Nest
shutdown hooks, rejects new HTTP requests during shutdown, ends execution SSE
streams and closes Prisma/Redis dependencies after module destruction and HTTP
server disposal. A synthetic test then demonstrated that an ordinary handler
could continue after its client disconnected while those dependencies closed.
The local draft now tracks ordinary controller observables until completion and
rejects a handler reaching the interceptor after shutdown begins. Synthetic
Nest tests exercise a connected request, a disconnected asynchronous handler,
a delayed guard, blocked timer work and an open SSE stream. An idle HTTP
keep-alive connection in the test delayed server closure for about four
seconds; terminating the SSE stream does not imply immediate process exit.
The interceptor deliberately excludes SSE, and RxJS teardown, detached work,
OAuth refresh and external side effects are not exhaustively proven. A stuck
handler can prolong shutdown. This is a building block only; it does not change
the legacy API already running on production or authorize the first cutover.
This code was included in the isolated verification recorded below.

An additional review found that the request interceptor starts after guards,
so a disconnected client could leave an authentication database lookup in
flight while shutdown closed its dependencies. The local draft now tracks
lookups inside the authentication guard and waits for them before closing;
new guard calls are rejected once its shutdown begins. The added regression test passed in the isolated verification recorded below. This addresses that guard only, not arbitrary
middleware or detached work, and does not make the legacy production API
drainable.

During the same review, the approval transition was found to overwrite the
already-redacted node output with the raw result when storing the approval ID
and notification status. The local draft applies the existing redaction to
both writes and extends the approval regression test with a synthetic Telegram
URL. This prevents that specific overwrite from undoing the existing URL
redaction; it does not detect all secrets in arbitrary message text. The test
and final verification are pending.

Gmail polling now marks new and recovered initial jobs as initial-only; recovery of a legacy approval continuation remains separate. A filtered-out message is recorded only while the workflow version and polling lease still match, so a provider read finishing after deactivation or reset cannot commit a stale filter decision. These changes are pending the final integration suite and do not assert exactly-once external delivery.

Cron now also has bounded recovery for a scheduled execution committed before a Redis dispatch failure. It only requeues live executions still queued and never started, after a two-minute delay, with an initial-only job. A targeted synthetic queue-outage test passed. A separate isolated PostgreSQL/Redis test also ran recovery twice, verified only the eligible execution entered the queue once, and processed it through the real worker; previously started and recent executions were left queued. Recovery can run a previously accepted schedule late; it does not recreate occurrences missed while the scheduler itself was offline or replay an execution that may have contacted a provider. Final verification and production qualification remain pending.

The cron scheduler's in-memory dispatch markers now expire after their relevant
time window instead of growing for the life of the process. The persistent
execution idempotency key remains the cross-process and restart boundary. Six
focused scheduler tests and API typechecking passed; this does not establish
catch-up for schedules missed while the scheduler was offline.

The cron scan now contains database read failures, skips an invalid published
graph instead of stopping the other schedules, and avoids logging raw provider
or database exceptions. Eight focused synthetic scheduler tests passed. An
occurrence missed while the database is unavailable is still not guaranteed
to run after recovery; this change does not implement schedule catch-up.

Lease maintenance now changes the execution and its running/pending nodes in
one database transaction. An injected failure after the node update rolled the
transaction back on a disposable PostgreSQL database, and a subsequent attempt
completed it once. The scan also isolates individual failures and advances a
bounded cursor to avoid starving later executions. Eight focused maintenance
and approval tests passed; this does not cancel already-sent provider requests
or retroactively repair executions left inconsistent by older releases.

Trello board trigger is connected in the local draft with manual provider registration, HEAD validation, signed raw-body ingress, board/event filtering, bounded output and queued-delivery recovery. Trello requires the app secret (not just the connector's API key/token), a successful HEAD handshake, and an HMAC over the raw body plus the exact registered callback URL. See [Trello's webhook protocol](https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/). The owner supplies the callback and Fluxora stores it encrypted with the app secret; the request Host header is not used to reconstruct it. The code and synthetic tests have not run through final verification, nor has the provider integration been qualified live. Remote webhook creation, reconciliation and deletion remain manual.

For Sentry, the local draft connects a custom-integration `issue.created` webhook to the editor, signed ingress and queue recovery, and offers organization-scoped installation discovery with manual fallback. Sentry's [custom-integration guide](https://sentry-blog.sentry.dev/customize-your-sentry-workflow-a-sample-internal-integration/) distinguishes the resource header and body action, whereas [project service hooks](https://docs.sentry.io/api/projects/register-a-new-service-hook/) use a separate registration model. The [Sentry sender source](https://github.com/getsentry/sentry/blob/master/src/sentry/sentry_apps/api/serializers/app_platform_event.py) signs the body while generating the request ID and timestamp in headers. Those unsigned headers must not be assumed to provide authenticated replay protection. A created issue has a stable signed installation/issue identity; repeatable issue transitions need a separately proven delivery identity before they can be safely deduplicated without losing legitimate transitions. Tests remain unrun and actual Sentry installation/permissions are unqualified. Registration and remote status are manual; other issue transitions remain unsupported pending a trustworthy deduplication design.

Lượt kiểm tra trước trên PostgreSQL và Redis thử riêng, cổng web/API riêng và cấu hình provider giả đã chạy `npm run verify` thành công, gồm 191 bài Playwright. Sáu bài tích hợp bị bỏ qua mặc định cho approval, RSS, Kuma, Telegram và Vercel đã chạy riêng trên cùng loại môi trường cô lập và đều đạt. Khi kiểm tra, editor có lỗi trùng React key làm lặp các trường Sheets; lỗi đã được sửa và kiểm tra lại. Một số fixture OAuth và selector E2E cũng được cập nhật theo hành vi hiện tại.

Lượt `npm run verify` mới hơn ngày 2026-11-03 chạy trong checkout cô lập với PostgreSQL, Redis và cổng riêng, cấu hình provider giả và các bộ tích hợp được bật: **851 test API, 59 test web và 192 Playwright đều đạt**, không có test API/web bị bỏ qua. Bản source được đối chiếu theo SHA-256 với các file code đã kiểm thử; thay đổi tài liệu sau đó không thuộc lượt chạy này. Có cảnh báo GSAP không tìm thấy một số target và WebGL headless không hỗ trợ `KHR_parallel_shader_compile`. Kiểm thử này không chứng minh webhook từ xa đã cấu hình, provider thật hoạt động, cutover/mixed-version an toàn hay toàn bộ tiêu chí NX đã hoàn tất.

Ngày 2026-11-03, lượt verify cô lập sau các thay đổi Notion, Sheets, AI và release mới nhất đi qua test API, typecheck và build nhưng **chưa đạt**: Playwright đạt 193/195; hai bài hết thời gian dưới tải cao. Trace cho thấy API tạo workflow đã trả 201 nhưng chunk editor mất hơn 34 giây để tải; bài còn lại đã thực hiện các assertion chính trước khi chạm giới hạn tổng. Sau khi điều chỉnh thời gian chờ riêng hai bài, chạy nhóm accessibility và relational đạt 15/15. Các nhóm test fixture Reddit/RSS, Notion và AI đạt 5/5; nhóm auth/account đạt 5/5 sau khi sửa fixture và chờ focus trả về. Đây là các lượt xác nhận có chọn lọc, **không phải một lượt full verify thành công** cho source mới nhất. Cần chạy lại full verify trước khi cập nhật PR; những kết quả này không chứng minh first cutover an toàn.

Lượt kiểm tra sau các thay đổi Notion, AI, Gmail và script deploy: `npm run verify` trên PostgreSQL/Redis và cổng cô lập đã đạt 48 test deployment, 862 test API, 59 test web, typecheck và build. Playwright đạt 191/192; một bài thất bại vì selector test khớp nhãn cổng node. Sau khi chỉ sửa selector, chạy lại riêng bài đó đã đạt. Do lượt `verify` đầy đủ vẫn có exit code lỗi, không ghi nó là một lượt full verify thành công; các kết quả đến từ lượt đầy đủ và một lượt chạy lại có chọn lọc. Không có provider thật hay production trong lượt thử. Test script deploy giả lập không thay thế diễn tập cutover hoặc chứng minh old fleet đã được drain.

Sau khi sửa selector test, lượt `npm run verify` đầy đủ tiếp theo trong cùng loại môi trường cô lập đã kết thúc thành công: 48 test deploy/rollback, 862 test API, 59 test web và 192 Playwright, cùng typecheck và build; các bộ tích hợp được bật, không có test API/web bị bỏ qua. Source code đã so khớp với checkout thử; đoạn cập nhật tài liệu này được thêm sau lượt chạy. Đây là bằng chứng kiểm thử local, không phải diễn tập first cutover, xác nhận provider thật hoặc chứng nhận production.

Diễn tập Docker cục bộ sau lượt trên phát hiện lệnh deploy khởi động migration hai lần: một lần trực tiếp và một lần qua dependency của Compose. Bản sửa để Compose chạy migration một lần trước API/worker; health check và thứ tự dependency đã được thử bằng container giả, với registry pull thay bằng image local. Bộ test deployment có mục tiêu đạt 36 bài, một bài tích hợp bỏ qua mặc định; cần chạy lại final verify trên source sau sửa. Fleet legacy trong diễn tập vẫn bị chặn trước migration; chưa có bằng chứng chuyển bản production lần đầu an toàn.

Trong một lượt Docker giả khác, migration được cấu hình chủ đích thoát lỗi 42: Compose không khởi động API/worker thay thế, script trả lỗi và giữ khóa release. Đây là thử lỗi bắt đầu migration, không mô phỏng migration đã ghi một phần hay xác nhận khôi phục production.

Không đánh dấu hoàn tất release NX hoặc suy ra production readiness chỉ từ kiểm thử local. PR, CI, cutover, rollback và kiểm thử provider thật chỉ được ghi nhận khi thực sự hoàn thành.

Lượt verify cô lập mới nhất ngày 2026-11-03 đạt 52 kiểm tra deployment, 904 test API, 61 test web, typecheck, build và 201 Playwright; các nhóm tích hợp database được bật và API/web không bỏ qua test. Lượt trước đó thất bại do hai fixture trùng số phiên bản workflow; fixture đã được sửa trước lượt chạy đầy đủ thành công. Source đã được đối chiếu với checkout thử; cập nhật tài liệu này được thêm sau lượt chạy. Kết quả không chứng minh cutover đầu tiên, rollback về bản cũ hay hoạt động với provider thật; CI của PR hiện tại vẫn chỉ áp dụng cho commit cũ hơn.

Diễn tập cron giả lập sau lượt verify: execution được tạo bằng service cũ tương ứng source `3c9ac35`; Redis thử chứa đồng thời job kiểu cũ và job phục hồi NX. Worker NX với concurrency 2 hoàn tất cả hai job nhưng mỗi node của workflow giả chỉ chạy một lần. Thử nghiệm không ngắt API cũ, không gọi provider và không chứng minh việc khôi phục mọi lịch bị bỏ lỡ, cutover hoặc rollback production.

NX-02 runtime guard bản local: `executeNode` và lookup adapter từ chối `nodeVersion` không được hỗ trợ trước khi đọc credential hoặc gọi provider; node lịch sử không có version và node khai báo `1` tiếp tục dùng cùng adapter. Regression test kiểm tra cả action và trigger đã được bổ sung, đang chờ quality gate sau thay đổi. Đây là bảo vệ v1, chưa phải cơ chế hỗ trợ nhiều phiên bản cho cùng một node type; các type `.v2` hiện hữu vẫn giữ contract riêng. [n8n versioning](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/versioning/) giữ phiên bản node đã lưu trong workflow và chọn bản mới cho node được tạo sau; Fluxora chưa có đầy đủ cơ chế tương đương.

NX-02/03 Trello Find Cards bản local: Trello mô tả `cards_page` từ 0 đến tối đa 100 trong [OpenAPI chính thức](https://dac-static.atlassian.com/cloud/trello/swagger.v3.json?_v=1.1274.0). Node mới chọn chế độ phân trang; node cũ không có `searchPagination` tiếp tục một request và output trang đầu như trước, kể cả khi có trường `page` vốn bị bỏ qua. Người dùng có thể đổi draft sang chế độ trang. Trang đầy sẽ đọc thêm tối đa một trang để xác định `hasMore`; trang 100 đầy trả `hasMore: null`, `continuationUnknown: true` và không hứa còn trang kế tiếp. Cùng connection/board/query/limit phải được giữ giữa các trang; kết quả vẫn có thể thay đổi khi dữ liệu Trello thay đổi. Chưa thử provider thật; test API/UI mới và toàn bộ thay đổi sau lượt verify trước đang chờ quality gate cuối.

Trong chế độ chọn trang, nếu Trello trả trùng card trong một trang, node từ chối kết quả; nếu hai trang quan sát được chồng lặp, node không cấp `nextPage` và báo `continuationUnknown` kèm cảnh báo. Đây chỉ phát hiện trùng lặp trong hai phản hồi quan sát được, không chứng minh kết quả không bị thiếu hoặc thay đổi giữa các lần chạy. Test hồi quy đã thêm, chờ final verify.

Review kiến trúc NX-05 chọn bắt đầu từ checkpoint, lease và recovery của Gmail
hiện có, thay vì mặc định đưa thêm hệ thống guard/epoch toàn cục. Bản nháp cũ
có migration ảnh hưởng đến các provider khác và chưa đủ điều kiện release.
RSS polling chỉ thấy snapshot tại thời điểm kiểm tra; item xuất hiện rồi biến
mất giữa hai lần poll có thể bị bỏ lỡ. Recovery cho execution còn `QUEUED`
không bảo đảm tác động bên ngoài xảy ra đúng một lần. Các giới hạn này phải
được thể hiện trong sản phẩm và kiểm thử, không dùng làm lời hứa exactly-once.
Riêng Kuma có bản local thêm node filter theo monitor/status, với node cũ
giữ hành vi nhận mọi alert. Node mới lưu dấu đối chiếu HMAC và execution cùng
giao dịch; key chỉ có hiệu lực cho phiên bản đã publish khi execution còn được
giữ trong lịch sử. Xoay APP_ENCRYPTION_KEY hoặc xóa execution kết thúc khoảng
chống trùng đó. Không có delivery key đáng tin cậy thì thông báo lặp vẫn có
thể tạo nhiều lượt chạy. Bộ phục hồi chỉ thử xếp lại execution đã nhận nhưng
chưa từng bắt đầu; không tự replay tác động bên ngoài đã mơ hồ. Những thay
đổi này chưa được verify hoặc triển khai production.

## 7. Evidence đã có và giới hạn cần giữ

[Ledger connector](35-connector-coverage-and-discovery.md) và [agent state](19-agent-state.md) là nguồn kết quả lịch sử. Audit này không thay các bằng chứng đó bằng “pass” mới:

- Drive/Sheets, Gmail test message/poll, SMTP, Gemini, MongoDB, Notion có các lần thử local được ghi nhận; không phải mọi operation/model/production đều đạt.
- Calendar CRUD/free-busy có bằng chứng local; populated 2030 page là direct adapter diagnostic. Empty list ở khoảng năm 2100 còn nguyên nhân chưa rõ, không mở lại CRUD như tính năng thiếu.
- Trello production create, Sentry/Vercel bounded reads, RSS/Atom và Supabase production one-row read đã được ghi nhận sau các lần lỗi trước; không đề xuất lặp lại chỉ để có report mới.
- PostgreSQL verified TLS và discovery/read local đã có; production và sustained behavior chưa qualified. Kuma real local instance đã có; production delivery/replay chưa qualified.
- OpenAI real-provider test đã được hoãn; Reddit bị provider access gate. Google review vẫn pending ở lần kiểm tra gần nhất, không phải approved.
- Steam/notification adapters có runtime và test sources; không suy ra mọi auth mode hoặc edge case đều live-qualified từ một workflow demo.

Các regression cần có khi triển khai: validation/unknown fields; auth workspace/provider boundaries; dependency-reset của picker; cursor/empty/denied; 429/backoff; ambiguous writes; version compatibility; trigger dedup/recovery. Reuse test suites đang có; không nhân E2E cho mọi tổ hợp nếu contract test chứng minh được. Full `npm run verify` chỉ chạy cuối đợt sửa runtime. Goal audit này chỉ dùng final documentation/state/codegraph/diff checks.

## 8. Checklist hoàn tất audit

- [x] Inventory 25 app / 46 loại node, 44 executable; tách core và planned.
- [x] Ba nhóm audit chạy song song; coordinator kiểm tra các phát hiện trọng yếu và bundle manifest.
- [x] Mỗi app có current scope, nguồn n8n, useful gaps, constraints và độ phức tạp.
- [x] Phân biệt picker/action, native/community/generic, source/test/live, schema/node/workflow version.
- [x] Checklist theo dependencies; không đề xuất lại tính năng đã hoàn thành.
- [x] Không thao tác credential, provider thật hoặc deployment trong audit.
- [x] Final documentation checks ghi trong `.agent/reports/2026-11-02-node-expansion-audit.md`.

## Steam: cập nhật phạm vi (2026-11-04)

Node hiện tại vẫn là `action.steam.account-snapshot`: profile, game hiện tại,
game sở hữu/gần đây và achievement theo App ID. Source xử lý game ID dạng
chuỗi hoặc số; output `currentGame.appId` giữ kiểu số khi ID biểu diễn an toàn.
Việc sửa này có fixture, chưa khẳng định đã thử live từng trường hợp. Node
hiện gom nhiều API và có thể coi library không truy cập được như danh sách rỗng;
achievement trả `null` khi HTTP không thành công. Không dùng các giá trị đó để
khẳng định tài khoản không có game hay không có achievement.

Khả năng mở rộng nên ưu tiên các operation đọc độc lập, dùng node Steam và
credential hiện có khi cần: profile/library/recent/achievement, sau đó friend
list công khai, thống kê và news theo App ID. Valve ghi nhận [library tùy quyền
hiển thị](https://partner.steamgames.com/doc/webapi/IPlayerService), [friend
list riêng tư trả 401](https://partner.steamgames.com/doc/webapi/ISteamUser?language=english),
[achievement, schema và current players](https://partner.steamgames.com/doc/webapi/ISteamUserStats?l=english),
và [news theo game](https://partner.steamgames.com/doc/webapi/ISteamNews?language=english).
`GetSingleGamePlaytime` có điều kiện API key liên kết app; nhiều thao tác ghi
chỉ dành publisher, không mặc định hỗ trợ cho người chơi. OpenID chỉ xác nhận
SteamID, không cấp quyền đọc thư viện riêng tư hay thay Web API key.
Trigger phát hiện thay đổi cần polling/checkpoint, không được mô tả là webhook
Steam hay bảo đảm bắt mọi thay đổi. Giá/wishlist cần nghiên cứu nguồn và chính
sách riêng trước khi cam kết. Không có provider thật được gọi trong audit này.

### Steam community-node parity — implementation scope

The source of [n8n-nodes-steam](https://github.com/dhayab/n8n-nodes-steam) registers seven operations: profile, friends, badges, vanity resolution, owned games, recent games and achievements; its README lists only five. Fluxora exposes these through the new `action.steam` operation selector and retains `action.steam.account-snapshot` unchanged for existing graphs. The new node returns `{ operation, result }`, not the n8n output contract. It uses the selected workspace Steam API key; the node Steam ID overrides the connection ID when provided. The achievement game picker uses visible owned games (up to 100 shown) with a manual App ID/expression fallback; this does not establish ownership or bypass privacy. Operation inputs and errors are validated server-side; responses over 1 MB fail instead of being silently truncated. No automatic live-provider qualification, Steam webhook, publisher-only write, private data access or whole-Steam-API coverage is implied by parity with these seven operations.
