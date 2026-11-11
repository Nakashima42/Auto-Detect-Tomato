# Tomato Collector v5 — iPhone 11, offline

**V5 khắc phục việc nút Mở camera không phản hồi sau khi cập nhật v4.**

## Cập nhật mà không xóa ảnh

1. Khi iPhone đang có mạng, sao lưu ảnh nếu còn mở được phiên bản cũ.
2. Giải nén gói ZIP, đưa **toàn bộ tệp bên trong** lên repository GitHub Pages cũ, giữ nguyên tên repository và địa chỉ web.
3. Trên Safari, mở địa chỉ GitHub Pages của bạn và thêm `?v=5` ở cuối để bỏ qua trang cũ bị cache, ví dụ `https://tenban.github.io/tomato-collector/?v=5`.
4. Nhấn **Mở camera** và chấp nhận quyền Camera. Nếu không được, thông báo lỗi sẽ nằm ngay dưới nút, không tự biến mất.
5. Sau khi kiểm tra camera hoạt động, mở lại biểu tượng Tomato Collector ở màn hình chính. Thử ở chế độ máy bay trước khi đi chụp ngoài trời.

**Không xóa dữ liệu Safari / gỡ app** nếu chưa sao lưu ZIP: dữ liệu chụp nằm trong IndexedDB và có thể mất khi xóa dữ liệu website. V5 giữ nguyên tên database `tomato-capture-v1` và schema v2, không tự xóa ảnh cũ.

## Những điểm sửa ở v5

- Đảm bảo web có thể mở camera kể cả khi Safari còn cache HTML cũ (điều khiển độ nhạy chưa tải kịp).
- Nếu camera từ chối cấu hình độ phân giải, tự thử lại với cấu hình mặc định.
- Nút hiện trạng thái đang mở, và lỗi quyền camera, HTTPS, hoặc camera bận được hiển thị ngay trên trang.
- `sw.js` online dùng dữ liệu mới từ mạng trước, offline dùng cache dự phòng; các tệp có tham số phiên bản để tránh mã cũ.

## Quy trình chụp và sao lưu

- Chọn độ chín và tình trạng bệnh, nhấn giữ để chụp; vị trí trái được khoanh bằng bộ lọc màu (chưa dùng AI).
- Tự tạo và bật tải ZIP mỗi **100 ảnh chưa sao lưu**. Nếu ít hơn 100, bấm **Tải ảnh chưa sao lưu**.
- Mỗi ZIP chứa `label.json`, `images/*.jpg` và `README.txt`.
- Ảnh đã chụp vẫn trong thư viện, có thể chọn nhiều ảnh và xóa hàng loạt.
- iPhone/Safari có thể chặn tự tải ZIP: khi đó bấm liên kết tải xuất hiện dưới thư viện và lưu vào ứng dụng **Tệp**. **Trạng thái đã sao lưu của app không chứng minh ZIP đã lưu trong Tệp**; hãy kiểm tra trước khi xóa ảnh.

## Yêu cầu

- Trang triển khai qua HTTPS (như GitHub Pages). Mở tệp HTML trực tiếp từ ứng dụng Tệp không có quyền camera.
- Lần đầu cài/cập nhật cần Internet; sau đó ứng dụng có thể chạy offline khi service worker đã tải đủ tài nguyên.

## Giới hạn

Bộ tự khoanh vẫn là lọc màu đỏ/cam/vàng/xanh; nhận diện cà chua xanh giữa lá vẫn có thể sai. Duyệt nhãn trước khi dùng để huấn luyện.
