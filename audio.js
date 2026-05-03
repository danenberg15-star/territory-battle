// audio.js - Ultrasonic Sonar Logic (20kHz - Phase 5.1 Hybrid Catch)
let audioCtx = null;
let oscillator = null;
let analyzer = null;
const TARGET_FREQ = 20000; // תדר אולטרסוני (לא נשמע לרוב האנשים)[cite: 6]

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// שוטר: משדר סיגנל למשך 10 שניות[cite: 6]
function broadcastCapture() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(TARGET_FREQ, audioCtx.currentTime);
    
    // עוצמה מוגדרת למניעת עיוותים ברמקול
    gainNode.gain.setValueAtTime(1.2, audioCtx.currentTime); 
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    // הצליל נפסק אוטומטית אחרי 10 שניות[cite: 6]
    setTimeout(() => { 
        if (oscillator) {
            oscillator.stop();
            oscillator = null;
        }
    }, 10000); 
}

// גנב: מאזין לסיגנל ומפעיל את המיקרופון ל-10 שניות[cite: 6]
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
        analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 4096;
        source.connect(analyzer);
        
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        
        // 1.5 שניות רצופות (בערך 90 דגימות ב-60FPS)[cite: 6]
        let detectionCounter = 0; 
        const REQUIRED_FRAMES = 90; 

        function checkFrame() {
            if (!analyzer) return;
            analyzer.getByteFrequencyData(dataArray);
            const binIndex = Math.round(TARGET_FREQ / (audioCtx.sampleRate / analyzer.fftSize));
            const intensity = dataArray[binIndex];

            // רגישות סף לקליטת התדר
            if (intensity > 40) { 
                detectionCounter++;
                if (detectionCounter >= REQUIRED_FRAMES) { 
                    onCaught(); // אישור מעצר אולטרסוני[cite: 6]
                    detectionCounter = 0;
                }
            } else {
                detectionCounter = Math.max(0, detectionCounter - 1);
            }
            requestAnimationFrame(checkFrame);
        }
        
        document.getElementById('audio-status').innerText = "מיקרופון ✅";
        document.getElementById('audio-status').style.color = "#10b981";
        checkFrame();
        
        // סגירת המיקרופון אחרי 10 שניות לחסכון בסוללה ופרטיות[cite: 6]
        setTimeout(() => {
            stream.getTracks().forEach(track => track.stop());
            analyzer = null;
            document.getElementById('audio-status').innerText = "אודיו ⏳";
            document.getElementById('audio-status').style.color = "#facc15";
        }, 10000);

    } catch (err) {
        console.error("Audio init error:", err);
        document.getElementById('audio-status').innerText = "שגיאת שמע ❌";
    }
}