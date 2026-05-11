// audio.js - Ultrasonic Sonar Logic (20kHz - Accumulation Mode v2.60)

let audioCtx = null;
let oscillator = null;
let analyzer = null;

const TARGET_FREQ = 20000;   // תדר אולטרסוני — ללא שינוי
const REQUIRED_MS = 800;     // יעד צבירה אקוסטית: 0.8 שניות
const DETECTION_WINDOW = 10000; // חלון זמן פעיל: 10 שניות
const FFT_SIZE = 4096;       // רזולוציית תדר גבוהה
const INTENSITY_THRESHOLD = 40; // סף עוצמה לזיהוי

/**
 * אתחול ה-AudioContext (חובה לאחר אינטראקציה ראשונה)
 */
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

/**
 * שוטר: שידור סיגנל אולטרסוני למשך 10 שניות
 */
function broadcastCapture() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // ניקוי oscillator קודם אם קיים
    if (oscillator) {
        try { oscillator.stop(); } catch(e) {}
        oscillator = null;
    }

    oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(TARGET_FREQ, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime); // ללא clipping

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();

    setTimeout(() => {
        if (oscillator) {
            try {
                oscillator.stop();
                oscillator.disconnect();
            } catch(e) {}
            oscillator = null;
        }
        gainNode.disconnect();
    }, DETECTION_WINDOW);
}

/**
 * גנב: האזנה אקטיבית עם צבירת זמן (Accumulation Mode)
 * @param {Function} onCaught - מופעלת כאשר הצבירה מגיעה ל-REQUIRED_MS
 */
async function startListeningForCops(onCaught) {
    initAudio();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        if (audioCtx.state === 'suspended') audioCtx.resume();

        const source = audioCtx.createMediaStreamSource(stream);
        const localAnalyzer = audioCtx.createAnalyser();
        localAnalyzer.fftSize = FFT_SIZE;
        source.connect(localAnalyzer);

        // שמירה גלובלית לצורך ניקוי חיצוני במידת הצורך
        analyzer = localAnalyzer;

        const dataArray = new Uint8Array(localAnalyzer.frequencyBinCount);

        // מונה צבירה — לא מתאפס כשהאות נפסק
        let accumulatedTimeMs = 0;
        let lastFrameTime = performance.now();
        let finished = false;

        // חישוב מיקום התדר במערך ה-FFT
        const binIndex = Math.round(TARGET_FREQ / (audioCtx.sampleRate / FFT_SIZE));

        function checkFrame() {
            if (finished || !analyzer) return;

            const now = performance.now();
            const delta = now - lastFrameTime;
            lastFrameTime = now;

            localAnalyzer.getByteFrequencyData(dataArray);
            const intensity = dataArray[binIndex];

            if (intensity > INTENSITY_THRESHOLD) {
                // אות זוהה — צובר זמן
                accumulatedTimeMs += delta;

                if (accumulatedTimeMs >= REQUIRED_MS) {
                    finished = true;
                    onCaught();
                    stopMic(stream, source, localAnalyzer);
                    return;
                }
            }
            // אם האות נעלם — לא מאפסים, פשוט לא מוסיפים

            requestAnimationFrame(checkFrame);
        }

        updateAudioStatus(true);
        checkFrame();

        // כיבוי בסוף חלון הזמן אם לא הגענו ליעד
        setTimeout(() => {
            if (!finished) {
                finished = true;
                console.log("Acoustic window ended — target not reached.");
                stopMic(stream, source, localAnalyzer);
            }
        }, DETECTION_WINDOW);

    } catch (err) {
        console.error("Acoustic Detection Error:", err);
        updateAudioStatus(false, true);
    }
}

/**
 * עצירת מיקרופון וניתוק מלא של כל הצמתים
 */
function stopMic(stream, source, localAnalyzer) {
    try {
        if (source) source.disconnect();
        if (localAnalyzer) localAnalyzer.disconnect();
    } catch(e) {}

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    analyzer = null;
    updateAudioStatus(false);
}

function updateAudioStatus(active, error = false) {
    const el = document.getElementById('audio-status');
    if (!el) return;

    if (error) {
        el.innerText = "שגיאת שמע ❌";
        el.style.color = "#ef4444";
    } else if (active) {
        el.innerText = "מיקרופון ✅";
        el.style.color = "#10b981";
    } else {
        el.innerText = "אודיו ⏳";
        el.style.color = "#facc15";
    }
}