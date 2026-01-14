// worker.js
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';

// Cấu hình môi trường
env.allowLocalModels = false;
env.useBrowserCache = true;

// --- [FIX QUAN TRỌNG CHO GITHUB PAGES] ---
// Tắt tính năng đa luồng vì GitHub Pages không hỗ trợ headers bảo mật cho SharedArrayBuffer
env.backends.onnx.wasm.numThreads = 1; 
// -----------------------------------------

class ObjectDetectionPipeline {
    static task = 'object-detection';
    static model = 'Xenova/detr-resnet-50';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, { quantized: true, progress_callback });
        }
        return this.instance;
    }
}

self.addEventListener('message', async (event) => {
    // Nhận ImageBitmap trực tiếp từ main thread (hiệu năng cao hơn blob/url)
    const { image, status } = event.data;

    if (status === 'predict') {
        try {
            const detector = await ObjectDetectionPipeline.getInstance((data) => {
                self.postMessage({ status: 'loading', data });
            });

            // Inference
            const output = await detector(image, { threshold: 0.8, percentage: true });

            // ImageBitmap cần được đóng thủ công để giải phóng RAM sau khi dùng xong
            if (image && typeof image.close === 'function') image.close();

            self.postMessage({ status: 'complete', output });
        } catch (e) {
            self.postMessage({ status: 'error', data: e.toString() });
        }
    }
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

});


