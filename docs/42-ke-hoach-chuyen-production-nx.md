# Đề xuất chuyển Fluxora production sang NX — để review

**Trạng thái: bản thiết kế vận hành, chưa thể thực thi.** Chủ dự án đã chấp
nhận gián đoạn ngắn và rủi ro một yêu cầu đang xử lý bị ngắt; credential Google
có thể cần kết nối lại, lịch hoặc webhook trong khoảng bảo trì có thể bị bỏ
lỡ. Yêu cầu hiện tại là chuẩn bị quy trình để review, chưa thực hiện chuyển.

## Trạng thái được kiểm tra

- Khoảng 08:00 ngày 04/11/2026, API, worker và web production chạy image tag
  `3c9ac35560126d6f7240f428efe0734275896218`; PostgreSQL và Redis đang chạy.
  Đây là số liệu chỉ đọc và phải kiểm tra lại ngay trước giờ bảo trì.
- Tại thời điểm đó có 4 workflow đang bật; database báo 0 execution `QUEUED`,
  `RUNNING`, `WAITING_APPROVAL` và 0 approval `PENDING`. Chưa suy ra Redis
  rỗng, API không còn request hay sẽ không có sự kiện mới.
- Ổ chứa `/opt/workflow-automation` còn 2.821.576 KiB, khoảng 2,69 GiB. Script
  deploy yêu cầu tối thiểu 2 GiB **trước khi pull image**; dung lượng còn lại
  chưa chứng minh đủ cho image, migration và dữ liệu phát sinh.
- [PR #75](https://github.com/phuuthanh-dev/fluxora/pull/75) đang draft;
  Quality Gate pass tại head `ec17f67ae9fbe5c7fcf5e63e4f8669ff1f698857`.
  Ba commit tài liệu về diễn tập nằm local sau head này, chưa nằm trong PR.
- Workflow deploy kích hoạt sau Quality Gate thành công của `main`. Kiểm tra
  GitHub Environment `production` ngày 04/11 không thấy protection rule; không
  được mặc định coi GitHub sẽ dừng chờ người duyệt sau merge. Image deploy
  phải được đối chiếu theo SHA **thực tế trên main**, không giả định SHA của
  PR head cũng là SHA merge commit.
- [Kết quả diễn tập](41-nx-first-cutover-plan.md) cho thấy API cũ có thể tiếp
  tục OAuth sau khi client ngắt; SIGTERM có thể kết thúc API trong lúc OAuth
  giả đang chờ. Một số request đăng nhập cũ không có timeout tường minh.

## Hai điểm chưa thể thực hiện theo script hiện tại

1. `infra/scripts/deploy.sh` kiểm tra `require_compatible_fleet` trước khi
   dừng dịch vụ hoặc migrate. API và worker production cũ không có chứng nhận
   NX; **kể cả dừng container cũ, guard vẫn từ chối**. Script cũng yêu cầu API
   thoát sạch theo hợp đồng mà image cũ không có. Không xóa container, gắn lại
   nhãn hoặc giả kết quả kiểm tra để vượt guard.
2. Chủ dự án đã chọn **tạm bỏ bước backup**, nhưng script NX hiện gọi
   `backup-postgres.sh` bắt buộc trước migration và dừng nếu backup lỗi; chưa
   có lựa chọn bỏ bước đó được triển khai. Việc tạm bỏ backup không biến image
   cũ thành bản phục hồi dữ liệu: sau migration, hỏng dữ liệu hoặc mất credential
   có thể không phục hồi được. Không tự sửa script trên VPS hay tạo backup khi
   chưa có trong quy trình đã review.

Vì vậy không nên merge hoặc chạy lệnh deploy hiện tại để “thử”. Cần hoàn thành
cơ chế chuyển bản lần đầu và diễn tập bên dưới trước khi có lệnh thực thi.

## Quy trình đề xuất sau khi được triển khai và kiểm chứng

### 1. Chuẩn bị ngoài giờ bảo trì

- Khóa phạm vi release: ghi SHA PR, SHA `main` thực tế sau merge, kết quả CI,
  digest hai image và đúng compose đang chạy. Nếu PR/base thay đổi hoặc CI
  không pass đúng phiên bản cần phát hành, dừng và review lại.
- Kiểm tra production có deployment hoặc release lock khác đang hoạt động;
  kiểm tra dung lượng theo kích thước thực tế của image và migration. Không
  tự xóa lock, image, database, volume, queue hay log để vượt điều kiện.
- Kiểm tra đường vào API, HTTPS, webhook, các workflow đang bật và lịch; ghi
  khoảng bảo trì để sau đó đối chiếu sự kiện bị bỏ lỡ. Chỉ ghi metadata cần
  thiết, không xuất token, mật khẩu hoặc payload vào báo cáo.
- Chuẩn bị cơ chế chặn request mới ở cả đường web/API, bao gồm callback OAuth
  và webhook; trả thông báo bảo trì rõ ràng. Cấu hình Nginx hiện tại phải được
  đọc và lưu giữ trước khi sửa; test cấu hình trước reload. Không giả định
  provider sẽ gửi lại webhook thất bại.
- Cần một cơ chế chuyển lần đầu **riêng, có kiểm tra và nhật ký**, tương thích
  topology hiện tại; cùng một khóa triển khai với quy trình NX, không để hai
  worker cũ/mới chạy đồng thời. Cơ chế này chưa được viết và chưa được review.
  Nó phải thể hiện rõ lựa chọn bỏ backup đã được chủ dự án nêu, thay vì giả
  vờ backup thành công. Chỉ dùng nó sau khi diễn tập cô lập đạt.

### 2. Bắt đầu bảo trì và dừng bản cũ

1. Chặn ingress mới theo cơ chế đã duyệt; xác nhận từ bên ngoài rằng callback,
   webhook và yêu cầu API không còn đi vào ứng dụng. Ghi thời điểm bắt đầu.
2. Kiểm tra lại request, execution, approval và job Redis. Kết quả tại một
   thời điểm không chứng minh task đã hoàn thành. Người vận hành ghi nhận rủi
   ro OAuth/người dùng đã chấp nhận; không tuyên bố API cũ đã graceful drain.
3. Dừng API cũ để scheduler không tiếp tục tạo việc mới. Việc này có thể ngắt
   task còn tồn tại; nếu kết quả dừng không xác định, giữ bảo trì và điều tra.
4. Cho worker cũ dừng nhận việc và chờ job đang chạy hoàn tất. Không gửi lặp
   tín hiệu dừng hay ép dừng khi chưa xác định tác động provider. Nếu worker
   không kết thúc trong thời gian bảo trì, giữ trạng thái và kiểm tra; không
   tự phát lại job hoặc khởi worker NX cạnh worker cũ.
5. Đối chiếu lại execution chưa hoàn tất, approval và trạng thái job Redis.
   Nếu có continuation mơ hồ, execution `RUNNING` còn sót, job không đối
   chiếu được hoặc dấu hiệu provider đã xử lý nhưng chưa ghi kết quả: **dừng
   tại đây**, điều tra theo từng trường hợp trước migration; không xóa job.

### 3. Migration và khởi động NX có kiểm soát

- Chỉ bắt đầu sau khi cơ chế chuyển lần đầu và điều kiện dừng ở trên đã được
  kiểm chứng. Bốn migration NX thêm digest Kuma, checkpoint RSS, continuation
  approval và token phiên chạy. Chúng thay đổi schema và phải theo thứ tự
  Prisma; kết quả “additive” không chứng minh downgrade an toàn.
- Khởi động NX theo phương án đã diễn tập, giữ ingress bảo trì và chưa để
  worker mới xử lý job hoặc scheduler tạo live run trong lúc kiểm tra. Phải
  kiểm tra thực tế từng tác vụ nền: `SCHEDULER_ENABLED=false` không tự tắt
  mọi tác vụ, ví dụ provider-webhook recovery có flag riêng. Không sửa `.env`
  production trực tiếp khi chưa kiểm tra và lưu cấu hình hiện có.
- Kiểm tra migration status, image ID từng service, API health/readiness,
  web và quyền truy cập dashboard; đối chiếu số lượng workflow/credential và
  tình trạng execution **không đọc hoặc in secret**. Dùng mock workflow để
  kiểm tra editor và engine; không gửi thông báo hay gọi provider thật chỉ
  để smoke test.
- Chỉ mở ingress, worker và scheduler sau khi đối chiếu queue, lịch và cơ chế
  recovery; ghi giờ kết thúc bảo trì. Với lịch/webhook rơi trong khoảng này,
  kiểm tra từng nguồn trước khi bù; không tự chạy lại tác vụ có thể đã tạo
  tác động bên ngoài. Việc chạy provider thật phải nằm trong phạm vi đã được
  chủ dự án trực tiếp cho phép.

### 4. Nếu có lỗi

| Thời điểm | Xử lý đề xuất |
| --- | --- |
| Trước thay đổi schema, trạng thái API/worker đã biết | Duy trì bảo trì; cân nhắc khởi lại đúng container cũ theo thứ tự và điều tra request/job bị ngắt. Không coi việc khởi lại là bằng chứng provider chưa nhận yêu cầu. |
| Dừng worker, SSH hoặc release lock có kết quả không xác định | Không lặp lệnh dừng, không tự xóa lock; xác định process/container, queue và hiệu ứng provider trước. |
| Migration đã bắt đầu hoặc NX đã ghi dữ liệu | Giữ bảo trì và khóa khi trạng thái chưa rõ. Không khởi worker/API cũ vào database/queue đã thay đổi và không dùng rollback cũ. Ưu tiên sửa tiến trên cùng schema; nếu dữ liệu cần khôi phục, phải đánh giá phương án thực tế trước khi thay thế dữ liệu. |
| NX khỏe nhưng workflow/credential không hoạt động | Giữ hoặc khôi phục bảo trì tùy mức ảnh hưởng; kiểm tra log đã che bí mật, migration, owner/workspace và quyền kết nối. Google có thể cần owner tự kết nối lại. Không tự lặp tác động provider. |

Không có backup trong phương án hiện được yêu cầu, và hiện chưa có rollback
về `3c9ac35` được chứng minh sau migration. Nếu migration làm hỏng hoặc mất dữ
liệu, **chưa có đường khôi phục đã chứng minh**; quay lại image cũ không tự
khôi phục database, Redis hay tác động bên ngoài.

## Điều kiện để chuyển đề xuất thành lệnh thực thi

1. Hoàn thiện và review cơ chế chuyển lần đầu, bao gồm cách tạm bỏ backup theo
   quyết định đã nêu và cách ngăn auto-deploy đi trước giai đoạn bảo trì.
2. Diễn tập toàn bộ trình tự bằng image cũ đúng digest, image NX, PostgreSQL,
   Redis, request OAuth và job/approval **giả**, bao gồm lỗi migration, SSH
   đứt, worker không dừng và start thất bại. Ghi rõ tình huống nào chưa thử.
3. Chạy quality gate cho commit cuối và cập nhật PR; kiểm tra lại production
   ngay trước bảo trì. Trình bày lệnh chính xác và trạng thái dừng/khôi phục để
   chủ dự án review trước khi thực hiện.

Tài liệu này không cam kết không mất sự kiện, không khẳng định rollback đã sẵn
sàng và không phải hướng dẫn chạy ngay. Xem thêm [bằng chứng kỹ thuật](41-nx-first-cutover-plan.md).
