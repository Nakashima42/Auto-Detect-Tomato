# Tomato Collector v4 — thử nhận diện cà chua đỏ, vàng và xanh

Web app ngoại tuyến tối giản cho iPhone 11. Toàn bộ ảnh, nhãn và bộ lọc màu được xử lý trên điện thoại; không cần laptop hoặc mạng khi đã cài web app và các tệp đã được cache.

## Các thay đổi v4

- Sửa bộ nhận diện: **luôn tìm cả đỏ/cam/vàng và xanh**, không phụ thuộc giá trị bạn chọn trong phần **Độ chín**. Lựa chọn độ chín chỉ dùng để ghi nhãn.
- Thêm lọc hình dạng (độ đầy khung bao, độ tròn, giới hạn kích thước) nhằm hạn chế nhận nhầm cành/lá nhỏ.
- Có chế độ **Độ nhạy tự khoanh** trong Cài đặt thêm: **Cân bằng** hoặc **Cao**. Cao có thể tìm thêm trái nhỏ nhưng cũng dễ nhận nhầm lá/cảnh nền.
- Vẫn giữ ảnh gốc độ phân giải camera cung cấp; bộ lọc xử lý trên ảnh thu nhỏ và quy đổi khung bao về ảnh gốc.
- Giữ `label.json` trong ZIP, tự xuất ZIP khi đủ 100 ảnh chưa sao lưu, nút tải thủ công khi chưa đủ và chọn/xóa ảnh hàng loạt từ v3.
- Sửa lỗi cú pháp trong chuỗi README.txt của bộ xuất ZIP ở v3, đồng thời tăng phiên bản service worker lên v4.

## Giới hạn kỹ thuật quan trọng

**Vẫn chưa phải AI YOLO.** Phiên bản này chỉ dùng ngưỡng màu + hình học nên KHÔNG đảm bảo phát hiện được cà chua xanh giữa lá cây xanh, màu quả dưới ánh nắng gắt, quả bị che khuất hoặc nhiều trái nằm sát nhau. Có thể phát hiện nhầm mảng lá xanh thành quả. Những bbox auto cần kiểm tra/sửa trước khi train.

Để nhận tốt cà chua xanh trong vườn, cần một detector học máy một lớp **Tomato** (ví dụ YOLO Nano) đã được huấn luyện với ảnh thực tế từ chính điện thoại, rồi tích hợp chạy offline trên Safari hoặc Core ML trên iOS. Một file `labels_train.json` không chứa ảnh gốc là chưa đủ để huấn luyện model.

## Cài / cập nhật trên iPhone

1. Giải nén ZIP và upload **tất cả tệp bên trong** lên đúng repository GitHub Pages đang dùng, thay thế tệp cùng tên. `index.html` phải nằm tại root của trang.
2. Trong lúc có Internet, mở lại trang bằng Safari; đóng/mở lại app nếu cần để service worker v4 cache tệp mới.
3. Mở **Cài đặt thêm → Độ nhạy tự khoanh**, chọn **Cân bằng** (mặc định) hoặc **Cao**.
4. Thử chụp ba quả đỏ, vàng và xanh trên nền trơn tương phản trước. Nhấn ảnh đã lưu để sửa/xóa các vùng tự nhận sai.
5. Thử chế độ máy bay và mở lại app trước khi đi chụp xa.

Ảnh trong IndexedDB `tomato-capture-v1` được giữ khi cập nhật tại **cùng địa chỉ trang**. Tuy nhiên hãy xuất ZIP sao lưu trước khi nâng cấp hoặc xóa dữ liệu website.

## Xuất và sao lưu

- Đủ **100 ảnh mới** chưa sao lưu → tự tạo ZIP và yêu cầu trình duyệt tải xuống. Nếu Safari không cho tải tự động, mở liên kết tải ZIP hiện ở phần thư viện và lưu vào ứng dụng **Tệp**.
- Dưới 100 ảnh → bấm **Tải ảnh chưa sao lưu** để xuất.
- ZIP gồm `images/*.jpg`, `label.json`, `README.txt`. Không tự xóa ảnh khi tạo ZIP.
- **Quan trọng:** Trạng thái “đã sao lưu” trong bản demo hiện phản ánh app **đã tạo ZIP và gọi tải xuống**, không xác nhận tệp thực sự được lưu vào Tệp. Luôn kiểm tra ZIP đã xuất hiện trong ứng dụng Tệp và mở được trước khi xóa ảnh trong web app.
- Safari có thể xóa IndexedDB khi bạn xóa dữ liệu web hoặc khi hệ thống thu hồi bộ nhớ. Sao lưu thêm ZIP vào iCloud Drive/máy tính để tránh mất dữ liệu.

## Dành cho nhà phát triển

Cấu trúc: `index.html`, `app.js`, `detector.js`, `style.css`, `sw.js`, `manifest.webmanifest`, icon. Không có CDN, không backend, không có model download.

Để thử trên máy tính:

```bash
cd tomato_collector_v4
python -m http.server 8080
```

Truy cập `http://localhost:8080` trên máy tính (localhost cho phép yêu cầu quyền camera). Khi dùng iPhone qua mạng, cần một đường dẫn HTTPS để camera hoạt động.

`detector.js` khai báo `detectColorTomatoes(source, ripeness, inferenceWidth=384, sensitivity='balanced')`: tham số `ripeness` giữ lại cho tương thích, không điều khiển màu được tìm.
