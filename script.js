// ==========================================
// 1. CẤU HÌNH HỆ THỐNG
// ==========================================
const START_DATE = new Date(2024, 1, 5); // 05/02/2024 (Tháng 2: index = 1)

/**
 * URL Cloudflare Worker vừa được deploy:
 */
const WORKER_URL = 'https://dem-ngay-yeu-backend.gyther102.workers.dev';

const SLIDE_INTERVAL_MS = 6000; // Đổi ảnh slideshow mỗi 6 giây

// Hàm định dạng ngày chuẩn
function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Danh sách ảnh dự phòng cục bộ khi chưa có ảnh trên Worker
const LOCAL_FALLBACK_IMAGES = [
  { key: '1.jpeg', url: 'imgs/1.jpeg', takenDate: '2024-02-05' },
  { key: '2.jpeg', url: 'imgs/2.jpeg', takenDate: '2024-02-14' },
  { key: '3.jpeg', url: 'imgs/3.jpeg', takenDate: '2024-03-08' },
  { key: '4.jpg',  url: 'imgs/4.jpg',  takenDate: '2024-04-30' },
  { key: '5.jpg',  url: 'imgs/5.jpg',  takenDate: '2024-05-20' },
];

// Bộ nhớ ảnh hiện hành của ứng dụng
let currentImages = [];

// ==========================================
// 2. ĐẾM SỐ NGÀY YÊU NHAU
// ==========================================
function updateDayCount() {
  const now = new Date();
  const start = new Date(START_DATE.getFullYear(), START_DATE.getMonth(), START_DATE.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = today - start;
  const days = Math.floor(diffTime / 86400000);
  
  const dayCountEl = document.getElementById('day-count');
  if (dayCountEl) {
    dayCountEl.textContent = Math.max(0, days).toLocaleString('vi-VN');
  }
}
updateDayCount();
setInterval(updateDayCount, 60 * 1000);

// ==========================================
// 3. TƯƠNG TÁC MỞ / KHÉP 2 NỬA TRANG WEB
// ==========================================
const doorsWrapper = document.getElementById('doors-wrapper');
const heartBtn = document.getElementById('heart-btn');
const closeDoorsBtn = document.getElementById('close-doors-btn');
const imageHalf = document.getElementById('image-half');
const infoHalf = document.getElementById('info-half');

// Mặc định ban đầu ở trạng thái khép kín
document.body.classList.add('doors-closed');

function toggleDoors() {
  const isOpen = doorsWrapper.classList.toggle('is-open');
  if (isOpen) {
    document.body.classList.remove('doors-closed');
  } else {
    document.body.classList.add('doors-closed');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Cập nhật tooltip trên nút trái tim
  const tooltip = heartBtn.querySelector('.heart-tooltip');
  if (tooltip) {
    tooltip.textContent = isOpen ? 'Khép lại' : 'Mở Album';
  }
}

heartBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleDoors();
});

// Khi đang mở, chạm vào bất kỳ dải viền nào còn lại của cánh cửa đều khép lại
imageHalf.addEventListener('click', (e) => {
  if (doorsWrapper.classList.contains('is-open') && !e.target.closest('.heart-trigger')) {
    toggleDoors();
  }
});

infoHalf.addEventListener('click', () => {
  if (doorsWrapper.classList.contains('is-open')) {
    toggleDoors();
  }
});

closeDoorsBtn.addEventListener('click', () => {
  doorsWrapper.classList.remove('is-open');
  document.body.classList.add('doors-closed');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const tooltip = heartBtn.querySelector('.heart-tooltip');
  if (tooltip) tooltip.textContent = 'Mở Album';
});

// ==========================================
// 4. SLIDESHOW ẢNH Ở NỬA TRÁI
// ==========================================
const slideshow = {
  wrap: document.getElementById('image-wrap'),
  layers: [],
  currentIndex: 0,
  activeLayer: 0,
  timer: null,
};

function initSlideshow() {
  slideshow.wrap.innerHTML = '';
  slideshow.layers = [document.createElement('img'), document.createElement('img')];
  slideshow.layers.forEach((img) => {
    img.className = 'bg-photo';
    img.alt = 'Khoảnh khắc yêu thương';
    slideshow.wrap.appendChild(img);
  });
}

function showSlideImage(url) {
  if (!slideshow.layers.length) return;
  const nextLayer = 1 - slideshow.activeLayer;
  const currentLayer = slideshow.activeLayer;
  
  const targetImg = slideshow.layers[nextLayer];
  targetImg.onload = () => {
    targetImg.classList.add('is-visible');
    slideshow.layers[currentLayer].classList.remove('is-visible');
    slideshow.activeLayer = nextLayer;
  };
  targetImg.src = url;
}

function startSlideshow() {
  if (slideshow.timer) clearInterval(slideshow.timer);
  if (!currentImages.length) {
    slideshow.wrap.querySelectorAll('.bg-photo').forEach((el) => el.classList.remove('is-visible'));
    const hint = document.createElement('div');
    hint.className = 'no-image-hint';
    hint.textContent = 'Chưa có ảnh nào. Nhấn vào trái tim để thêm ảnh kỷ niệm!';
    slideshow.wrap.appendChild(hint);
    return;
  }

  slideshow.wrap.querySelectorAll('.no-image-hint').forEach((el) => el.remove());
  slideshow.currentIndex = 0;
  showSlideImage(currentImages[0].url);

  if (currentImages.length > 1) {
    slideshow.timer = setInterval(() => {
      slideshow.currentIndex = (slideshow.currentIndex + 1) % currentImages.length;
      showSlideImage(currentImages[slideshow.currentIndex].url);
    }, SLIDE_INTERVAL_MS);
  }
}

// ==========================================
// 5. ALBUM ẢNH & HIỂN THỊ LƯỚI (GALLERY)
// ==========================================
const photoGrid = document.getElementById('photo-grid');
const galleryCounter = document.getElementById('gallery-counter');
const refreshBtn = document.getElementById('refresh-btn');

function renderGallery(images, isFromR2 = false) {
  photoGrid.innerHTML = '';
  if (!images || images.length === 0) {
    galleryCounter.textContent = 'Chưa có ảnh nào trong kho lưu trữ';
    photoGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--muted);">
        <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">Kho ảnh hiện đang trống</p>
        <p style="font-size: 0.88rem;">Hãy kéo thả ảnh hoặc nhấn chọn ảnh ở khung phía trên để bắt đầu lưu giữ kỷ niệm.</p>
      </div>
    `;
    return;
  }

  if (isFromR2) {
    galleryCounter.innerHTML = `Đang có <strong>${images.length}</strong> khoảnh khắc được lưu giữ <span style="color:#16a34a; font-size:0.8rem;">(Đã đồng bộ Cloudflare)</span>`;
  } else {
    galleryCounter.innerHTML = `Đang có <strong>${images.length}</strong> khoảnh khắc <span style="color:#d97706; font-size:0.8rem;">(Ảnh mẫu tạm thời — Hãy thêm ảnh mới để lưu vào R2)</span>`;
  }

  images.forEach((imgItem, index) => {
    const card = document.createElement('div');
    card.className = 'photo-card';

    // Lấy ngày chụp ảnh
    const displayDate = formatDisplayDate(imgItem.takenDate) || 'Kỷ niệm';

    card.innerHTML = `
      <img class="photo-thumb" src="${imgItem.url}" alt="Ảnh kỷ niệm ngày ${displayDate}" loading="lazy">
      <div class="photo-overlay">
        <div class="photo-info">
          <span class="photo-date-badge">📅 ${displayDate}</span>
          <button class="photo-delete-btn" title="Xóa ảnh này" data-key="${imgItem.key}">&times;</button>
        </div>
      </div>
    `;

    // Click vào card để xem phóng to (trừ khi bấm nút xóa)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.photo-delete-btn')) return;
      openLightbox(imgItem, `Ngày chụp: ${displayDate}`);
    });

    // Xử lý nút xóa ảnh
    const delBtn = card.querySelector('.photo-delete-btn');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Bạn có chắc chắn muốn xóa bức ảnh này không?')) return;
      await handleDeleteImage(imgItem.key, index);
    });

    photoGrid.appendChild(card);
  });
}

// ==========================================
// 6. TẢI DANH SÁCH ẢNH TỪ SERVER
// ==========================================
async function loadImages() {
  galleryCounter.textContent = 'Đang tải danh sách ảnh...';
  
  // Nếu chưa cấu hình Worker, sử dụng danh sách ảnh cục bộ
  if (!WORKER_URL || WORKER_URL.trim() === '' || WORKER_URL.includes('your-name')) {
    currentImages = [...LOCAL_FALLBACK_IMAGES];
    renderGallery(currentImages);
    startSlideshow();
    return;
  }

  try {
    const res = await fetch(`${WORKER_URL}/api/images`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
      currentImages = data.map((item) => ({
        key: item.key,
        url: item.url,
        uploaded: item.uploaded,
        takenDate: item.takenDate,
      }));
    } else {
      // R2 vừa tạo chưa có ảnh nào -> Dùng tạm ảnh mẫu trong imgs/ để trang chủ luôn có ảnh
      currentImages = [...LOCAL_FALLBACK_IMAGES];
    }

    renderGallery(currentImages, Array.isArray(data) && data.length > 0);
    startSlideshow();
  } catch (err) {
    console.warn('Lỗi kết nối Worker, tự động dùng ảnh cục bộ:', err.message);
    currentImages = [...LOCAL_FALLBACK_IMAGES];
    renderGallery(currentImages);
    startSlideshow();
    galleryCounter.innerHTML = `<span style="color:#dc2626;">Lỗi kết nối Worker (${err.message}). Đang hiển thị ảnh dự phòng.</span>`;
  }
}

refreshBtn.addEventListener('click', () => {
  loadImages();
});

// ==========================================
// 7. XÓA ẢNH
// ==========================================
async function handleDeleteImage(key, localIndex) {
  if (!WORKER_URL || WORKER_URL.trim() === '' || WORKER_URL.includes('your-name')) {
    currentImages.splice(localIndex, 1);
    renderGallery(currentImages);
    startSlideshow();
    return;
  }

  try {
    const res = await fetch(`${WORKER_URL}/api/images/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
    const result = await res.json();
    if (result.ok) {
      await loadImages();
    } else {
      alert('Không thể xóa ảnh: ' + (result.error || 'Lỗi chưa xác định'));
    }
  } catch (err) {
    alert('Lỗi kết nối khi xóa ảnh: ' + err.message);
  }
}

// ==========================================
// 8. TẢI ẢNH LÊN (TINÝPNG + WEBP + R2)
// ==========================================
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const statusMsg = document.getElementById('status-msg');
const takenDateInput = document.getElementById('taken-date-input');

// Khởi tạo ngày chụp ảnh mặc định là ngày hôm nay
if (takenDateInput) {
  takenDateInput.value = getTodayDateString();
}

function showStatus(text, isSpinning = true) {
  uploadStatus.removeAttribute('hidden');
  uploadStatus.classList.add('is-active');
  statusMsg.textContent = text;
  const spinner = document.getElementById('status-spinner');
  if (spinner) spinner.style.display = isSpinning ? 'block' : 'none';
}

function hideStatus() {
  uploadStatus.setAttribute('hidden', '');
  uploadStatus.classList.remove('is-active');
}

// Khởi tạo ban đầu luôn ẩn thông báo xử lý
hideStatus();

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('is-dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('is-dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    handleUploadFiles(e.dataTransfer.files);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length) {
    handleUploadFiles(fileInput.files);
  }
});

async function handleUploadFiles(files) {
  const fileList = Array.from(files).filter((f) => f.type.startsWith('image/'));
  if (!fileList.length) {
    alert('Vui lòng chọn file hình ảnh (JPG, PNG, WebP...)');
    return;
  }

  // Lấy ngày chụp từ ô nhập liệu hoặc mặc định ngày hôm nay
  const selectedDate = (takenDateInput && takenDateInput.value) ? takenDateInput.value : getTodayDateString();

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const prefix = fileList.length > 1 ? `[${i + 1}/${fileList.length}] ` : '';
    
    // Nếu chưa cấu hình Worker URL -> Thực hiện giả lập nén WebP ngay tại trình duyệt
    if (!WORKER_URL || WORKER_URL.trim() === '' || WORKER_URL.includes('your-name')) {
      showStatus(`${prefix}Đang xử lý và chuyển định dạng "${file.name}" sang .WebP...`);
      await new Promise((r) => setTimeout(r, 600)); // Hiệu ứng chờ tự nhiên

      const webpDataUrl = await convertToLocalWebP(file);
      currentImages.unshift({
        key: `${selectedDate}_${Date.now()}_local.webp`,
        url: webpDataUrl,
        takenDate: selectedDate,
      });
      renderGallery(currentImages);
      startSlideshow();
      continue;
    }

    // Nếu ĐÃ cấu hình Worker -> Gửi lên Cloudflare Worker nén qua TinyPNG và lưu R2
    try {
      showStatus(`${prefix}Đang gửi "${file.name}" đến Cloudflare Worker...`);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('takenDate', selectedDate);

      showStatus(`${prefix}TinyPNG API đang nén và chuyển đổi sang WebP...`);
      const res = await fetch(`${WORKER_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }

      showStatus(`${prefix}Lưu trữ thành công vào Cloudflare R2!`);
    } catch (err) {
      alert(`Tải ảnh "${file.name}" thất bại: ${err.message}`);
    }
  }

  // Tải lại danh sách ảnh từ server sau khi xong
  if (WORKER_URL && !WORKER_URL.includes('your-name')) {
    await loadImages();
  }

  showStatus('Hoàn tất tải ảnh lên!', false);
  setTimeout(hideStatus, 3000);
  fileInput.value = '';
}

/**
 * Hàm nén & đổi sang WebP cục bộ bằng Canvas (dành cho chế độ chạy thử nghiệm)
 */
function convertToLocalWebP(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        // Xuất chuẩn định dạng image/webp
        const webpUrl = canvas.toDataURL('image/webp', 0.85);
        resolve(webpUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ==========================================
// 9. LIGHTBOX PHÓNG TO ẢNH
// ==========================================
const lightboxModal = document.getElementById('lightbox-modal');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxDeleteBtn = document.getElementById('lightbox-delete-btn');

let currentLightboxItem = null;

function openLightbox(item, caption) {
  currentLightboxItem = item;
  lightboxImg.src = typeof item === 'string' ? item : item.url;
  lightboxCaption.textContent = caption || '';
  lightboxModal.hidden = false;
}

function closeLightbox() {
  lightboxModal.hidden = true;
  lightboxImg.src = '';
  currentLightboxItem = null;
}

if (lightboxDeleteBtn) {
  lightboxDeleteBtn.addEventListener('click', async () => {
    if (!currentLightboxItem) return;
    if (!confirm('Bạn có chắc chắn muốn xóa bức ảnh này không?')) return;
    const key = typeof currentLightboxItem === 'string' ? currentLightboxItem : currentLightboxItem.key;
    const idx = currentImages.findIndex((img) => img.key === key);
    closeLightbox();
    await handleDeleteImage(key, idx);
  });
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxModal.addEventListener('click', (e) => {
  if (e.target === lightboxModal) closeLightbox();
});

// Phím tắt ESC đóng Lightbox hoặc khép 2 cánh cửa
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!lightboxModal.hidden) {
      closeLightbox();
    } else if (doorsWrapper.classList.contains('is-open')) {
      toggleDoors();
    }
  }
});

// ==========================================
// 10. KHỞI CHẠY ỨNG DỤNG
// ==========================================
initSlideshow();
loadImages();
