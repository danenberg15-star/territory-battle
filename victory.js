// victory.js - Video Supported Victory Screen

function showVictoryScreen(winnerRole) {
    const screen = document.getElementById('victory-screen');
    const video = document.getElementById('victory-video');
    const uiOverlay = document.getElementById('victory-ui-overlay');
    const title = document.getElementById('victory-title');
    const defaultTrophy = document.getElementById('default-trophy');

    // מציג את מסך הניצחון מעל הכל
    screen.style.display = 'flex';

    if (winnerRole === 'cops') {
        // --- לוגיקת שוטרים: מנגנים סרטון וזורקים חזרה ללובי ---
        video.style.display = 'block';
        uiOverlay.style.display = 'none';

        // מנסים לנגן את הסרטון
        video.play().then(() => {
            // כשהסרטון מסתיים באופן טבעי
            video.onended = () => {
                location.reload(); // רענון הדף מחזיר אוטומטית ללובי
            };
        }).catch(err => {
            console.warn("Video failed to auto-play, failing back to standard UI:", err);
            // מנגנון הגנה: אם הדפדפן חסם את ניגון הסרטון בגלל הגדרות מדיה
            video.style.display = 'none';
            title.innerText = "השוטרים ניצחו!";
            title.style.color = "#3b82f6";
            defaultTrophy.style.display = 'none';
            uiOverlay.style.display = 'block';
            
            // במקרה של כישלון וידאו, עדיין נעשה ריפרש אחרי 5 שניות
            setTimeout(() => {
                location.reload();
            }, 5000);
        });

    } else {
        // --- לוגיקת גנבים: UI רגיל + קונפטי + כפתור חזרה ---
        video.style.display = 'none';
        title.innerText = "הגנבים ניצחו!";
        title.style.color = "#ef4444";
        defaultTrophy.style.display = 'block';
        uiOverlay.style.display = 'block';

        // מפעיל את אפקט הקונפטי
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    }
}