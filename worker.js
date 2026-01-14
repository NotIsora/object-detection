// worker.js
// Sử dụng phiên bản ổn định mới hơn để load model nhanh hơn
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Bắt buộc tắt local models khi chạy trên browser/github pages để nó fetch từ HF Hub
env.allowLocalModels = false;
env.useBrowserCache = true;

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
    // Kỹ thuật Zero-Copy: Nhận ImageBitmap trực tiếp
    const { image, status } = event.data;

    if (status === 'predict') {
        try {
            const detector = await ObjectDetectionPipeline.getInstance((data) => {
                self.postMessage({ status: 'loading', data });
            });

            // Inference: DETR nhận đầu vào, threshold 0.5 là mức an toàn
            const output = await detector(image, { threshold: 0.5, percentage: true });

            // Quan trọng: Giải phóng bộ nhớ của ImageBitmap trong Worker
            if (image && typeof image.close === 'function') image.close();

            self.postMessage({ status: 'complete', output });
        } catch (e) {
            self.postMessage({ status: 'error', data: e.toString() });
        }
    }
});
