// audio.js - Ultrasonic Sonar Logic
let audioCtx = null;
let oscillator = null;
let analyzer = null;
let isListening = false;
const TARGET_FREQ = 19000; // תדר אולטרסוני

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

// שוטר: שידור תדר תפיסה
function broadcastCapture() {
    if (!audioCtx) initAudio();
    
    oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(TARGET_FREQ, audioCtx.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    // שידור למשך 5 שניות לפי האפיון
    setTimeout(() => {
        oscillator.stop();
    }, 5000);
}

// גנב: האזנה לתדר
async function startListeningForCops(onCaught) {
    if (!audioCtx) initAudio();
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioCtx.createMediaStreamSource(stream);
        analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 2048;
        source.connect(analyzer);
        
        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const sampleRate = audioCtx.sampleRate;
        
        let detectionCounter = 0;

        function checkFrame() {
            analyzer.getByteFrequencyData(dataArray);
            
            // מציאת האינדקס של התדר המבוקש במערך ה-FFT
            const binIndex = Math.round(TARGET_FREQ / (sampleRate / analyzer.fftSize));
            const intensity = dataArray[binIndex];

            if (intensity > 150) { // סף עוצמה
                detectionCounter++;
                if (detectionCounter > 45) { // כ-1.5 שניות של זיהוי רציף
                    onCaught();
                    detectionCounter = 0;
                }
            } else {
                detectionCounter = Math.max(0, detectionCounter - 1);
            }
            requestAnimationFrame(checkFrame);
        }
        
        document.getElementById('audio-status').innerText = "מיקרופון פעיל ✅";
        document.getElementById('audio-status').style.color = "#10b981";
        checkFrame();
    } catch (err) {
        console.error("Audio error:", err);
        document.getElementById('audio-status').innerText = "שגיאת שמע ❌";
    }
}