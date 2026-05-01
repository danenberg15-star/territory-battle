let audioCtx = null;
let oscillator = null;
let analyzer = null;
const TARGET_FREQ = 17000; // תדר נגיש יותר

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
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime); 
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    setTimeout(() => { oscillator.stop(); }, 5000); // 5 שניות לפי האפיון[cite: 1]
}

async function startListeningForCops(onCaught) {
    if (!audioCtx) initAudio();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const source = audioCtx.createMediaStreamSource(stream);
        analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 2048;
        source.connect(analyzer);
        
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        let detectionCounter = 0;

        function checkFrame() {
            analyzer.getByteFrequencyData(dataArray);
            const binIndex = Math.round(TARGET_FREQ / (audioCtx.sampleRate / analyzer.fftSize));
            const intensity = dataArray[binIndex];

            if (intensity > 80) { // רגישות מוגברת[cite: 1]
                detectionCounter++;
                if (detectionCounter > 20) { // כ-0.7 שניות של זיהוי רציף[cite: 1]
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
        document.getElementById('audio-status').innerText = "שגיאת שמע ❌";
    }
}