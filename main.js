// main.js - DEBUG VERSION

// Hàm tiện ích để log lỗi ra màn hình HTML
function logUI(msg, isError = false) {
    const statusDiv = document.getElementById('status');
    const time = new Date().toLocaleTimeString();
    statusDiv.innerHTML += `<div style="margin-top:5px; color: ${isError ? 'red' : '#00ff88'}">[${time}] ${msg}</div>`;
    console.log(`[${time}] ${msg}`);
}

logUI("Main script loaded. Initializing Worker...");

let worker;
try {
    // 1. Tạo Worker với đường dẫn tuyệt đối dựa trên import.meta.url
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    logUI("Worker initialized successfully.");
} catch (e) {
    logUI("FATAL ERROR: Could not create Worker. " + e.message, true);
}

const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btn-start');

let isProcessing = false; 
let lastPredictions = []; 

// Bắt lỗi từ Worker (QUAN TRỌNG)
worker.onerror = (err) => {
    logUI(`WORKER ERROR: ${err.message} (File: ${err.filename}, Line: ${err.lineno})`, true);
    isProcessing = false;
};

worker.onmessage = (e) => {
    const { status, output, data } = e.data;
    if (status === 'complete') {
        lastPredictions = output; 
        isProcessing = false; 
    } else if (status === 'loading') {
        if (data.status === 'progress') {
            // Chỉ cập nhật dòng cuối để đỡ spam
            document.getElementById('status').lastElementChild.innerText = `[System] Downloading AI Model: ${Math.round(data.progress)}%`;
        } else if (data.status === 'done') {
            logUI("Model Loaded. AI is ready!");
        }
    } else if (status === 'error') {
        logUI("AI Inference Error: " + data, true);
        isProcessing = false;
    }
};

btnStart.addEventListener('click', async () => {
    logUI("Requesting Camera access...");
    btnStart.disabled = true;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 480 }, 
                facingMode: "environment" 
            }
        });
        logUI("Camera access granted.");
        video.srcObject = stream;
        video.play();
        
        video.onloadeddata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            requestAnimationFrame(loop); 
            logUI("Video stream started. Sending first frame...");
            btnStart.style.display = 'none';
        };
    } catch (err) {
        logUI("CAMERA ERROR: " + err.message + ". Check HTTPS/Permissions.", true);
        btnStart.disabled = false;
    }
});

async function loop() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    renderBoxes(lastPredictions);

    if (!isProcessing) {
        isProcessing = true; 
        try {
            const bitmap = await createImageBitmap(video);
            worker.postMessage({ image: bitmap, status: 'predict' }, [bitmap]);
        } catch (err) {
            // Lỗi này thường do video chưa sẵn sàng hoặc tab bị ẩn
            console.error(err); 
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
        const color = 'red';
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.rect(xmin, ymin, xmax - xmin, ymax - ymin);
        ctx.stroke();
        
        ctx.fillStyle = color;
        const text = `${label} ${(score * 100).toFixed(0)}%`;
        ctx.fillRect(xmin, ymin - 20, ctx.measureText(text).width + 10, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, xmin + 5, ymin - 5);
    });
}
