// audio.js - Ultrasonic Sonar Logic (20kHz - Phase 5.1 Hybrid Catch)

let audioCtx = null;
let oscillator = null;
let analyzer = null;
const TARGET_FREQ = 20000; // תדר אולטרסוני לפי האפיון[cite: 7, 12]

/**
 * אתחול ה-AudioContext (חובה לבצע לאחר אינטראקציה ראשונה של המשתמש)
 */
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

/**
 * שוטר: שידור סיגנל הסונאר למשך 10 שניות[cite: 12]
 */
function broadcastCapture() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // יצירת מתנד (Oscillator) בתדר גבוה[cite: 12]
    oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(TARGET_FREQ, audioCtx.currentTime);
    
    // הגדרת עוצמה (Gain) למניעת עיוותים[cite: 12]
    gainNode.gain.setValueAtTime(1.2, audioCtx.currentTime); 
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    
    // סגירה אוטומטית לאחר 10 שניות (תואם לטיימר ב-game.js)[cite: 12]
    setTimeout(() => { 
        if (oscillator) {
            oscillator.stop();
            oscillator = null;
        }
    }, 10000); 
}

/**
 * גנב: האזנה אקטיבית וניתוח תדרים[cite: 12]
 * @param {Function} onCaught - פונקציה שתופעל אם זוהה סיגנל רציף
 */
async function startListeningForCops(onCaught) {
    initAudio();
    try {
        // בקשת גישה למיקרופון ללא עיבודים שמסננים תדרים גבוהים[cite: 12]
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
        analyzer.fftSize = 4096; // רזולוציה גבוהה לזיהוי מדויק של 20kHz[cite: 12]
        source.connect(analyzer);
        
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        
        // מונה זיהוי רציף: 1.5 שניות ב-60FPS שוות ל-90 פריימים[cite: 7, 12]
        let detectionCounter = 0; 
        const REQUIRED_FRAMES = 90; 

        function checkFrame() {
            if (!analyzer) return;
            
            analyzer.getByteFrequencyData(dataArray);
            
            // חישוב המיקום (Bin) המדויק של התדר במערך[cite: 12]
            const binIndex = Math.round(TARGET_FREQ / (audioCtx.sampleRate / analyzer.fftSize));
            const intensity = dataArray[binIndex];

            // בדיקת עוצמת הסיגנל מעל סף הרעש[cite: 12]
            if (intensity > 40) { 
                detectionCounter++;
                if (detectionCounter >= REQUIRED_FRAMES) { 
                    onCaught(); // אישור מעצר אקוסטי סופי[cite: 7, 12]
                    detectionCounter = 0;
                    stopMic(stream);
                    return;
                }
            } else {
                // דעיכה הדרגתית של המונה אם הסיגנל נקטע[cite: 12]
                detectionCounter = Math.max(0, detectionCounter - 1);
            }
            requestAnimationFrame(checkFrame);
        }
        
        updateAudioStatus(true);
        checkFrame();
        
        // כיבוי המיקרופון אחרי 10 שניות מטעמי פרטיות וסוללה[cite: 12]
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