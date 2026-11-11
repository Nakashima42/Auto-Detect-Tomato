# Bản v2

- Đổi tệp JSON bên trong ZIP: `labels_train.json` → `label.json`.
- Thêm giới hạn xuất theo lô: 200 và 500 ảnh (không giới hạn số ảnh tích lũy, phụ thuộc bộ nhớ iPhone).
- Chọn nhiều ảnh, chọn tất cả, bỏ chọn, xóa một lần có xác nhận.
- Thư viện xem thêm 24 ảnh/lượt để tránh nặng khi có hàng trăm ảnh.
- Tính CRC32 theo khối 256 KiB, không nạp tất cả JPEG vào bộ nhớ JS.
- Giữ nguyên IndexedDB `tomato-capture-v1`; không xóa dữ liệu ảnh cũ khi cập nhật trên cùng origin.
- Tăng phiên bản cache offline v2 để nhận tệp mới.
