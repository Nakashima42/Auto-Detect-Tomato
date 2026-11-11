# Tomato Collector — PWA offline thử nghiệm

Bản mẫu trắng/đen cho iPhone 11, **không cần laptop hay mạng khi chụp** (sau khi cài PWA một lần).

## Có gì trong bản này?

- Camera điện thoại với nhãn `Ripe`, `Semi_Ripe`, `Unripe` và 5 loại tình trạng `Healthy_Tomato`, `Anthracnose`, `Fruit_Cracking`, `Blossom_End_Rot`, `Bacterial_Spot`.
- Nhấn một lần để lưu 1 ảnh; nhấn giữ để chụp liên tục theo chu kỳ cài đặt.
- Thử nghiệm khoanh vùng *bằng lọc màu* chạy trên điện thoại (không phải AI học máy). Phù hợp trái đỏ trên nền ít nhiễu; trái xanh giữa lá, bóng chói, nhiều trái chồng nhau có thể sai. Có chế độ tắt tự khoanh để vẽ tay.
- Sửa box và nhãn từng trái trong ảnh bằng cách chạm ảnh thu nhỏ, chạm box để chọn, kéo trên ảnh để thêm box, nhấn Lưu chỉnh sửa.
- Lưu ảnh JPEG kích thước khung hình camera cung cấp, không lưu bản thu nhỏ 384 px. Bounding box quy đổi về ảnh gốc.
- Lưu ảnh tự động bằng IndexedDB; đóng Safari hoặc quay ra Màn hình chính rồi mở lại thường vẫn còn ảnh đã lưu thành công (trừ khi xóa dữ liệu web / iOS thu hồi bộ nhớ). Dung lượng lưu trữ phụ thuộc máy.
- Ảnh chụp mới tạo thumbnail riêng 240 px để thư viện tải nhẹ; ảnh gốc JPG không bị giảm độ phân giải.
- Thư viện hiển thị 24 ảnh mỗi lượt, có **Xem thêm**, **Chọn ảnh**, **Chọn tất cả**, **Bỏ chọn**, và **Xóa đã chọn** kèm xác nhận.
- Xuất từng lô **30/50/100/200/500 ảnh** thành ZIP có `images/*.jpg` và **`label.json`** với ba `from_name`: `tomato_bbox`, `ripeness`, `disease`.
- Bộ tạo ZIP tính CRC theo từng đoạn 256 KiB thay vì nạp nguyên tất cả JPEG vào RAM. Tuy nhiên ZIP quá lớn vẫn có thể khiến Safari iPhone hết bộ nhớ, nên nên xuất lô 50–100 ảnh trước.
- Tùy chỉnh các thuộc tính bổ sung trong mục Cài đặt; thuộc tính nằm trong `meta` (để Label Studio đọc/hiển thị trực tiếp có thể cần cập nhật labeling config).
- Code không dùng thư viện CDN, không có backend, không upload ảnh.

## Dùng trên iPhone (cần HTTPS ban đầu)

1. Đưa **toàn bộ thư mục** lên một máy chủ HTTPS tĩnh (GitHub Pages hoặc Cloudflare Pages đều được). Không được chỉ mở `index.html` trong ứng dụng Tệp rồi mong camera và offline hoạt động ổn định.
2. Mở link HTTPS bằng Safari trên iPhone. Đợi tải đầy đủ lần đầu khi có Internet.
3. Dùng Chia sẻ → Thêm vào Màn hình chính → Mở như ứng dụng web. Mở biểu tượng trên Màn hình chính khi còn mạng lần đầu và cấp quyền camera.
4. Bật Chế độ máy bay rồi mở lại app để kiểm tra tải ngoại tuyến, mở camera, chụp, xem lại ảnh đã lưu và xuất ZIP.
5. Sau khi chụp một lô, bấm **Xuất ZIP**, đợi tạo file rồi **bấm link Tải ZIP** và lưu vào ứng dụng Tệp. Không xóa dữ liệu web khi chưa sao lưu.
6. Nếu nâng cấp trên GitHub Pages: upload đè các tệp mới lên **chính repository và URL cũ**, mở bằng Safari khi có mạng, tải lại (có thể cần đóng/mở lại ứng dụng sau khi service worker mới được cài). Không xóa dữ liệu website. IndexedDB vẫn dùng `tomato-capture-v1`, không thay đổi hay xóa ảnh đã lưu.

**Lưu ý:** Service Worker cần HTTPS hoặc localhost; Safari/ iOS có thể thu hồi dữ liệu IndexedDB khi bộ nhớ đầy hoặc dữ liệu website bị xóa. Hãy xuất ZIP và sao lưu thường xuyên. Không thể đảm bảo mọi phiên bản Safari sẽ cấp camera offline trước khi đã có quyền.

## Chạy thử trên máy tính

```bash
cd tomato_collector
python -m http.server 8080
```

Mở `http://localhost:8080` trên chính máy tính để thử giao diện. `localhost` được xem là secure context. Không dùng `http://192.168.x.x:8080` từ iPhone để mở camera vì không phải HTTPS.

## Quan trọng với Label Studio

JSON dùng cấu trúc annotations/result bạn cung cấp, tọa độ hộp được ghi theo **phần trăm**, và `data.image` chứa `images/<tên ảnh>`. Khi nhập vào Label Studio, cần đặt ảnh trên URL mà Label Studio truy cập được hoặc cấu hình local-file storage/đổi mapping. ZIP tự tạo không đồng nghĩa với việc Label Studio có thể import trực tiếp tất cả ảnh một lần mà không cấu hình đường dẫn.

## Nâng cấp AI thật

Bản này **chưa có model đã huấn luyện** vì chưa có ảnh học từ file `.json`. Để thay bộ lọc màu bằng YOLO/ONNX hoặc Core ML, cần dữ liệu ảnh thật kèm bbox hoặc một model phát hiện Tomato đã train. Với PWA, chọn mô hình cực nhỏ và runtime chạy trực tiếp trên Safari iPhone sau khi đo FPS và kích thước gói tải về; nên giữ khả năng sửa box thủ công.
