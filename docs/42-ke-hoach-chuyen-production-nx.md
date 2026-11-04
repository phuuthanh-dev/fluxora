# Chuyển production sang NX

**Lần deploy đầu không thành công; production đang chạy bản cũ.** Chủ dự án đã đồng ý gián đoạn
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
- [PR #75](https://github.com/phuuthanh-dev/fluxora/pull/75) đã merge và CI
  pass. Deploy 41766506723 timeout vì API cũ không thoát sau SIGTERM. Script
  deploy nền được dừng, API cũ được khởi động lại; worker và database không
  dừng, bốn migration NX chưa chạy. Release lock được giữ lại để kiểm tra.
  Số workflow/credential trước và sau đều là 9/10; đây không phải kiểm tra
  toàn vẹn dữ liệu đầy đủ. Hai biến tạm đã được gỡ khỏi GitHub.

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
4. Script dừng API cũ với thời gian chờ 20 giây, sau đó Docker có thể buộc
   dừng API nếu nó không thoát, rồi chờ worker cũ dừng. Chủ dự án đã chấp
   nhận request bị ngắt trong lần chuyển này. API cũ không graceful drain;
   API/webhook có thể gặp lỗi trong khoảng dừng. API NX vẫn dùng graceful drain.
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
- Một lượt diễn tập bổ sung cố ý làm API cũ không phản hồi bằng SIGSTOP: Docker
  buộc dừng sau timeout, cutover tiếp tục và các kiểm tra dữ liệu giả ở trên
  vẫn đạt. Đây là mô phỏng, không chứng minh mọi request production an toàn.
- [Bằng chứng API cũ](41-nx-first-cutover-plan.md): client ngắt kết nối không
  chứng minh OAuth đã hoàn thành; SIGTERM có thể ngắt refresh đang chờ. Chủ dự
  án chấp nhận gián đoạn không biến API cũ thành graceful drain.

Cần verify và CI cho bản sửa, kiểm tra lại trạng thái thực tế và release lock
trước khi thử deploy lần nữa. Không đổi volume database hoặc tự xóa job/lock.
