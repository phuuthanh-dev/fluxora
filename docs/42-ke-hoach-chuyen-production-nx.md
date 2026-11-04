# Chuyển production sang NX

**Bản local đang được kiểm tra; chưa deploy.** Chủ dự án đã đồng ý gián đoạn
ngắn, chấp nhận request hoặc lịch trong lúc chuyển có thể bị ngắt/bỏ lỡ và
chọn tạm bỏ backup cho lần này. Không có backup nghĩa là nếu migration làm
mất hoặc hỏng dữ liệu, hiện chưa có bản khôi phục đã được chứng minh.

## Trạng thái trước chuyển

- Kiểm tra chỉ đọc ngày 04/11/2026: web, API và worker production dùng tag
  3c9ac35560126d6f7240f428efe0734275896218; API/worker có image ID
  sha256:70f1b641233979f4476190f654757514c2433fd8399853087a9462637b729ce3.
- Database ghi nhận 4 workflow bật, không có execution đang chạy, đang chờ
  hoặc chờ approval; các Redis key kiểm tra cho queue mặc định đều rỗng.
  Đây là ảnh chụp tức thời và phải kiểm tra lại khi chuyển.
- Ổ chứa ứng dụng còn khoảng 2,69 GiB; script yêu cầu ít nhất 2 GiB trước khi
  pull, nhưng image và migration vẫn có thể cần thêm dung lượng.
- [PR #75](https://github.com/phuuthanh-dev/fluxora/pull/75) đang draft; CI
  pass tại ec17f67. Code cutover hiện mới ở local và cần verify/CI cho commit
  cuối. GitHub Environment production không có rule chờ duyệt tại lần kiểm tra;
  merge có thể tự bắt đầu deploy sau Quality Gate của main.

## Trình tự dự kiến

1. Sau khi code cuối pass, đặt hai repository variable tạm cho image ID cũ
   được phép chuyển và lựa chọn bỏ backup lần này. Đây không phải secret.
   Xóa các variable này sau khi đã xác định kết quả deploy.
2. Merge develop vào main, theo dõi Quality Gate và Deploy production; đối
   chiếu image với SHA thực tế trên main, không mặc định bằng SHA PR head.
3. Script chỉ cho phép chuyển lần đầu khi có đúng một API và một worker đang
   chạy đúng image ID cũ, queue Redis mặc định, database chưa có migration NX,
   và execution, approval cùng các key queue được kiểm tra đều không có việc.
   Nếu điều kiện không đạt, script dừng trước khi dừng dịch vụ.
4. Script dừng API cũ rồi chờ worker cũ dừng. API cũ không graceful drain;
   SIGTERM có thể ngắt request. Trong khoảng dừng, API/webhook có thể gặp lỗi.
   Phương án này không sửa Nginx và không tạo trang bảo trì.
5. Sau khi dừng, script kiểm tra lại database và queue. Nếu có việc mới hoặc
   kết quả dừng không chắc chắn, script giữ release lock để điều tra; không
   xóa job và không chạy worker cũ/mới cùng lúc.
6. Với lựa chọn đã nêu, script ghi nhận bỏ backup lần chuyển legacy, áp dụng
   migration, khởi API/worker/web NX và kiểm tra health cùng image API/worker.
   Deploy NX thông thường vẫn bắt buộc backup.
7. Kiểm tra dashboard, số workflow/credential, execution và lịch có thể bị bỏ
   lỡ mà không in secret. Worker và scheduler NX khởi theo cấu hình production
   và có thể tiếp tục workflow live. Không tự phát lại tác vụ có kết quả
   provider chưa rõ; credential Google có thể cần owner kết nối lại.

## Nếu có lỗi

- Trước migration: khi trạng thái chắc chắn, có thể khởi lại đúng container
  cũ. Nếu SSH hoặc việc dừng không chắc chắn, giữ lock và kiểm tra trước.
- Từ lúc migration bắt đầu: không tự khởi API/worker cũ vào schema hoặc queue
  mới. Ưu tiên sửa tiến; rollback về image cũ chưa được chứng minh và image
  cũ không phục hồi database, Redis hay tác động đã gửi cho provider.

## Bằng chứng và giới hạn

- Test deploy giả lập đã kiểm tra image/schema không khớp, execution/queue
  bận, stop không chắc chắn và backup vẫn bắt buộc cho deploy thông thường.
- Diễn tập Docker cô lập dùng image API cũ đúng digest, PostgreSQL/Redis giả
  và image NX thử ghép runtime/schema từ source đã verify. Job queue giả đã
  chặn cutover; khi queue trống, bốn migration hoàn tất, workflow và ciphertext
  credential giả giữ nguyên, API/worker NX khởi động. Registry pull và web được
  mô phỏng; script dùng thư mục ứng dụng thử thay vì bundle CI. Chưa thử
  provider thật, cron live, mọi approval, mất SSH hoặc image production được
  build bởi GitHub.
- [Bằng chứng API cũ](41-nx-first-cutover-plan.md): client ngắt kết nối không
  chứng minh OAuth đã hoàn thành; SIGTERM có thể ngắt refresh đang chờ. Chủ dự
  án chấp nhận gián đoạn không biến API cũ thành graceful drain.

Cần chạy quality gate và CI cho commit cuối, rồi kiểm tra lại trạng thái thực
tế trước khi merge/deploy. Không đổi volume database hoặc tự xóa job/lock.
