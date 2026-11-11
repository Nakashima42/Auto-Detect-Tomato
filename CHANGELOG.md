# Tomato Collector v5 — sửa camera iPhone

- Thêm thông báo lỗi camera tồn tại trên trang, có hướng khắc phục theo loại lỗi iOS.
- Khi iPhone không hỗ trợ yêu cầu kích thước/facingMode, tự thử cấu hình camera đơn giản.
- Tương thích nếu Safari đang giữ `index.html` cũ không có điều khiển độ nhạy.
- Thay Service Worker sang chiến lược network-first khi online, cache fallback khi offline; tăng phiên bản v5.
- Thêm mã phiên bản vào URL app.js và style.css để hạn chế Safari dùng tệp cũ.
- Giữ dữ liệu IndexedDB và các tính năng ZIP 100 ảnh, label.json, xóa hàng loạt.
