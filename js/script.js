import {
    FaceLandmarker,
    HandLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const previewBox = document.getElementById("previewBox");
const countdown = document.getElementById("countdown");
const expressionBadge = document.getElementById("expressionBadge");
const suggestionText = document.getElementById("suggestionText");

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

        suggestionText.textContent =
            "Kamera dan model AI aktif. Tunjukkan 5 jari untuk auto capture.";

        startMediaPipeDetection();
    } catch (error) {
        console.error("ERROR DETAIL:", error);

        if (
            error.name === "NotAllowedError" ||
            error.name === "PermissionDeniedError"
        ) {
            alert("Izin kamera ditolak. Izinkan kamera di browser dulu.");
            suggestionText.textContent = "Izin kamera ditolak.";
        } else if (
            error.name === "NotFoundError" ||
            error.name === "DevicesNotFoundError"
        ) {
            alert("Kamera tidak ditemukan.");
            suggestionText.textContent = "Kamera tidak ditemukan.";
        } else if (
            error.name === "NotReadableError" ||
            error.name === "TrackStartError"
        ) {
            alert("Kamera sedang dipakai aplikasi lain.");
            suggestionText.textContent = "Kamera sedang dipakai aplikasi lain.";
        } else {
            alert("Terjadi error saat menjalankan kamera atau model AI. Cek console.");
            suggestionText.textContent =
                "Error kamera/model AI. Buka Inspect > Console untuk detail.";
        }
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
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
                delegate: "CPU"
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true
        });
    }

    if (!handLandmarker) {
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
                delegate: "CPU"
            },
            runningMode: "VIDEO",
            numHands: 1
        });
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
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
    isPhotoboothRunning = false;

    expressionBadge.textContent = "Ekspresi: -";
    suggestionText.textContent = "Kamera dimatikan.";

    resetExpressionUI();
}

function takePhoto() {
    if (!stream) {
        alert("Aktifkan kamera dulu bud.");
        return;
    }

    if (isPhotoboothRunning || autoCaptureStarted) {
        alert("Sesi photobooth/countdown sedang berjalan.");
        return;
    }

    startSinglePhotoCountdown(3, "Siap-siap, foto akan diambil!");
}

function startSinglePhotoCountdown(startCount = 3, message = "Siap-siap, foto akan diambil!") {
    let count = startCount;

    countdown.style.display = "flex";
    countdown.textContent = count;

    suggestionText.textContent = message;

    const timer = setInterval(() => {
        count--;
        countdown.textContent = count;

        if (count === 0) {
            clearInterval(timer);
            countdown.style.display = "none";

            captureImage();
        }
    }, 1000);
}

function captureImage() {
    const imageData = captureImageToData();

    if (!imageData) return;

    previewBox.innerHTML = `<img src="${imageData}" alt="Hasil Foto PoseSnap">`;
    suggestionText.textContent = "Foto berhasil diambil!";
}

function captureImageToData() {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
        alert("Kamera belum siap. Tunggu sebentar lalu coba lagi.");
        return null;
    }

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);
    context.restore();

    return canvas.toDataURL("image/png");
}

function startPhotoboothSession() {
    if (!stream) {
        alert("Aktifkan kamera dulu bud.");
        return;
    }

    if (isPhotoboothRunning || autoCaptureStarted) {
        alert("Sesi photobooth/countdown sedang berjalan.");
        return;
    }

    photoStripImages = [];
    isPhotoboothRunning = true;

    resetPhotoStrip();

    suggestionText.textContent = "Sesi photobooth dimulai. Siapkan pose terbaikmu!";

    runPhotoboothShot(1, 4);
}

function runPhotoboothShot(currentShot, totalShot) {
    let count = 3;

    countdown.style.display = "flex";
    countdown.textContent = count;

    suggestionText.textContent = `Foto ${currentShot} dari ${totalShot}. Siap-siap pose!`;

    const timer = setInterval(() => {
        count--;
        countdown.textContent = count;

        if (count === 0) {
            clearInterval(timer);
            countdown.style.display = "none";

            const imageData = captureImageToData();

            if (!imageData) {
                isPhotoboothRunning = false;
                return;
            }

            photoStripImages.push(imageData);
            updatePhotoStrip();

            previewBox.innerHTML = `<img src="${imageData}" alt="Hasil Foto PoseSnap">`;

            if (currentShot < totalShot) {
                suggestionText.textContent = `Foto ${currentShot} berhasil! Bersiap untuk foto berikutnya.`;

                setTimeout(() => {
                    runPhotoboothShot(currentShot + 1, totalShot);
                }, 900);
            } else {
                isPhotoboothRunning = false;
                suggestionText.textContent = "Sesi selesai! Strip foto sudah jadi.";
            }
        }
    }, 1000);
}

function updatePhotoStrip() {
    const slots = document.querySelectorAll(".strip-slot");

    slots.forEach((slot, index) => {
        if (photoStripImages[index]) {
            slot.innerHTML = `<img src="${photoStripImages[index]}" alt="Foto ${index + 1}">`;
        } else {
            slot.textContent = `Foto ${index + 1}`;
        }
    });
}

function resetPhotoStrip() {
    const slots = document.querySelectorAll(".strip-slot");

    slots.forEach((slot, index) => {
        slot.textContent = `Foto ${index + 1}`;
    });
}

function changeStripTemplate(templateName) {
    const photoStrip = document.getElementById("photoStrip");
    const templateButtons = document.querySelectorAll(".template-option");

    selectedTemplate = templateName;

    photoStrip.classList.remove("cute", "blue", "peach", "mint", "purple");
    photoStrip.classList.add(templateName);

    templateButtons.forEach((button) => {
        button.classList.remove("active");

        if (button.dataset.template === templateName) {
            button.classList.add("active");
        }
    });
}

function getTemplateColors() {
    const templates = {
        cute: {
            start: "#ffffff",
            end: "#fff0f8",
            title: "#ff5cad",
            footer: "#c94c91"
        },
        blue: {
            start: "#ffffff",
            end: "#eefaff",
            title: "#2387ff",
            footer: "#3a88c8"
        },
        peach: {
            start: "#ffffff",
            end: "#fff4ec",
            title: "#ff8a4c",
            footer: "#c96f3c"
        },
        mint: {
            start: "#ffffff",
            end: "#effff9",
            title: "#19b987",
            footer: "#189b74"
        },
        purple: {
            start: "#ffffff",
            end: "#f6efff",
            title: "#8b5cf6",
            footer: "#7c3aed"
        }
    };

    return templates[selectedTemplate] || templates.cute;
}

function downloadPhotoStrip() {
    if (photoStripImages.length < 4) {
        alert("Selesaikan sesi 4 foto dulu bud.");
        return;
    }

    const stripCanvas = document.createElement("canvas");
    const ctx = stripCanvas.getContext("2d");

    const stripWidth = 900;
    const padding = 50;
    const gap = 32;
    const photoWidth = stripWidth - padding * 2;
    const photoHeight = Math.round((photoWidth * 3) / 4);
    const titleHeight = 90;
    const footerHeight = 80;

    stripCanvas.width = stripWidth;
    stripCanvas.height =
        padding + titleHeight + photoHeight * 4 + gap * 3 + footerHeight;

    const templateColors = getTemplateColors();

    const gradient = ctx.createLinearGradient(0, 0, 0, stripCanvas.height);
    gradient.addColorStop(0, templateColors.start);
    gradient.addColorStop(1, templateColors.end);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);

    ctx.fillStyle = templateColors.title;
    ctx.font = "800 48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("POSESNAP", stripWidth / 2, 70);

    let loadedImages = 0;
    const images = [];

    photoStripImages.forEach((src, index) => {
        const img = new Image();

        img.onload = () => {
            images[index] = img;
            loadedImages++;

            if (loadedImages === photoStripImages.length) {
                drawStripImages();
            }
        };

        img.src = src;
    });

    function drawStripImages() {
        let y = padding + titleHeight;

        images.forEach((img) => {
            ctx.save();

            roundedRect(ctx, padding, y, photoWidth, photoHeight, 28);
            ctx.clip();

            ctx.drawImage(img, padding, y, photoWidth, photoHeight);

            ctx.restore();

            y += photoHeight + gap;
        });

        ctx.fillStyle = templateColors.footer;
        ctx.font = "700 28px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
            "photobooth moment ✦",
            stripWidth / 2,
            stripCanvas.height - 36
        );

        const link = document.createElement("a");
        link.download = `posesnap-${selectedTemplate}-photobooth.png`;
        link.href = stripCanvas.toDataURL("image/png");
        link.click();
    }
}

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - radius,
        y + height
    );
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

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
        processExpressionResult(faceResult);

        const handResult = handLandmarker.detectForVideo(video, timestamp);
        processHandResult(handResult);
    }

    detectionAnimationId = requestAnimationFrame(detectLoop);
}

function processExpressionResult(result) {
    if (
        !result.faceBlendshapes ||
        result.faceBlendshapes.length === 0 ||
        !result.faceBlendshapes[0].categories
    ) {
        if (!isPhotoboothRunning && !autoCaptureStarted) {
            updateExpressionUI(0, 0, 0, "Tidak terdeteksi");
        }

        return;
    }

    const categories = result.faceBlendshapes[0].categories;

    const smileLeft = getBlendshapeScore(categories, "mouthSmileLeft");
    const smileRight = getBlendshapeScore(categories, "mouthSmileRight");
    const jawOpen = getBlendshapeScore(categories, "jawOpen");
    const mouthPucker = getBlendshapeScore(categories, "mouthPucker");
    const mouthFunnel = getBlendshapeScore(categories, "mouthFunnel");

    const smileScore = ((smileLeft + smileRight) / 2) * 100;
    const funnyScore = Math.max(jawOpen, mouthPucker, mouthFunnel) * 100;

    let smile = Math.round(smileScore);
    let funny = Math.round(funnyScore);
    let serious = 100 - Math.max(smile, funny);

    smile = clamp(smile, 0, 100);
    funny = clamp(funny, 0, 100);
    serious = clamp(serious, 0, 100);

    if (isPhotoboothRunning || autoCaptureStarted) {
        updateExpressionBarsOnly(smile, serious, funny);
        return;
    }

    updateExpressionUI(smile, serious, funny);
}

function processHandResult(result) {
    if (isPhotoboothRunning || autoCaptureStarted) return;

    if (!result.landmarks || result.landmarks.length === 0) {
        return;
    }

    const landmarks = result.landmarks[0];
    const handedness = result.handedness?.[0]?.[0]?.categoryName || "Right";
    const fingers = countOpenFingers(landmarks, handedness);

    if (fingers === 5) {
        const now = Date.now();

        if (now - lastFiveFingerDetectedAt < 1200) {
            startAutoCaptureByHand();
        } else {
            lastFiveFingerDetectedAt = now;
            expressionBadge.textContent = "Gesture: 5 Jari";
            suggestionText.textContent =
                "5 jari terdeteksi. Tahan sebentar untuk mulai countdown otomatis.";
        }
    } else {
        lastFiveFingerDetectedAt = 0;
    }
}

function countOpenFingers(landmarks, handedness) {
    let count = 0;

    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];

    const indexTip = landmarks[8];
    const indexPip = landmarks[6];

    const middleTip = landmarks[12];
    const middlePip = landmarks[10];

    const ringTip = landmarks[16];
    const ringPip = landmarks[14];

    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    if (handedness === "Right") {
        if (thumbTip.x < thumbIp.x) count++;
    } else {
        if (thumbTip.x > thumbIp.x) count++;
    }

    if (indexTip.y < indexPip.y) count++;
    if (middleTip.y < middlePip.y) count++;
    if (ringTip.y < ringPip.y) count++;
    if (pinkyTip.y < pinkyPip.y) count++;

    return count;
}

function startAutoCaptureByHand() {
    autoCaptureStarted = true;

    let count = 5;

    countdown.style.display = "flex";
    countdown.textContent = count;

    expressionBadge.textContent = "Gesture: 5 Jari";
    suggestionText.textContent = "5 jari terdeteksi! Foto otomatis dalam 5 detik.";

    const timer = setInterval(() => {
        count--;
        countdown.textContent = count;

        if (count === 0) {
            clearInterval(timer);
            countdown.style.display = "none";

            captureImage();

            setTimeout(() => {
                autoCaptureStarted = false;
                lastFiveFingerDetectedAt = 0;

                if (stream) {
                    suggestionText.textContent =
                        "Tunjukkan 5 jari lagi untuk auto capture berikutnya.";
                }
            }, 2500);
        }
    }, 1000);
}

function getBlendshapeScore(categories, name) {
    const item = categories.find((category) => category.categoryName === name);
    return item ? item.score : 0;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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

    let expression = "Tidak terdeteksi";
    let suggestion = "Arahkan wajah ke kamera dengan pencahayaan yang cukup.";

    if (forcedExpression) {
        expression = forcedExpression;
    } else if (smile >= 45 && smile >= funny) {
        expression = "Senyum";
        suggestion = "Senyum terdeteksi. Cocok untuk foto ceria dan santai.";
    } else if (funny >= 45 && funny > smile) {
        expression = "Ekspresi Lucu";
        suggestion = "Ekspresi lucu terdeteksi. Cocok untuk foto fun dan photobooth.";
    } else {
        expression = "Datar";
        suggestion =
            "Ekspresi datar terdeteksi. Coba senyum sedikit kalau ingin hasil lebih ceria.";
    }

    expressionBadge.textContent = "Ekspresi: " + expression;
    suggestionText.textContent = suggestion;
}

function resetExpressionUI() {
    document.getElementById("smileValue").textContent = "0%";
    document.getElementById("seriousValue").textContent = "0%";
    document.getElementById("funnyValue").textContent = "0%";

    document.getElementById("smileBar").style.width = "0%";
    document.getElementById("seriousBar").style.width = "0%";
    document.getElementById("funnyBar").style.width = "0%";
}

window.startCamera = startCamera;
window.stopCamera = stopCamera;
window.takePhoto = takePhoto;
window.startPhotoboothSession = startPhotoboothSession;
window.changeStripTemplate = changeStripTemplate;
window.downloadPhotoStrip = downloadPhotoStrip;