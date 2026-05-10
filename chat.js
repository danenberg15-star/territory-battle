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
        console.log("Recording started...");
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("Got transcript:", transcript, "playerRole:", window.playerRole, "room:", window.currentRoom);
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
            showChatNotice('שגיאה: ' + e.error);
        }
        stopRecording();
    };

    recognition.onend = () => {
        console.log("Recording ended.");
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

    recognition.lang = window.currentLang === 'he' ? 'he-IL' : 'en-US';

    if (isRecording) {
        recognition.stop();
    } else {
        try {
            recognition.start();
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
    if (!messagesDiv || !window.db) return;

    // המתנה ל-playerRole אם עדיין לא מוגדר
    if (!window.playerRole) {
        console.warn("initChat: playerRole not set yet, retrying in 500ms...");
        setTimeout(() => initChat(roomId), 500);
        return;
    }

    console.log("initChat called, roomId:", roomId, "playerRole:", window.playerRole);

    messagesDiv.innerHTML = "";

    const teamChatPath = `game/${roomId}/chat_${window.playerRole}`;
    window.db.ref(teamChatPath).limitToLast(20).on('child_added', (snapshot) => {
        renderChatMessage(snapshot.val());
    });

    const micBtn = document.getElementById('chat-mic-btn');
    if (micBtn) {
        // הסרת listener ישן למניעת כפילויות
        micBtn.replaceWith(micBtn.cloneNode(true));
        const freshMicBtn = document.getElementById('chat-mic-btn');
        freshMicBtn.addEventListener('click', toggleRecording);
    }

    initSpeechRecognition();
}

/**
 * שליחת הודעה לשרת
 */
function sendMessage(text) {
    if (!text) { console.warn("sendMessage: no text"); return; }
    if (!window.currentRoom) { console.warn("sendMessage: no currentRoom"); return; }
    if (!window.db) { console.warn("sendMessage: no db"); return; }
    if (!window.playerRole) { console.warn("sendMessage: no playerRole"); return; }

    const newMessage = {
        senderId: window.playerId,
        senderName: window.playerName,
        role: window.playerRole,
        text: text,
        t: firebase.database.ServerValue.TIMESTAMP
    };

    const teamChatPath = `game/${window.currentRoom}/chat_${window.playerRole}`;
    console.log("Sending to:", teamChatPath, newMessage);

    window.db.ref(teamChatPath).push(newMessage)
        .then(() => console.log("Message sent successfully"))
        .catch(err => console.error("Team chat sync error:", err));
}

/**
 * הצגת הודעה בממשק
 */
function renderChatMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv || !data) return;

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