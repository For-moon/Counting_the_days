/**
 * Cloudflare Worker Backend cho web "Đếm ngày yêu nhau"
 * 
 * Chức năng:
 * - Lưu trữ ảnh vào Cloudflare R2 Bucket (Miễn phí 10GB, 0đ phí băng thông).
 * - Tích hợp TinyPNG API: nén và tự động đổi định dạng sang .webp chuẩn chất lượng cao.
 * - API xem ảnh, liệt kê danh sách ảnh, tải lên và xóa ảnh.
 */

// Tiêu đề CORS cho phép web gọi từ mọi domain (localhost, github pages, custom domain)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Xử lý Preflight request CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // 1. GET /api/images - Lấy danh sách tất cả ảnh từ R2
      if (request.method === 'GET' && (path === '/api/images' || path === '/images')) {
        const listed = await env.MY_BUCKET.list({
          limit: 200,
        });

        // Sắp xếp ảnh: Ưu tiên theo ngày chụp (takenDate) mới nhất
        const items = (listed.objects || [])
          .map((obj) => {
            let dateStr = '';
            // Trích xuất ngày từ tên file dạng YYYY-MM-DD_...
            const match = obj.key.match(/^(\d{4}-\d{2}-\d{2})/);
            if (match) {
              dateStr = match[1];
            } else if (obj.customMetadata?.takenDate) {
              dateStr = obj.customMetadata.takenDate;
            } else if (obj.uploaded) {
              dateStr = new Date(obj.uploaded).toISOString().split('T')[0];
            }

            return {
              key: obj.key,
              size: obj.size,
              uploaded: obj.uploaded,
              takenDate: dateStr,
              url: `${url.origin}/api/images/${encodeURIComponent(obj.key)}`,
            };
          })
          .sort((a, b) => {
            if (a.takenDate && b.takenDate && a.takenDate !== b.takenDate) {
              return b.takenDate.localeCompare(a.takenDate);
            }
            return new Date(b.uploaded) - new Date(a.uploaded);
          });

        return jsonResponse(items);
      }

      // 2. GET /api/images/:key - Stream ảnh WebP trực tiếp từ R2
      if (request.method === 'GET' && (path.startsWith('/api/images/') || path.startsWith('/images/'))) {
        const key = decodeURIComponent(path.replace(/^\/(api\/)?images\//, ''));
        const object = await env.MY_BUCKET.get(key);

        if (!object) {
          return jsonResponse({ error: 'Không tìm thấy ảnh' }, 404);
        }

        const headers = new Headers(CORS_HEADERS);
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        // Cache ảnh trên CDN trình duyệt trong 1 năm vì file WebP là bất biến
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp');

        return new Response(object.body, { headers });
      }

      // 3. POST /api/upload - Tải ảnh lên, nén & đổi sang .webp bằng TinyPNG rồi lưu R2
      if (request.method === 'POST' && (path === '/api/upload' || path === '/upload')) {
        const rawKey = String(env.TINYPNG_API_KEY || '');
        const apiKey = rawKey.replace(/[^\x20-\x7E]/g, '').trim();

        if (!apiKey) {
          return jsonResponse({ error: 'Thiếu biến môi trường TINYPNG_API_KEY trong Worker' }, 500);
        }

        const contentType = request.headers.get('content-type') || '';
        let fileBuffer = null;
        let originalName = 'photo';
        let takenDate = '';

        if (contentType.includes('multipart/form-data')) {
          const formData = await request.formData();
          const file = formData.get('file') || formData.get('image');
          if (!file) {
            return jsonResponse({ error: 'Không tìm thấy file trong form data (tên trường là "file")' }, 400);
          }
          originalName = file.name || originalName;
          takenDate = formData.get('takenDate') || '';
          fileBuffer = await file.arrayBuffer();
        } else {
          // Upload binary trực tiếp
          fileBuffer = await request.arrayBuffer();
          takenDate = request.headers.get('x-taken-date') || '';
        }

        if (!fileBuffer || fileBuffer.byteLength === 0) {
          return jsonResponse({ error: 'File rỗng hoặc không hợp lệ' }, 400);
        }

        // Chuẩn hóa định dạng ngày chụp (YYYY-MM-DD), nếu không hợp lệ thì lấy ngày hiện tại
        let cleanTakenDate = '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(takenDate).trim())) {
          cleanTakenDate = String(takenDate).trim();
        } else {
          cleanTakenDate = new Date().toISOString().split('T')[0];
        }

        // --- BƯỚC 1: Gửi ảnh sang TinyPNG API để nén ---
        const authHeader = 'Basic ' + btoa('api:' + apiKey);
        const shrinkRes = await fetch('https://api.tinify.com/shrink', {
          method: 'POST',
          headers: {
            Authorization: authHeader,
          },
          body: fileBuffer,
        });

        if (!shrinkRes.ok) {
          const errText = await shrinkRes.text();
          return jsonResponse({ 
            error: 'Lỗi nén ảnh qua TinyPNG: ' + shrinkRes.status + ' ' + errText 
          }, 502);
        }

        const shrinkLocation = shrinkRes.headers.get('Location');
        if (!shrinkLocation) {
          return jsonResponse({ error: 'TinyPNG không trả về URL kết quả' }, 502);
        }

        // --- BƯỚC 2: Chuyển đổi định dạng sang WebP ---
        const convertRes = await fetch(shrinkLocation, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            convert: { type: ['image/webp'] },
          }),
        });

        if (!convertRes.ok) {
          const errText = await convertRes.text();
          return jsonResponse({ 
            error: 'Lỗi chuyển đổi WebP qua TinyPNG: ' + convertRes.status + ' ' + errText 
          }, 502);
        }

        // Dữ liệu nhị phân WebP đã nén hoàn tất
        const webpBuffer = await convertRes.arrayBuffer();

        // Đặt tên file: [ngày_chụp]_[mã_thời_gian].webp để tránh trùng lặp
        const timeCode = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const fileKey = `${cleanTakenDate}_${timeCode}.webp`;

        // --- BƯỚC 3: Lưu vào Cloudflare R2 Bucket ---
        await env.MY_BUCKET.put(fileKey, webpBuffer, {
          httpMetadata: {
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable',
          },
          customMetadata: {
            takenDate: cleanTakenDate,
          },
        });

        return jsonResponse({
          ok: true,
          message: 'Tải lên, nén WebP và lưu trữ thành công!',
          key: fileKey,
          takenDate: cleanTakenDate,
          url: `${url.origin}/api/images/${encodeURIComponent(fileKey)}`,
          originalSize: fileBuffer.byteLength,
          compressedSize: webpBuffer.byteLength,
        });
      }

      // 4. DELETE /api/images/:key - Xóa ảnh khỏi R2
      if (request.method === 'DELETE' && path.startsWith('/api/images/')) {
        const key = decodeURIComponent(path.replace(/^\/api\/images\//, ''));
        await env.MY_BUCKET.delete(key);
        return jsonResponse({ ok: true, message: 'Đã xóa ảnh: ' + key });
      }

      return jsonResponse({ 
        message: 'Backend "Đếm ngày yêu nhau" sẵn sàng!',
        endpoints: ['GET /api/images', 'POST /api/upload', 'GET /api/images/:key', 'DELETE /api/images/:key']
      });

    } catch (err) {
      return jsonResponse({ error: err.message || 'Lỗi máy chủ Worker' }, 500);
    }
  },
};
