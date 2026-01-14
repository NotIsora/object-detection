// main.js
const worker = new Worker('worker.js', { type: 'module' });

const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btn-start');
const statusDiv = document.getElementById('status');

let isProcessing = false; // "Van" khóa để ngăn spam worker
let lastPredictions = []; // Lưu kết quả cũ để vẽ liên tục trong khi chờ kết quả mới

// 1. Khởi động Webcam
btnStart.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "environment" }
        });
        video.srcObject = stream;
        video.play();
        
        video.onloadeddata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            requestAnimationFrame(loop); // Bắt đầu vòng lặp
            statusDiv.innerText = "Webcam active. Starting inference...";
            btnStart.style.display = 'none';
        };
    } catch (err) {
        alert("Error accessing webcam: " + err);
    }
});

// 2. Xử lý message từ Worker
worker.onmessage = (e) => {
    const { status, output, data } = e.data;

    if (status === 'complete') {
        lastPredictions = output; // Cập nhật vị trí mới
        isProcessing = false;     // Mở khóa để gửi frame tiếp theo
    } // main.js (tìm đoạn xử lý status === 'loading')

} else if (status === 'loading') {
    if (data.status === 'progress') {
        // [FIX] Kiểm tra xem có tính được % hay không
        const percent = data.progress ? Math.round(data.progress) : null;
        
        if (percent !== null && !isNaN(percent)) {
            statusDiv.innerText = `Loading Model: ${percent}%`;
        } else {
            // Nếu không biết tổng dung lượng, chỉ hiện đang tải
            statusDiv.innerText = `Downloading Model... (Size unknown)`;
        }
    } else {
        statusDiv.innerText = `Status: ${data.status}`;
    }
}
};

// 3. Vòng lặp chính (Main Loop - 60FPS)
async function loop() {
    // A. Vẽ video frame hiện tại lên canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // B. Vẽ các bounding box (dùng kết quả gần nhất)
    renderBoxes(lastPredictions);

    // C. Gửi frame xuống worker (Logic bất đồng bộ tối ưu)
    if (!isProcessing) {
        isProcessing = true; // Khóa lại
        
        // TẠO IMAGEBITMAP: Nhanh hơn rất nhiều so với toDataURL hay getImageData
        const bitmap = await createImageBitmap(video);
        
        // Gửi bitmap xuống worker và dùng Transferable Objects (tham số thứ 2)
        // Điều này chuyển quyền sở hữu bộ nhớ sang worker, main thread không tốn copy cost.
        worker.postMessage({ image: bitmap, status: 'predict' }, [bitmap]);
    }

    // Lặp lại
    requestAnimationFrame(loop);
}

// Hàm vẽ (Giữ nguyên logic vẽ, tối ưu hiển thị)
function renderBoxes(boxes) {
    ctx.font = '18px Arial';
    ctx.lineWidth = 3;

    boxes.forEach(({ score, label, box }) => {
        const { xmax, xmin, ymax, ymin } = box;
        
        // Chọn màu cố định theo Label để đỡ bị nhấp nháy màu
        const color = getColorHash(label);
        
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        ctx.beginPath();
        ctx.rect(xmin, ymin, xmax - xmin, ymax - ymin);
        ctx.stroke();

        // Vẽ nền chữ
        const text = `${label} ${Math.round(score * 100)}%`;
        const textWidth = ctx.measureText(text).width;
        ctx.fillStyle = color;
        ctx.fillRect(xmin, ymin - 25, textWidth + 10, 25);
        
        // Vẽ chữ
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, xmin + 5, ymin - 7);
    });
}

// Hàm hash màu đơn giản để giữ màu ổn định cho cùng 1 label
function getColorHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;

}
