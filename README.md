# Tomato Collector v7 — iPhone offline

Trang PWA camera và gắn nhãn cà chua tối giản, không cần máy chủ Python khi sử dụng. Mã vẫn là **lọc màu thử nghiệm theo độ chín được chọn**, không phải AI YOLO.

## Các tính năng sửa ảnh

1. Mở một ảnh đã lưu trong thư viện.
2. Ở **Chọn / Sửa khung**, chạm vào box để xem đúng nhãn đang gắn: độ chín, tình trạng, thuộc tính phụ, tọa độ. Chạm và giữ kéo **bên trong box** để dời vị trí. Kéo **ô vuông ở góc** để đổi chiều rộng/cao.
3. Nếu cần thêm khung, chọn **+ Thêm khung**, dùng một ngón tay kéo trên ảnh. App tự trở lại chế độ sửa.
4. Chọn nhãn mới ở ô Độ chín/Tình trạng, hoặc nhấn **Xóa khung đang chọn**.
5. Bấm **Lưu chỉnh sửa** để cập nhật IndexedDB và dữ liệu xuất `label.json`. Đóng ảnh khi chưa lưu sẽ hỏi xác nhận.

## Sao lưu và cập nhật

- Đủ 100 ảnh **chưa sao lưu** thì ứng dụng tạo ZIP và yêu cầu điện thoại tải xuống. Nếu ít hơn 100, nhấn **Tải ảnh chưa sao lưu**.
- Mỗi ZIP có `label.json`, ảnh JPG trong `images/`, và README.
- Khi sửa box/nhãn của ảnh đã sao lưu, ảnh được đánh dấu **chưa sao lưu** trở lại; bạn cần xuất ZIP mới để không dùng nhãn cũ.
- Trạng thái đã sao lưu trong app chỉ có nghĩa đã tạo file ZIP; **hãy kiểm tra ZIP thực sự nằm trong Tệp** trước khi xóa ảnh gốc.
- Xóa ảnh hàng loạt vẫn hoạt động.
- Bản cập nhật giữ nguyên IndexedDB `tomato-capture-v1`, schema v2: hãy ghi đè toàn bộ tệp trong repository GitHub Pages cũ, không xóa dữ liệu Safari hoặc gỡ app trước khi sao lưu.
- Mở địa chỉ ứng dụng thêm `?v=7` trên Safari khi đang có Internet, mở lại từ màn hình chính. Thử offline sau khi tài nguyên tải đủ.

## Giới hạn

Việc khoanh vùng tự động bằng màu có thể thiếu cà chua hoặc phát hiện nhầm lá. Sửa box và kiểm tra nhãn trước khi huấn luyện Faster R-CNN. Quy trình sửa box trên Safari iPhone 11 cần được thử trực tiếp.
