// main.js

// FIX: Sử dụng new URL để resolve đường dẫn tương đối chính xác trên GitHub Pages
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btn-start');
const statusDiv = document.getElementById('status');

let isProcessing = false; 
let lastPredictions = []; 

// 1. Khởi động Webcam
btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    statusDiv.innerText = "Requesting camera access...";
    
    try {
        // Ràng buộc facingMode environment cho điện thoại
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 480 }, 
                facingMode: "environment" 
            }
        });
        video.srcObject = stream;
        video.play();
        
        video.onloadeddata = () => {
            // Set kích thước canvas khớp với kích thước thực tế của video stream
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            requestAnimationFrame(loop); 
            statusDiv.innerText = "Webcam active. Loading Model (approx 40MB)...";
            btnStart.style.display = 'none';
        };
    } catch (err) {
        console.error(err);
        statusDiv.innerText = "Error: " + err.message;
        statusDiv.style.color = "red";
        btnStart.disabled = false;
        alert("Không thể truy cập Camera. Hãy đảm bảo bạn đang chạy trên HTTPS hoặc Localhost.");
    }
});

// 2. Xử lý message từ Worker
worker.onmessage = (e) => {
    const { status, output, data } = e.data;

    if (status === 'complete') {
        lastPredictions = output; 
        isProcessing = false; // Mở khóa mutex
    } else if (status === 'loading') {
        if (data.status === 'progress') {
            statusDiv.innerText = `Downloading Model: ${Math.round(data.progress)}%`;
        } else if (data.status === 'done') {
             statusDiv.innerText = `Model Loaded. Inference Running.`;
        }
    } else if (status === 'error') {
        statusDiv.innerText = "Worker Error: " + data;
        isProcessing = false;
    }
};

// 3. Main Loop (60FPS Render, Async Inference)
async function loop() {
    // A. Render Frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // B. Render Bounding Boxes
    renderBoxes(lastPredictions);

    // C. Non-blocking Inference Request
    if (!isProcessing) {
        isProcessing = true; 
        
        try {
            // Tối ưu hóa: createImageBitmap là bất đồng bộ và nhanh hơn toDataURL
            const bitmap = await createImageBitmap(video);
            
            // Transferable Object: Chuyển quyền sở hữu bitmap sang worker (Zero-copy)
            worker.postMessage({ image: bitmap, status: 'predict' }, [bitmap]);
        } catch (err) {
            console.error("Frame capture error:", err);
            isProcessing = false;
        }
    }

    requestAnimationFrame(loop);
}

function renderBoxes(boxes) {
    ctx.font = 'bold 18px Consolas, monospace';
    ctx.lineWidth = 3;

    boxes.forEach(({ score, label, box }) => {
        const { xmax, xmin, ymax, ymin } = box;
        const color = getColorHash(label);
        
        // Box
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.rect(xmin, ymin, xmax - xmin, ymax - ymin);
        ctx.stroke();

        // Label Background
        const text = `${label} ${(score * 100).toFixed(1)}%`;
        const textMetrics = ctx.measureText(text);
        const textHeight = 18; // approx
        
        ctx.fillStyle = color;
        ctx.fillRect(xmin, ymin - textHeight - 8, textMetrics.width + 10, textHeight + 8);
        
        // Label Text
        ctx.fillStyle = '#000000'; // Black text on colored bg for contrast
        ctx.fillText(text, xmin + 5, ymin - 6);
    });
}

function getColorHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 100%, 50%)`; // Sử dụng HSL để màu luôn tươi sáng
}
