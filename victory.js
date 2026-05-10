// victory.js - Video Supported Victory Screen

function showVictoryScreen(winnerRole) {
    const screen = document.getElementById('victory-screen');
    const video = document.getElementById('victory-video');
    const uiOverlay = document.getElementById('victory-ui-overlay');
    const title = document.getElementById('victory-title');
    const defaultTrophy = document.getElementById('default-trophy');

    screen.style.display = 'flex';

    if (winnerRole === 'cops') {
        video.src = 'cop_win.webm';
        video.style.display = 'block';
        uiOverlay.style.display = 'none';

        video.play().then(() => {
            video.onended = () => {
                location.reload();
            };
        }).catch(err => {
            console.warn("Video failed to auto-play:", err);
            video.style.display = 'none';
            title.innerText = "השוטרים ניצחו!";
            title.style.color = "#3b82f6";
            defaultTrophy.style.display = 'none';
            uiOverlay.style.display = 'block';
            setTimeout(() => { location.reload(); }, 5000);
        });

    } else if (winnerRole === 'thieves') {
        // סרטון ניצחון גנבים
        video.src = 'thieves_win.MP4';
        video.style.display = 'block';
        uiOverlay.style.display = 'none';

        video.play().then(() => {
            video.onended = () => {
                location.reload();
            };
        }).catch(err => {
            console.warn("Thieves video failed to auto-play:", err);
            video.style.display = 'none';
            title.innerText = "הגנבים ניצחו!";
            title.style.color = "#ef4444";
            defaultTrophy.style.display = 'block';
            uiOverlay.style.display = 'block';

            if (typeof confetti === 'function') {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
            }

            setTimeout(() => { location.reload(); }, 5000);
        });
    }
}