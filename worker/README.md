# Hướng dẫn Triển khai Cloudflare Worker & TinyPNG

Backend này giúp:
1. Nhận ảnh tải lên từ trang web.
2. Tự động gọi **TinyPNG API** để nén tối đa và chuyển đổi sang định dạng `.webp` hiện đại, siêu nhẹ.
3. Lưu trữ ảnh an toàn trên **Cloudflare R2 Bucket** (10GB lưu trữ miễn phí, không tốn tiền băng thông CDN).
4. Phục vụ ảnh trực tiếp với tốc độ cao cho Slideshow và Album.

---

## 1. Chuẩn bị

1. **Tài khoản Cloudflare:** Đăng ký miễn phí tại [cloudflare.com](https://dash.cloudflare.com).
2. **Tạo R2 Bucket:**
   - Vào Dashboard Cloudflare -> Mục **R2 Object Storage**.
   - Bấm **Create bucket** -> Đặt tên bucket là `dem-ngay-yeu-photos` (hoặc tên tuỳ ý, nếu đổi tên nhớ sửa lại trong `wrangler.toml`).
3. **Lấy khóa TinyPNG API:**
   - Đăng ký miễn phí tại: [tinypng.com/developers](https://tinypng.com/developers).
   - Nhập tên và email, bạn sẽ nhận được link kích hoạt và **API Key** (mỗi tháng miễn phí 500 lượt nén).

---

## 2. Triển khai (Deploy) lên Cloudflare

Mở cửa sổ dòng lệnh (Terminal / PowerShell) tại thư mục `worker/`:

```bash
cd c:/Developer/html/moon/Dem_ngay_yeu/worker

# Đăng nhập vào Cloudflare (chỉ cần làm lần đầu)
npx wrangler login

# Thêm khóa bí mật TinyPNG API Key vào Worker
npx wrangler secret put RVZb6q3XbrNGwXtDrXKGLdxf9k5YG09w
# (Dán API Key bạn nhận được từ TinyPNG vào và nhấn Enter)

# Triển khai Worker lên mạng
npx wrangler deploy
```

---

## 3. Cấu hình vào trang Web

Sau khi lệnh `wrangler deploy` chạy xong, bạn sẽ nhận được một đường link dạng:
`https://dem-ngay-yeu-backend.your-subdomain.workers.dev`

Mở file `script.js` ở thư mục gốc và dán link vào biến `WORKER_URL`:
```javascript
const WORKER_URL = 'https://dem-ngay-yeu-backend.your-subdomain.workers.dev';
```

Thế là xong! Mọi ảnh bạn tải lên từ giao diện Album sẽ được tự động nén WebP và lưu trữ online vĩnh viễn.
