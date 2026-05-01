// audio.js - Ultrasonic Sonar Logic (20kHz - Inaudible Mode)
let audioCtx = null;
let oscillator = null;
let analyzer = null;
const TARGET_FREQ = 20000; // הגבול העליון המוחלט[cite: 1]

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)(); //[cite: 1]
}

function broadcastCapture() {
    if (!audioCtx) initAudio(); //[cite: 1]
    if (audioCtx.state === 'suspended') audioCtx.resume(); //[cite: 1]

    oscillator = audioCtx.createOscillator(); //[cite: 1]
    const gainNode = audioCtx.createGain(); //[cite: 1]
    
    oscillator.type = 'sine'; //[cite: 1]
    oscillator.frequency.setValueAtTime(TARGET_FREQ, audioCtx.currentTime); //[cite: 1]
    
    // הפחתנו עוצמה ל-1.2 כדי למנוע עיוותי רמקול שנשמעים לאוזן[cite: 1]
    gainNode.gain.setValueAtTime(1.2, audioCtx.currentTime); 
    
    oscillator.connect(gainNode); //[cite: 1]
    gainNode.connect(audioCtx.destination); //[cite: 1]
    
    oscillator.start(); //[cite: 1]
    // עדכון זמן הצליל ל-10 שניות לבקשת המשתמש
    setTimeout(() => { oscillator.stop(); }, 10000); 
}

async function startListeningForCops(onCaught) {
    if (!audioCtx) initAudio(); //[cite: 1]
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: false, 
                noiseSuppression: false, 
                autoGainControl: false 
            } 
        }); //[cite: 1]
        
        if (audioCtx.state === 'suspended') audioCtx.resume(); //[cite: 1]
        const source = audioCtx.createMediaStreamSource(stream); //[cite: 1]
        analyzer = audioCtx.createAnalyser(); //[cite: 1]
        analyzer.fftSize = 4096; //[cite: 1]
        source.connect(analyzer); //[cite: 1]
        
        const dataArray = new Uint8Array(analyzer.frequencyBinCount); //[cite: 1]
        const valSpan = document.getElementById('signal-val'); //[cite: 1]

        let detectionCounter = 0; //[cite: 1]

        function checkFrame() {
            analyzer.getByteFrequencyData(dataArray); //[cite: 1]
            const binIndex = Math.round(TARGET_FREQ / (audioCtx.sampleRate / analyzer.fftSize)); //[cite: 1]
            const intensity = dataArray[binIndex]; //[cite: 1]

            if (valSpan) valSpan.innerText = Math.round((intensity / 255) * 100); //[cite: 1]

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
            requestAnimationFrame(checkFrame); //[cite: 1]
        }
        document.getElementById('audio-status').innerText = "מיקרופון ✅"; //[cite: 1]
        document.getElementById('audio-status').style.color = "#10b981"; //[cite: 1]
        checkFrame(); //[cite: 1]
    } catch (err) {
        document.getElementById('audio-status').innerText = "שגיאת שמע ❌"; //[cite: 1]
    }
}