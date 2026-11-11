# v8 — Bảo vệ ảnh khi lưu chỉnh sửa

- Trước khi lưu box, đọc lại bản ghi gốc từ IndexedDB; chỉ cập nhật nhãn và tọa độ, bảo toàn id, tên ảnh, ảnh JPEG và thumbnail trong bản ghi.
- Kiểm tra ảnh gốc còn tồn tại sau khi ghi; nếu lỗi thì không đóng cửa sổ sửa.
- Không làm mới toàn bộ ảnh thu nhỏ khi bấm Lưu chỉnh sửa; cập nhật số khung trên ảnh và bộ đếm, giúp hạn chế lỗi ảnh trắng sau lưu trên Safari.
- Thêm nút Làm mới để đọc lại thư viện từ IndexedDB nếu ảnh xem trước không hiển thị.
- Không đổi tên database, không xóa bản ghi, giữ lại nhận diện lọc màu theo v3 và các chức năng ZIP 100 ảnh/xóa hàng loạt.
