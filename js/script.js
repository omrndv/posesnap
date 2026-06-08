import {
    FaceLandmarker,
    HandLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

// ===== DOM ELEMENTS =====
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const previewBox = document.getElementById("previewBox");
const countdown = document.getElementById("countdown");
const expressionBadge = document.getElementById("expressionBadge");
const suggestionText = document.getElementById("suggestionText");

// ===== CONSTANTS =====
const STORAGE_KEY = "posesnap_history_v1";
const HISTORY_MAX = 12;
const COUNTDOWN_PHOTO = 3;
const COUNTDOWN_GESTURE = 5;

const GESTURE_COOLDOWN_MS = 4500;
const GESTURE_MIN_HAND_SCORE = 0.62;
const FIVE_FINGER_HOLD_MS = 2000;

const HAND_MIN_SIZE = 0.18;
const HAND_MAX_FACE_OVERLAP = 0.16;
const HAND_FACE_CENTER_BLOCK_RADIUS = 0.30;
const HAND_MOUTH_BLOCK_RADIUS = 0.22;
const HAND_SPREAD_MIN_RATIO = 0.78;

const EXPRESSION_SMOOTHING = 0.32;

// ===== STATE =====
let stream = null;
let faceLandmarker = null;
let handLandmarker = null;
let detectionAnimationId = null;
let lastVideoTime = -1;

let photoStripImages = [];
let isPhotoboothRunning = false;
let selectedTemplate = "cute";

let autoCaptureStarted = false;
let lastFiveFingerDetectedAt = 0;
let lastAutoCaptureAt = 0;
let fiveFingerStableStartedAt = 0;

let smoothedSmile = 0;
let smoothedFunny = 0;
let smoothedSerious = 0;
let lastExpressionLabel = "Datar";

let isRetakeMode = false;
let currentLoadedHistoryId = null;

// ===== TEMPLATE CONFIGS =====
const TEMPLATE_CONFIGS = {
    cute: {
        label: "Cute Pastel",
        titleText: "POSESNAP",
        footerText: "sweet photobooth ✦",
        start: "#fffefe",
        end: "#fff1f8",
        title: "#ff5cad",
        footer: "#cc4b90",
        slotBg: "#ffffff",
        slotBorder: "#ffabd1",
        stickers: [
            { text: "✨", x: 85, y: 70, size: 26, color: "#ff8ec6", rotate: -0.2 },
            { text: "💕", x: 810, y: 78, size: 24, color: "#ff70b8", rotate: 0.1 },
            { text: "♡", x: 95, y: 1460, size: 22, color: "#ff70b8", rotate: -0.1 },
            { text: "✦", x: 805, y: 1460, size: 22, color: "#ff8ec6", rotate: 0.1 }
        ]
    },

    starlove: {
        label: "Starry Love",
        titleText: "POSESNAP",
        footerText: "starry love moment ✦",
        start: "#fffdfd",
        end: "#fff0f8",
        title: "#f04ca2",
        footer: "#d04b8f",
        slotBg: "#ffffff",
        slotBorder: "#f78fc3",
        stickers: [
            { text: "✦", x: 80, y: 72, size: 24, color: "#ff7ebd", rotate: -0.1 },
            { text: "💗", x: 810, y: 74, size: 24, color: "#ff5eb0", rotate: 0.15 },
            { text: "✨", x: 130, y: 1410, size: 22, color: "#ff8ac5", rotate: 0.2 },
            { text: "♡", x: 770, y: 1410, size: 24, color: "#ff5eb0", rotate: -0.1 }
        ]
    },

    sakura: {
        label: "Sakura Bloom",
        titleText: "POSESNAP",
        footerText: "blooming memories 🌸",
        start: "#fffefe",
        end: "#fff6f8",
        title: "#df6f97",
        footer: "#b96b88",
        slotBg: "#ffffff",
        slotBorder: "#e9a9bd",
        stickers: [
            { text: "🌸", x: 84, y: 72, size: 24, color: "#e889a8", rotate: -0.2 },
            { text: "🍃", x: 805, y: 76, size: 22, color: "#67b685", rotate: 0.1 },
            { text: "✿", x: 120, y: 1415, size: 22, color: "#de7f9f", rotate: 0.1 },
            { text: "🌸", x: 780, y: 1415, size: 22, color: "#e889a8", rotate: -0.1 }
        ]
    },

    moonlight: {
        label: "Moonlight Pop",
        titleText: "POSESNAP",
        footerText: "moon glow vibes ☾",
        start: "#fbfaff",
        end: "#f3efff",
        title: "#7e5bef",
        footer: "#6e50d6",
        slotBg: "#ffffff",
        slotBorder: "#b39afc",
        stickers: [
            { text: "☾", x: 85, y: 70, size: 24, color: "#8c6df5", rotate: -0.2 },
            { text: "✦", x: 810, y: 75, size: 22, color: "#9a82f9", rotate: 0.2 },
            { text: "🌙", x: 110, y: 1410, size: 22, color: "#8c6df5", rotate: 0.1 },
            { text: "☆", x: 790, y: 1410, size: 22, color: "#9a82f9", rotate: -0.1 }
        ]
    },

    y2k: {
        label: "Y2K Pop",
        titleText: "POSESNAP",
        footerText: "retro shiny mood ✦",
        start: "#ffffff",
        end: "#f0fbff",
        title: "#27a4de",
        footer: "#4c8fc5",
        slotBg: "#ffffff",
        slotBorder: "#81d8ff",
        stickers: [
            { text: "✦", x: 86, y: 70, size: 22, color: "#32b0e8", rotate: -0.2 },
            { text: "★", x: 810, y: 75, size: 24, color: "#36b6f0", rotate: 0.1 },
            { text: "♡", x: 120, y: 1410, size: 22, color: "#ff78b5", rotate: 0.1 },
            { text: "✨", x: 780, y: 1410, size: 22, color: "#36b6f0", rotate: -0.1 }
        ]
    },

    noir: {
        label: "Noir Hearts",
        titleText: "POSESNAP",
        footerText: "dark mood photobooth",
        start: "#26222b",
        end: "#141219",
        title: "#ff8ac5",
        footer: "#f0b0d4",
        slotBg: "#1c1922",
        slotBorder: "#ff8ac5",
        stickers: [
            { text: "✦", x: 84, y: 72, size: 22, color: "#ff8ac5", rotate: -0.2 },
            { text: "🖤", x: 810, y: 76, size: 22, color: "#ffffff", rotate: 0.1 },
            { text: "♡", x: 120, y: 1410, size: 22, color: "#ff8ac5", rotate: 0.1 },
            { text: "🌙", x: 785, y: 1410, size: 22, color: "#e5d3e3", rotate: -0.1 }
        ]
    },

    bloom: {
        label: "Bloom Garden",
        titleText: "POSESNAP",
        footerText: "garden memory strip 🌼",
        start: "#ffffff",
        end: "#f1fff7",
        title: "#24a06d",
        footer: "#2f8a67",
        slotBg: "#ffffff",
        slotBorder: "#77d5ab",
        stickers: [
            { text: "🌼", x: 85, y: 72, size: 24, color: "#f0bf4e", rotate: -0.1 },
            { text: "🍃", x: 810, y: 75, size: 22, color: "#4dae78", rotate: 0.2 },
            { text: "🌷", x: 120, y: 1410, size: 22, color: "#e78fb0", rotate: 0.1 },
            { text: "❀", x: 785, y: 1410, size: 22, color: "#4dae78", rotate: -0.1 }
        ]
    },

    chrome: {
        label: "Chrome Love",
        titleText: "POSESNAP",
        footerText: "chrome love vibes",
        start: "#fafafc",
        end: "#ececf4",
        title: "#7f7f9a",
        footer: "#9b6c8d",
        slotBg: "#ffffff",
        slotBorder: "#b5b6c7",
        stickers: [
            { text: "✦", x: 85, y: 70, size: 22, color: "#8e8ea8", rotate: -0.1 },
            { text: "♡", x: 810, y: 75, size: 22, color: "#df8bb8", rotate: 0.1 },
            { text: "☆", x: 120, y: 1410, size: 22, color: "#8e8ea8", rotate: 0.1 },
            { text: "✧", x: 785, y: 1410, size: 22, color: "#df8bb8", rotate: -0.1 }
        ]
    },

    midnight: {
        label: "Midnight Kawaii",
        titleText: "POSESNAP",
        footerText: "midnight cute mood ✦",
        start: "#1d2335",
        end: "#0f1522",
        title: "#8fd9ff",
        footer: "#c2d9ff",
        slotBg: "#1c2333",
        slotBorder: "#8fd9ff",
        stickers: [
            { text: "🌙", x: 85, y: 72, size: 22, color: "#8fd9ff", rotate: -0.1 },
            { text: "⭐", x: 810, y: 75, size: 22, color: "#e4eaff", rotate: 0.1 },
            { text: "♡", x: 120, y: 1410, size: 22, color: "#b4c6ff", rotate: 0.1 },
            { text: "✨", x: 785, y: 1410, size: 22, color: "#8fd9ff", rotate: -0.1 }
        ]
    },

    daisy: {
        label: "Retro Daisy",
        titleText: "POSESNAP",
        footerText: "retro daisy day ✿",
        start: "#fffef6",
        end: "#fff6d7",
        title: "#d29216",
        footer: "#b07e1d",
        slotBg: "#ffffff",
        slotBorder: "#efc55a",
        stickers: [
            { text: "🌼", x: 85, y: 72, size: 24, color: "#e3b542", rotate: -0.1 },
            { text: "✦", x: 810, y: 75, size: 22, color: "#d29216", rotate: 0.1 },
            { text: "❀", x: 120, y: 1410, size: 22, color: "#d29216", rotate: 0.1 },
            { text: "🌼", x: 785, y: 1410, size: 22, color: "#e3b542", rotate: -0.1 }
        ]
    }
};

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
    loadAndRenderHistoryList();
    applyTemplateMeta();
});

// ===== CAMERA =====
async function startCamera() {
    try {
        suggestionText.textContent = "Menyiapkan kamera...";

        stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        video.srcObject = stream;

        await waitVideoReady();

        suggestionText.textContent = "Kamera aktif. Menyiapkan model AI...";

        await initMediaPipe();

        suggestionText.textContent = "Kamera dan model AI aktif. Tunjukkan 5 jari di samping wajah untuk auto capture.";

        startMediaPipeDetection();
    } catch (error) {
        console.error("ERROR DETAIL:", error);

        const messages = {
            NotAllowedError: "Izin kamera ditolak. Izinkan kamera di browser dulu.",
            PermissionDeniedError: "Izin kamera ditolak. Izinkan kamera di browser dulu.",
            NotFoundError: "Kamera tidak ditemukan.",
            DevicesNotFoundError: "Kamera tidak ditemukan.",
            NotReadableError: "Kamera sedang dipakai aplikasi lain.",
            TrackStartError: "Kamera sedang dipakai aplikasi lain."
        };

        const msg = messages[error.name] || "Terjadi error saat menjalankan kamera atau model AI. Cek console.";

        alert(msg);
        suggestionText.textContent = msg;
    }
}

function waitVideoReady() {
    return new Promise((resolve) => {
        if (video.readyState >= 2) {
            resolve();
            return;
        }

        video.onloadedmetadata = () => {
            video.play();
            resolve();
        };
    });
}

async function initMediaPipe() {
    if (faceLandmarker && handLandmarker) return;

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    if (!faceLandmarker) {
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
                delegate: "CPU"
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            minFaceDetectionConfidence: 0.55,
            minFacePresenceConfidence: 0.55,
            minTrackingConfidence: 0.55
        });
    }

    if (!handLandmarker) {
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
                delegate: "CPU"
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.55
        });
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        stream = null;
    }

    if (detectionAnimationId) {
        cancelAnimationFrame(detectionAnimationId);
        detectionAnimationId = null;
    }

    if (faceLandmarker) {
        faceLandmarker.close();
        faceLandmarker = null;
    }

    if (handLandmarker) {
        handLandmarker.close();
        handLandmarker = null;
    }

    lastVideoTime = -1;

    autoCaptureStarted = false;
    lastFiveFingerDetectedAt = 0;
    lastAutoCaptureAt = 0;
    fiveFingerStableStartedAt = 0;

    smoothedSmile = 0;
    smoothedFunny = 0;
    smoothedSerious = 0;
    lastExpressionLabel = "Datar";

    isPhotoboothRunning = false;
    isRetakeMode = false;

    expressionBadge.textContent = "Ekspresi: -";
    suggestionText.textContent = "Kamera dimatikan.";

    resetExpressionUI();
}

// ===== CAPTURE =====
function captureImageToData() {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
        alert("Kamera belum siap. Tunggu sebentar lalu coba lagi.");
        return null;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    return canvas.toDataURL("image/png");
}

// ===== COUNTDOWN =====
function runCountdown(seconds, onTick, onDone) {
    let count = seconds;

    countdown.style.display = "flex";
    countdown.textContent = count;

    const timer = setInterval(() => {
        count--;
        countdown.textContent = count;

        if (onTick) onTick(count);

        if (count === 0) {
            clearInterval(timer);
            countdown.style.display = "none";
            onDone();
        }
    }, 1000);

    return timer;
}

// ===== SINGLE PHOTO =====
function takePhoto() {
    if (!stream) {
        alert("Aktifkan kamera dulu yaa kak.");
        return;
    }

    if (isPhotoboothRunning || autoCaptureStarted || isRetakeMode) {
        alert("Sesi photobooth/countdown sedang berjalan.");
        return;
    }

    suggestionText.textContent = "Siap-siap, foto akan diambil!";

    runCountdown(COUNTDOWN_PHOTO, null, () => {
        const imageData = captureImageToData();

        if (!imageData) return;

        previewBox.innerHTML = `<img src="${imageData}" alt="Hasil Foto PoseSnap">`;
        suggestionText.textContent = "Foto berhasil diambil!";
    });
}

// ===== PHOTOBOOTH SESSION =====
function startPhotoboothSession() {
    if (!stream) {
        alert("Aktifkan kamera dulu yaa kak.");
        return;
    }

    if (isPhotoboothRunning || autoCaptureStarted || isRetakeMode) {
        alert("Sesi photobooth/countdown sedang berjalan.");
        return;
    }

    photoStripImages = [];
    isPhotoboothRunning = true;
    isRetakeMode = false;
    currentLoadedHistoryId = null;

    resetPhotoStrip();

    suggestionText.textContent = "Sesi photobooth dimulai. Siapkan pose terbaikmu!";

    runPhotoboothShot(1, 4);
}

function requestRetake(index) {
    if (!stream) {
        alert("Aktifkan kamera dulu untuk retake.");
        return;
    }

    if (isPhotoboothRunning || autoCaptureStarted || isRetakeMode) {
        alert("Sistem sedang sibuk, tunggu sebentar.");
        return;
    }

    if (!confirm(`Ingin mengambil ulang Foto ${index + 1}?`)) return;

    isRetakeMode = true;
    isPhotoboothRunning = true;

    suggestionText.textContent = `Siap-siap untuk mengambil ulang Foto ${index + 1}...`;

    runPhotoboothShot(index + 1, 4, index);
}

function runPhotoboothShot(currentShot, totalShot, targetIndex = null) {
    suggestionText.textContent = isRetakeMode
        ? `Retake Foto ${targetIndex + 1}. Siap-siap pose!`
        : `Foto ${currentShot} dari ${totalShot}. Siap-siap pose!`;

    runCountdown(COUNTDOWN_PHOTO, null, () => {
        const imageData = captureImageToData();

        if (!imageData) {
            isPhotoboothRunning = false;
            isRetakeMode = false;
            return;
        }

        previewBox.innerHTML = `<img src="${imageData}" alt="Hasil Foto PoseSnap">`;

        if (isRetakeMode && targetIndex !== null) {
            photoStripImages[targetIndex] = imageData;

            updatePhotoStrip();

            isPhotoboothRunning = false;
            isRetakeMode = false;

            if (currentLoadedHistoryId) {
                updateHistoryEntry(currentLoadedHistoryId);
                suggestionText.textContent = "Foto diganti! Riwayat berhasil diperbarui.";
            } else {
                suggestionText.textContent = "Foto berhasil diganti! Strip foto diperbarui.";
            }

            return;
        }

        photoStripImages.push(imageData);
        updatePhotoStrip();

        if (currentShot < totalShot) {
            suggestionText.textContent = `Foto ${currentShot} berhasil! Bersiap untuk foto berikutnya.`;
            setTimeout(() => runPhotoboothShot(currentShot + 1, totalShot), 900);
        } else {
            isPhotoboothRunning = false;

            saveSessionToHistory();
            loadAndRenderHistoryList();

            suggestionText.textContent = "Sesi selesai! Strip foto sudah disimpan ke riwayat. Hover foto di strip untuk retake.";
        }
    });
}

// ===== PHOTO STRIP UI =====
function updatePhotoStrip() {
    document.querySelectorAll(".strip-slot").forEach((slot, index) => {
        if (photoStripImages[index]) {
            slot.innerHTML = `
                <img src="${photoStripImages[index]}" alt="Foto ${index + 1}">
                <button class="retake-btn" onclick="requestRetake(${index})">
                    <span>↻</span> Retake
                </button>
            `;
        } else {
            slot.textContent = `Foto ${index + 1}`;
        }
    });
}

function resetPhotoStrip() {
    document.querySelectorAll(".strip-slot").forEach((slot, index) => {
        slot.textContent = `Foto ${index + 1}`;
    });
}

// ===== TEMPLATE =====
function getTemplateConfig(templateName = selectedTemplate) {
    return TEMPLATE_CONFIGS[templateName] || TEMPLATE_CONFIGS.cute;
}

function getTemplateColors() {
    return getTemplateConfig(selectedTemplate);
}

function getTemplateLabel(templateName) {
    return TEMPLATE_CONFIGS[templateName]?.label || templateName;
}

function applyTemplateMeta() {
    const strip = document.getElementById("photoStrip");

    if (!strip) return;

    const titleEl = strip.querySelector(".strip-title");
    const footerEl = strip.querySelector(".strip-footer");
    const config = getTemplateConfig();

    if (titleEl) titleEl.textContent = config.titleText || "POSESNAP";
    if (footerEl) footerEl.textContent = config.footerText || "photobooth moment ✦";
}

function changeStripTemplate(templateName) {
    selectedTemplate = templateName;

    const strip = document.getElementById("photoStrip");

    strip.classList.remove(...Object.keys(TEMPLATE_CONFIGS));
    strip.classList.add(templateName);

    document.querySelectorAll(".template-option").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.template === templateName);
    });

    applyTemplateMeta();

    if (currentLoadedHistoryId) {
        updateHistoryEntry(currentLoadedHistoryId);
        loadAndRenderHistoryList();
    }
}

// ===== DOWNLOAD =====
function downloadPhotoStrip() {
    if (photoStripImages.length < 4 || photoStripImages.some(p => !p)) {
        alert("Selesaikan sesi 4 foto dulu yaa kak (pastikan semua slot terisi).");
        return;
    }

    const stripCanvas = document.createElement("canvas");
    const ctx = stripCanvas.getContext("2d");

    const stripWidth = 900;
    const padding = 50;
    const gap = 30;
    const photoWidth = stripWidth - padding * 2;
    const photoHeight = Math.round((photoWidth * 3) / 4);
    const titleHeight = 110;
    const footerHeight = 95;

    stripCanvas.width = stripWidth;
    stripCanvas.height = padding + titleHeight + photoHeight * 4 + gap * 3 + footerHeight;

    const config = getTemplateColors();

    const gradient = ctx.createLinearGradient(0, 0, 0, stripCanvas.height);
    gradient.addColorStop(0, config.start);
    gradient.addColorStop(1, config.end);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);

    ctx.save();
    roundedRect(ctx, 18, 18, stripCanvas.width - 36, stripCanvas.height - 36, 34);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    drawTemplateDecorations(ctx, config);

    ctx.fillStyle = config.title;
    ctx.font = "800 46px Arial";
    ctx.textAlign = "center";
    ctx.fillText(config.titleText || "POSESNAP", stripWidth / 2, 78);

    let loaded = 0;
    const images = [];

    photoStripImages.forEach((src, index) => {
        const img = new Image();

        img.onload = () => {
            images[index] = img;
            loaded++;

            if (loaded === photoStripImages.length) {
                drawStrip();
            }
        };

        img.src = src;
    });

    function drawStrip() {
        let y = padding + titleHeight;

        images.forEach(img => {
            if (!img) return;

            drawPhotoFrame(ctx, padding, y, photoWidth, photoHeight, config);

            const innerPad = 10;

            ctx.save();
            roundedRect(
                ctx,
                padding + innerPad,
                y + innerPad,
                photoWidth - innerPad * 2,
                photoHeight - innerPad * 2,
                22
            );
            ctx.clip();

            ctx.drawImage(
                img,
                padding + innerPad,
                y + innerPad,
                photoWidth - innerPad * 2,
                photoHeight - innerPad * 2
            );

            ctx.restore();

            y += photoHeight + gap;
        });

        ctx.fillStyle = config.footer;
        ctx.font = "700 28px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
            config.footerText || "photobooth moment ✦",
            stripWidth / 2,
            stripCanvas.height - 38
        );

        const link = document.createElement("a");
        link.download = `posesnap-${selectedTemplate}-photobooth.png`;
        link.href = stripCanvas.toDataURL("image/png");
        link.click();
    }
}

function drawPhotoFrame(ctx, x, y, width, height, config) {
    ctx.save();

    roundedRect(ctx, x, y, width, height, 28);

    ctx.fillStyle = config.slotBg || "#ffffff";
    ctx.fill();

    ctx.strokeStyle = config.slotBorder || "#cccccc";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.restore();
}

function drawTemplateDecorations(ctx, config) {
    if (!config.stickers || !config.stickers.length) return;

    config.stickers.forEach(sticker => {
        ctx.save();

        ctx.translate(sticker.x, sticker.y);
        ctx.rotate(sticker.rotate || 0);

        ctx.fillStyle = sticker.color || "#000000";
        ctx.font = `700 ${sticker.size || 22}px "Apple Color Emoji", "Segoe UI Emoji", Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sticker.text, 0, 0);

        ctx.restore();
    });
}

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// ===== MEDIAPIPE DETECTION =====
function startMediaPipeDetection() {
    if (detectionAnimationId) {
        cancelAnimationFrame(detectionAnimationId);
    }

    detectLoop();
}

function detectLoop() {
    if (!stream || !faceLandmarker || !handLandmarker) return;

    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        const timestamp = performance.now();

        const faceResult = faceLandmarker.detectForVideo(video, timestamp);
        const handResult = handLandmarker.detectForVideo(video, timestamp);

        processExpressionResult(faceResult);
        processHandResult(handResult, faceResult);
    }

    detectionAnimationId = requestAnimationFrame(detectLoop);
}

// ===== EXPRESSION DETECTION =====
function processExpressionResult(result) {
    if (!result.faceBlendshapes?.length || !result.faceBlendshapes[0].categories) {
        if (!isPhotoboothRunning && !autoCaptureStarted && !isRetakeMode) {
            updateExpressionUI(0, 0, 0, "Tidak terdeteksi");
        }

        return;
    }

    const cats = result.faceBlendshapes[0].categories;

    const mouthSmileLeft = getScore(cats, "mouthSmileLeft");
    const mouthSmileRight = getScore(cats, "mouthSmileRight");
    const cheekSquintLeft = getScore(cats, "cheekSquintLeft");
    const cheekSquintRight = getScore(cats, "cheekSquintRight");

    const jawOpen = getScore(cats, "jawOpen");
    const mouthPucker = getScore(cats, "mouthPucker");
    const mouthFunnel = getScore(cats, "mouthFunnel");
    const mouthShrugUpper = getScore(cats, "mouthShrugUpper");
    const browDownLeft = getScore(cats, "browDownLeft");
    const browDownRight = getScore(cats, "browDownRight");

    const rawSmile = clamp(
        Math.round(
            (
                ((mouthSmileLeft + mouthSmileRight) / 2) * 0.78 +
                ((cheekSquintLeft + cheekSquintRight) / 2) * 0.22
            ) * 100
        ),
        0,
        100
    );

    const rawFunny = clamp(
        Math.round(
            Math.max(
                jawOpen * 0.9,
                mouthPucker * 0.85,
                mouthFunnel * 0.85,
                mouthShrugUpper * 0.65
            ) * 100
        ),
        0,
        100
    );

    const browSerious = ((browDownLeft + browDownRight) / 2) * 100;

    const rawSerious = clamp(
        Math.round(100 - Math.max(rawSmile, rawFunny) + browSerious * 0.22),
        0,
        100
    );

    smoothedSmile = smoothValue(smoothedSmile, rawSmile, EXPRESSION_SMOOTHING);
    smoothedFunny = smoothValue(smoothedFunny, rawFunny, EXPRESSION_SMOOTHING);
    smoothedSerious = smoothValue(smoothedSerious, rawSerious, EXPRESSION_SMOOTHING);

    const smile = Math.round(smoothedSmile);
    const funny = Math.round(smoothedFunny);
    const serious = Math.round(smoothedSerious);

    if (isPhotoboothRunning || autoCaptureStarted || isRetakeMode) {
        updateExpressionBarsOnly(smile, serious, funny);
        return;
    }

    updateExpressionUI(smile, serious, funny);
}

// ===== HAND GESTURE DETECTION =====
function processHandResult(result, faceResult = null) {
    if (isPhotoboothRunning || autoCaptureStarted || isRetakeMode) return;

    if (!result.landmarks?.length) {
        lastFiveFingerDetectedAt = 0;
        fiveFingerStableStartedAt = 0;
        return;
    }

    const landmarks = result.landmarks[0];
    const handednessData = result.handedness?.[0]?.[0];
    const handScore = handednessData?.score ?? 1;

    if (handScore < GESTURE_MIN_HAND_SCORE) {
        lastFiveFingerDetectedAt = 0;
        fiveFingerStableStartedAt = 0;
        return;
    }

    const handBox = getLandmarkBox(landmarks);
    const handSize = Math.max(handBox.width, handBox.height);

    if (handSize < HAND_MIN_SIZE) {
        fiveFingerStableStartedAt = 0;
        expressionBadge.textContent = "Gesture: Tangan kurang jelas";
        suggestionText.textContent = "Dekatkan tangan sedikit ke kamera, lalu buka 5 jari.";
        return;
    }

    const fingers = countOpenFingersStable(landmarks);
    const handSpreadRatio = getHandSpreadRatio(landmarks);
    const faceBox = getFaceBoxFromResult(faceResult);
    const palmCenter = getPalmCenter(landmarks);

    const overlapWithFace = faceBox ? getBoxOverlapRatio(handBox, faceBox) : 0;

    const nearFaceCenter = faceBox
        ? isPointNearBoxCenter(palmCenter, faceBox, HAND_FACE_CENTER_BLOCK_RADIUS)
        : false;

    const mouthCenter = getMouthCenterFromFaceResult(faceResult);

    const nearMouth = mouthCenter
        ? landmarkDistance2D(palmCenter, mouthCenter) < HAND_MOUTH_BLOCK_RADIUS
        : false;

    const isPalmCoveringMouth =
        fingers >= 4 &&
        faceBox &&
        (
            overlapWithFace > HAND_MAX_FACE_OVERLAP ||
            nearFaceCenter ||
            nearMouth
        );

    if (isPalmCoveringMouth) {
        lastFiveFingerDetectedAt = 0;
        fiveFingerStableStartedAt = 0;
        expressionBadge.textContent = "Gesture: Tangan menutupi wajah";
        suggestionText.textContent = "Jauhkan tangan dari area mulut/wajah agar tidak terdeteksi sebagai 5 jari.";
        return;
    }

    const isFiveFinger =
        fingers >= 5 &&
        handSpreadRatio >= HAND_SPREAD_MIN_RATIO;

    const now = Date.now();

    if (!isFiveFinger) {
        fiveFingerStableStartedAt = 0;
        return;
    }

    if (now - lastAutoCaptureAt < GESTURE_COOLDOWN_MS) {
        fiveFingerStableStartedAt = 0;
        return;
    }

    if (fiveFingerStableStartedAt === 0) {
        fiveFingerStableStartedAt = now;
    }

    const holdDuration = now - fiveFingerStableStartedAt;
    const remainingMs = Math.max(FIVE_FINGER_HOLD_MS - holdDuration, 0);

    if (holdDuration < FIVE_FINGER_HOLD_MS) {
        expressionBadge.textContent = "Gesture: Menunggu stabil";
        suggestionText.textContent = `Tahan 5 jari selama ${Math.ceil(remainingMs / 1000)} detik lagi.`;
        return;
    }

    expressionBadge.textContent = "Gesture: 5 Jari Stabil";
    suggestionText.textContent = "5 jari stabil terdeteksi. Countdown otomatis akan dimulai.";

    lastAutoCaptureAt = now;
    lastFiveFingerDetectedAt = now;
    fiveFingerStableStartedAt = 0;

    startAutoCaptureByHand();
}

function countOpenFingersStable(landmarks) {
    const wrist = landmarks[0];

    const fingers = [
        { tip: 4, pip: 3, mcp: 2, threshold: 1.12, pastMcp: 1.24 },
        { tip: 8, pip: 6, mcp: 5, threshold: 1.18, pastMcp: 1.24 },
        { tip: 12, pip: 10, mcp: 9, threshold: 1.18, pastMcp: 1.24 },
        { tip: 16, pip: 14, mcp: 13, threshold: 1.16, pastMcp: 1.22 },
        { tip: 20, pip: 18, mcp: 17, threshold: 1.14, pastMcp: 1.20 }
    ];

    let count = 0;

    fingers.forEach(finger => {
        const tip = landmarks[finger.tip];
        const pip = landmarks[finger.pip];
        const mcp = landmarks[finger.mcp];

        const wristToTip = landmarkDistance(wrist, tip);
        const wristToPip = landmarkDistance(wrist, pip);
        const wristToMcp = landmarkDistance(wrist, mcp);

        const fingerLength = landmarkDistance(mcp, tip);
        const foldedLength = landmarkDistance(mcp, pip);

        const isFarFromWrist = wristToTip > wristToPip * finger.threshold;
        const isLongEnough = fingerLength > foldedLength * 1.12;
        const isPastMcp = wristToTip > wristToMcp * finger.pastMcp;

        if (isFarFromWrist && isLongEnough && isPastMcp) {
            count++;
        }
    });

    return count;
}

function startAutoCaptureByHand() {
    if (autoCaptureStarted || isPhotoboothRunning || isRetakeMode) return;

    autoCaptureStarted = true;
    fiveFingerStableStartedAt = 0;

    expressionBadge.textContent = "Gesture: 5 Jari";
    suggestionText.textContent = `5 jari terdeteksi! Foto otomatis dalam ${COUNTDOWN_GESTURE} detik.`;

    runCountdown(COUNTDOWN_GESTURE, null, () => {
        const imageData = captureImageToData();

        if (imageData) {
            previewBox.innerHTML = `<img src="${imageData}" alt="Hasil Foto PoseSnap">`;
        }

        setTimeout(() => {
            autoCaptureStarted = false;
            lastFiveFingerDetectedAt = 0;
            fiveFingerStableStartedAt = 0;

            if (stream) {
                suggestionText.textContent = "Tunjukkan 5 jari lagi di samping wajah untuk auto capture berikutnya.";
            }
        }, 2500);
    });
}

// ===== LANDMARK HELPERS =====
function landmarkDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = (a.z || 0) - (b.z || 0);

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function landmarkDistance2D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return Math.sqrt(dx * dx + dy * dy);
}

function getLandmarkBox(landmarks) {
    const xs = landmarks.map(point => point.x);
    const ys = landmarks.map(point => point.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    };
}

function getBoxOverlapRatio(boxA, boxB) {
    const overlapX = Math.max(0, Math.min(boxA.maxX, boxB.maxX) - Math.max(boxA.minX, boxB.minX));
    const overlapY = Math.max(0, Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY));
    const overlapArea = overlapX * overlapY;

    const boxAArea = Math.max(boxA.width * boxA.height, 0.0001);

    return overlapArea / boxAArea;
}

function isPointNearBoxCenter(point, box, radius) {
    const boxCenter = {
        x: box.centerX,
        y: box.centerY
    };

    return landmarkDistance2D(point, boxCenter) < radius;
}

function getPalmCenter(landmarks) {
    const ids = [0, 5, 9, 13, 17];

    const total = ids.reduce((acc, id) => {
        acc.x += landmarks[id].x;
        acc.y += landmarks[id].y;
        acc.z += landmarks[id].z || 0;
        return acc;
    }, { x: 0, y: 0, z: 0 });

    return {
        x: total.x / ids.length,
        y: total.y / ids.length,
        z: total.z / ids.length
    };
}

function getHandSpreadRatio(landmarks) {
    const thumbTip = landmarks[4];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];

    const thumbToPinky = landmarkDistance2D(thumbTip, pinkyTip);
    const palmLength = landmarkDistance2D(wrist, middleMcp);

    return thumbToPinky / Math.max(palmLength, 0.0001);
}

function getFaceBoxFromResult(faceResult) {
    const faceLandmarks = faceResult?.faceLandmarks?.[0];

    if (!faceLandmarks?.length) return null;

    return getLandmarkBox(faceLandmarks);
}

function getMouthCenterFromFaceResult(faceResult) {
    const faceLandmarks = faceResult?.faceLandmarks?.[0];

    if (!faceLandmarks?.length) return null;

    const mouthIds = [13, 14, 78, 308];

    const validPoints = mouthIds
        .map(id => faceLandmarks[id])
        .filter(Boolean);

    if (!validPoints.length) return null;

    const total = validPoints.reduce((acc, point) => {
        acc.x += point.x;
        acc.y += point.y;
        return acc;
    }, { x: 0, y: 0 });

    return {
        x: total.x / validPoints.length,
        y: total.y / validPoints.length
    };
}

// ===== EXPRESSION UI HELPERS =====
function getScore(categories, name) {
    return categories.find(c => c.categoryName === name)?.score ?? 0;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function smoothValue(previous, current, factor = 0.3) {
    return previous + (current - previous) * factor;
}

function updateExpressionBarsOnly(smile, serious, funny) {
    document.getElementById("smileValue").textContent = smile + "%";
    document.getElementById("seriousValue").textContent = serious + "%";
    document.getElementById("funnyValue").textContent = funny + "%";

    document.getElementById("smileBar").style.width = smile + "%";
    document.getElementById("seriousBar").style.width = serious + "%";
    document.getElementById("funnyBar").style.width = funny + "%";
}

function updateExpressionUI(smile, serious, funny, forcedExpression = null) {
    updateExpressionBarsOnly(smile, serious, funny);

    let expression;
    let suggestion;

    if (forcedExpression) {
        expression = forcedExpression;
        suggestion = "Arahkan wajah ke kamera dengan pencahayaan yang cukup.";
    } else {
        const maxValue = Math.max(smile, serious, funny);

        if (maxValue < 28) {
            expression = lastExpressionLabel || "Datar";
        } else if (smile >= 42 && smile >= funny + 5) {
            expression = "Senyum";
        } else if (funny >= 42 && funny > smile + 5) {
            expression = "Ekspresi Lucu";
        } else if (serious >= 55 && smile < 38 && funny < 38) {
            expression = "Serius";
        } else {
            expression = lastExpressionLabel || "Datar";
        }

        lastExpressionLabel = expression;

        if (expression === "Senyum") {
            suggestion = "Senyum terdeteksi stabil. Cocok untuk foto ceria dan santai.";
        } else if (expression === "Ekspresi Lucu") {
            suggestion = "Ekspresi lucu terdeteksi. Cocok untuk foto fun dan photobooth.";
        } else if (expression === "Serius") {
            suggestion = "Ekspresi serius terdeteksi. Cocok untuk foto cool dan dramatic.";
        } else {
            suggestion = "Ekspresi datar terdeteksi. Coba senyum atau buat pose lucu.";
        }
    }

    expressionBadge.textContent = "Ekspresi: " + expression;
    suggestionText.textContent = suggestion;
}

function resetExpressionUI() {
    ["smileValue", "seriousValue", "funnyValue"].forEach(id => {
        document.getElementById(id).textContent = "0%";
    });

    ["smileBar", "seriousBar", "funnyBar"].forEach(id => {
        document.getElementById(id).style.width = "0%";
    });
}

// ===== HISTORY LOCAL STORAGE =====
function getHistory() {
    const raw = localStorage.getItem(STORAGE_KEY);

    return raw ? JSON.parse(raw) : [];
}

function setHistory(historyArray) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(historyArray));
    } catch (e) {
        console.error("Gagal menyimpan ke localStorage:", e);

        if (e.name === "QuotaExceededError") {
            alert("Memori riwayat browser penuh. Coba hapus beberapa riwayat lama.");
        }
    }
}

function saveSessionToHistory() {
    if (photoStripImages.length < 4) return;

    const history = getHistory();

    const newEntry = {
        id: "posesnap_" + Date.now(),
        timestamp: new Date().toISOString(),
        template: selectedTemplate,
        photos: [...photoStripImages]
    };

    history.unshift(newEntry);

    if (history.length > HISTORY_MAX) {
        history.length = HISTORY_MAX;
    }

    setHistory(history);
}

function updateHistoryEntry(historyId) {
    const history = getHistory();
    const index = history.findIndex(e => e.id === historyId);

    if (index !== -1) {
        history[index].template = selectedTemplate;
        history[index].photos = [...photoStripImages];
        history[index].lastUpdated = new Date().toISOString();

        setHistory(history);
    }
}

// ===== HISTORY UI =====
function loadAndRenderHistoryList() {
    const historyList = document.getElementById("historyList");
    const clearBtn = document.getElementById("clearHistoryBtn");
    const history = getHistory();

    historyList.innerHTML = "";

    if (history.length === 0) {
        historyList.innerHTML = `<p class="no-history-text">Belum ada riwayat sesi foto.</p>`;
        clearBtn.style.display = "none";
        return;
    }

    clearBtn.style.display = "block";

    history.forEach(entry => {
        const date = new Date(entry.timestamp);

        const formattedDate = date.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });

        const formattedTime = date.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit"
        });

        const templateLabel = getTemplateLabel(entry.template);

        const item = document.createElement("div");

        item.className = "history-item" + (entry.id === currentLoadedHistoryId ? " active" : "");

        item.innerHTML = `
            <div onclick="loadHistoryEntry('${entry.id}')">
                <strong>${formattedDate}, ${formattedTime}</strong>
                <small>Template: ${templateLabel}</small>
            </div>

            <button
                class="btn-danger-sm"
                onclick="deleteHistoryEntry('${entry.id}', event)"
                title="Hapus sesi ini"
            >
                ×
            </button>
        `;

        historyList.appendChild(item);
    });
}

function loadHistoryEntry(historyId) {
    if (isPhotoboothRunning || autoCaptureStarted || isRetakeMode) {
        alert("Selesaikan sesi photobooth atau retake yang sedang berjalan dulu.");
        return;
    }

    const history = getHistory();
    const entry = history.find(e => e.id === historyId);

    if (!entry) {
        alert("Sesi riwayat tidak ditemukan.");
        return;
    }

    photoStripImages = [...entry.photos];
    currentLoadedHistoryId = historyId;

    updatePhotoStrip();
    changeStripTemplate(entry.template);
    loadAndRenderHistoryList();

    previewBox.innerHTML = `
        <p style="padding:20px;text-align:center;color:#718096">
            Sesi riwayat dimuat. Klik pada slot foto untuk Retake, atau pilih template berbeda.
        </p>
    `;

    suggestionText.textContent = "Sesi riwayat dimuat. Kamu bisa unduh ulang atau mengganti salah satu foto di strip.";
}

function deleteHistoryEntry(historyId, event) {
    event.stopPropagation();

    if (!confirm("Hapus sesi foto ini dari riwayat?")) return;

    const history = getHistory().filter(e => e.id !== historyId);

    setHistory(history);

    if (currentLoadedHistoryId === historyId) {
        currentLoadedHistoryId = null;
        photoStripImages = [];

        resetPhotoStrip();

        previewBox.innerHTML = "Hasil foto terakhir akan muncul di sini";
    }

    loadAndRenderHistoryList();
}

function clearAllHistory() {
    if (!confirm("Hapus SELURUH riwayat sesi foto? Tindakan ini tidak bisa dibatalkan.")) return;

    localStorage.removeItem(STORAGE_KEY);

    currentLoadedHistoryId = null;
    photoStripImages = [];

    resetPhotoStrip();

    previewBox.innerHTML = "Hasil foto terakhir akan muncul di sini";

    loadAndRenderHistoryList();
}

// ===== GLOBAL EXPOSE =====
Object.assign(window, {
    startCamera,
    stopCamera,
    takePhoto,
    startPhotoboothSession,
    changeStripTemplate,
    downloadPhotoStrip,
    requestRetake,
    loadHistoryEntry,
    deleteHistoryEntry,
    loadAndRenderHistoryList,
    clearAllHistory
});