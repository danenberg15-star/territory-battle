// briefing.js - Phase 1.8.1: Police Station Briefing Logic

let briefingTimer = null;

// חשיפה גלובלית של startHostBriefingTimer כדי ש-game-arena.js יוכל לקרוא לה
window.startBriefingTimer = function() {
    startHostBriefingTimer();
};

// פונקציה להאזנה לסטטוס התדריך במסד הנתונים והצגתו למשתמש
function listenToBriefing() {
    window.db.ref(`game/${window.currentRoom}/briefing`).on('value', snap => {
        const b = snap.val() || { active: false, timeLeft: 30, complete: false };

        // תיקון: שימוש ב-window.isBriefingComplete במקום משתנה local
        window.isBriefingComplete = b.complete;
        
        const overlay = document.getElementById('briefing-overlay');
        const timerText = document.getElementById('briefing-timer-text');
        const statusText = document.getElementById('briefing-status');

        if (!overlay || !timerText || !statusText) return;

        if (window.isBriefingComplete) {
            overlay.style.display = 'none';
        } else {
            overlay.style.display = 'flex';
            
            // עיצוב הטיימר (הוספת 0 מוביל אם צריך)
            timerText.innerText = `00:${b.timeLeft < 10 ? '0' : ''}${b.timeLeft}`;
            
            // עדכון הודעת הסטטוס בהתאם למצב
            if (b.active) {
                statusText.innerText = window.currentLang === 'he'
                    ? "תדריך מתבצע... הישארו בתחנה!"
                    : "Briefing in progress... Stay in station!";
                timerText.style.color = "#10b981";
            } else {
                statusText.innerText = window.currentLang === 'he'
                    ? "ממתין לכל השוטרים בתחנה..."
                    : "Waiting for all cops in station...";
                timerText.style.color = "#facc15";
            }
        }
    });
}

// פונקציה המנוהלת על ידי מנהל החדר (Host) בלבד
function manageBriefingLogic() {
    // תיקון: שימוש ב-window.isBriefingComplete ו-window.arenaData
    if (!window.isHost || window.isBriefingComplete || !window.arenaData) return;
    
    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        
        // סינון רק של שחקנים שהם שוטרים (ולא מנותקים)
        const cops = Object.values(players).filter(p => p.role === 'cop' && !p.isOffline);
        
        // בדיקה האם יש לפחות שוטר אחד, וכולם בתוך התחנה
        const allCopsReady = cops.length > 0 && cops.every(c => c.inStation === true);

        window.db.ref(`game/${window.currentRoom}/briefing`).once('value', briefingSnap => {
            let b = briefingSnap.val() || { active: false, timeLeft: 30, complete: false };
            
            if (b.complete) return;

            if (allCopsReady) {
                if (!b.active) {
                    window.db.ref(`game/${window.currentRoom}/briefing`).update({ active: true, timeLeft: 30 });
                    startHostBriefingTimer();
                }
            } else {
                if (b.active || b.timeLeft !== 30) {
                    stopHostBriefingTimer();
                    window.db.ref(`game/${window.currentRoom}/briefing`).update({ active: false, timeLeft: 30 });
                }
            }
        });
    });
}

// ניהול האינטרוול של הטיימר בצד השרת (דרך המנהל)
function startHostBriefingTimer() {
    if (briefingTimer) clearInterval(briefingTimer);
    
    briefingTimer = setInterval(() => {
        window.db.ref(`game/${window.currentRoom}/briefing`).once('value', snap => {
            let b = snap.val();
            if (!b || !b.active || b.complete) {
                stopHostBriefingTimer();
                return;
            }
            
            b.timeLeft -= 1;
            
            if (b.timeLeft <= 0) {
                b.timeLeft = 0;
                b.active = false;
                b.complete = true;
                stopHostBriefingTimer();
            }
            
            window.db.ref(`game/${window.currentRoom}/briefing`).update(b);
        });
    }, 1000);
}

function stopHostBriefingTimer() {
    if (briefingTimer) {
        clearInterval(briefingTimer);
        briefingTimer = null;
    }
}