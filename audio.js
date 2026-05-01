// audio.js - Ultrasonic Sonar Logic (20kHz - Inaudible Mode)
let audioCtx = null;
let oscillator = null;
let analyzer = null;
const TARGET_FREQ = 20000; // הגבול העליון המוחלט

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function broadcastCapture() {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(TARGET_FREQ, audioCtx.currentTime);
    
    // הפחתנו עוצמה ל-1.2 כדי למנוע עיוותי רמקול שנשמעים לאוזן
    gainNode.gain.setValueAtTime(1.2, audioCtx.currentTime); 
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    setTimeout(() => { oscillator.stop(); }, 5000); 
}

async function startListeningForCops(onCaught) {
    if (!audioCtx) initAudio();
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
        const valSpan = document.getElementById('signal-val');

        let detectionCounter = 0;

        function checkFrame() {
            analyzer.getByteFrequencyData(dataArray);
            const binIndex = Math.round(TARGET_FREQ / (audioCtx.sampleRate / analyzer.fftSize));
            const intensity = dataArray[binIndex];

            if (valSpan) valSpan.innerText = Math.round((intensity / 255) * 100);

            // בתדר כזה גבוה, רגישות של 40 היא מספיקה[cite: 1]
            if (intensity > 40) { 
                detectionCounter++;
                if (detectionCounter > 40) { 
                    onCaught();
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
    } catch (err) {
        document.getElementById('audio-status').innerText = "שגיאת שמע ❌";
    }
}