// audio.js - Ultrasonic Sonar Logic (20kHz - Phase 5.1 Hybrid Catch)

let audioCtx = null;
let oscillator = null;
let analyzer = null;
const TARGET_FREQ = 20000; // תדר אולטרסוני

/**
 * אתחול ה-AudioContext (חובה לבצע לאחר אינטראקציה ראשונה של המשתמש)
 */
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

/**
 * שוטר: שידור סיגנל הסונאר למשך 10 שניות
 */
function broadcastCapture() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(TARGET_FREQ, audioCtx.currentTime);
    
    // תיקון: Gain מ-1.2 ל-1.0 — ערך מעל 1.0 גורם לclipping ומעוות את הסיגנל
    gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    
    // סגירה אוטומטית לאחר 10 שניות
    setTimeout(() => { 
        if (oscillator) {
            oscillator.stop();
            oscillator = null;
        }
    }, 10000); 
}

/**
 * גנב: האזנה אקטיבית וניתוח תדרים
 * @param {Function} onCaught - פונקציה שתופעל אם זוהה סיגנל רציף
 */
async function startListeningForCops(onCaught) {
    initAudio();
    try {
        // בקשת גישה למיקרופון ללא עיבודים שמסננים תדרים גבוהים
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: false, 
                noiseSuppression: false, 
                autoGainControl: false 
            } 
        });
        
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const source = audioCtx.createMediaStreamSource(stream);
        analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 4096; // רזולוציה גבוהה לזיהוי מדויק של 20kHz
        source.connect(analyzer);
        
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);

        // תיקון: בדיקה לפי זמן במקום frames — פותר בעיית 30FPS במובייל
        // הסיגנל חייב להיות רציף במשך 1500ms כדי לאשר מעצר
        const REQUIRED_MS = 1500;
        let signalStartTime = null;

        function checkFrame() {
            if (!analyzer) return;
            
            analyzer.getByteFrequencyData(dataArray);
            
            // חישוב המיקום המדויק של התדר במערך
            const binIndex = Math.round(TARGET_FREQ / (audioCtx.sampleRate / analyzer.fftSize));
            const intensity = dataArray[binIndex];

            if (intensity > 40) {
                // סיגנל זוהה — מתחילים לספור זמן
                if (!signalStartTime) {
                    signalStartTime = Date.now();
                }

                const elapsed = Date.now() - signalStartTime;
                if (elapsed >= REQUIRED_MS) {
                    onCaught(); // אישור מעצר אקוסטי סופי
                    stopMic(stream);
                    return;
                }
            } else {
                // סיגנל נקטע — מאפסים את הטיימר
                signalStartTime = null;
            }

            requestAnimationFrame(checkFrame);
        }
        
        updateAudioStatus(true);
        checkFrame();
        
        // כיבוי המיקרופון אחרי 10 שניות מטעמי פרטיות וסוללה
        setTimeout(() => stopMic(stream), 10000);

    } catch (err) {
        console.error("Acoustic Detection Error:", err);
        updateAudioStatus(false, true);
    }
}

function stopMic(stream) {
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