// chat.js - Phase 5.2: Team Chat with Web Speech API

let chatVisible = true;
let recognition = null;
let isRecording = false;

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('chat-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleChatBody);
    }
});

/**
 * הסתרה/הצגה של גוף הצ'אט
 */
function toggleChatBody() {
    const body = document.getElementById('chat-body');
    const toggleBtn = document.getElementById('chat-toggle-btn');
    if (!body || !toggleBtn) return;

    chatVisible = !chatVisible;
    body.style.display = chatVisible ? 'flex' : 'none';
    toggleBtn.textContent = chatVisible ? '▲' : '▼';
}

/**
 * אתחול מנגנון זיהוי הדיבור
 */
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.warn("Speech recognition not supported.");
        const micBtn = document.getElementById('chat-mic-btn');
        if (micBtn) micBtn.style.opacity = '0.3';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = window.currentLang === 'he' ? 'he-IL' : 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
        isRecording = true;
        setMicUI('recording');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript && transcript.trim()) {
            sendMessage(transcript.trim());
        }
        stopRecording();
    };

    recognition.onerror = (e) => {
        console.warn("Speech error:", e.error);
        if (e.error === 'network') {
            showChatNotice('אין חיבור לזיהוי קול');
        } else if (e.error === 'not-allowed') {
            showChatNotice('אין הרשאת מיקרופון');
        } else {
            showChatNotice('שגיאת הקלטה');
        }
        stopRecording();
    };

    recognition.onend = () => {
        stopRecording();
    };
}

/**
 * לחיצה על כפתור המיקרופון - מתחיל/עוצר הקלטה
 */
function toggleRecording() {
    if (!recognition) {
        initSpeechRecognition();
        if (!recognition) return;
    }

    // עדכון שפה לפני כל הקלטה
    recognition.lang = window.currentLang === 'he' ? 'he-IL' : 'en-US';

    if (isRecording) {
        recognition.stop();
    } else {
        try {
            recognition.start();

            // עצירה אוטומטית אחרי 3 שניות
            setTimeout(() => {
                if (isRecording && recognition) {
                    recognition.stop();
                }
            }, 3000);
        } catch (e) {
            console.warn("Recognition start error:", e);
            stopRecording();
        }
    }
}

function stopRecording() {
    isRecording = false;
    setMicUI('idle');
}

function setMicUI(state) {
    const micBtn = document.getElementById('chat-mic-btn');
    if (!micBtn) return;
    if (state === 'recording') {
        micBtn.classList.add('recording');
    } else {
        micBtn.classList.remove('recording');
    }
}

function showChatNotice(text) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;
    const el = document.createElement('div');
    el.className = 'msg msg-notice';
    el.textContent = text;
    messagesDiv.appendChild(el);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
}

/**
 * אתחול האזנה להודעות בערוץ של הקבוצה הנוכחית בלבד
 */
function initChat(roomId) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv || !window.db || !window.playerRole) return;

    messagesDiv.innerHTML = "";

    const teamChatPath = `game/${roomId}/chat_${window.playerRole}`;
    window.db.ref(teamChatPath).limitToLast(20).on('child_added', (snapshot) => {
        renderChatMessage(snapshot.val());
    });

    // אתחול כפתור המיקרופון
    const micBtn = document.getElementById('chat-mic-btn');
    if (micBtn) {
        micBtn.addEventListener('click', toggleRecording);
    }

    initSpeechRecognition();
}

/**
 * שליחת הודעה לשרת
 */
function sendMessage(text) {
    if (!text || !window.currentRoom || !window.db || !window.playerRole) return;

    const newMessage = {
        senderId: window.playerId,
        senderName: window.playerName,
        role: window.playerRole,
        text: text,
        t: firebase.database.ServerValue.TIMESTAMP
    };

    const teamChatPath = `game/${window.currentRoom}/chat_${window.playerRole}`;
    window.db.ref(teamChatPath).push(newMessage)
        .catch(err => console.error("Team chat sync error:", err));
}

/**
 * הצגת הודעה בממשק
 */
function renderChatMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'msg';

    const isMine = data.senderId === window.playerId;
    msgEl.innerHTML = `<span class="msg-sender">${isMine ? 'אני' : data.senderName}:</span> <span class="msg-text">${data.text}</span>`;

    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/**
 * שליטה על נראות הצ'אט
 */
function toggleChatVisibility(show) {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.style.display = show ? 'flex' : 'none';
    }
}