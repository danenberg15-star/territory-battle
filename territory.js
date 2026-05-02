// territory.js - Canvas Drawing to GPS Mapping & Arena Math

let drawingPath = [];
let isDrawing = false;
let canvas, ctx;

// ==========================================
// 1. Canvas Drawing Initialization
// ==========================================
function initDrawingCanvas(mapInstance) {
    canvas = document.getElementById('drawing-canvas');
    ctx = canvas.getContext('2d');
    
    // התאמת גודל הקנבס למסך המכשיר
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    document.getElementById('drawing-container').style.display = 'block';
    
    // מאזיני מגע לציור חופשי
    canvas.addEventListener('touchstart', (e) => startDrawing(e, mapInstance), { passive: false });
    canvas.addEventListener('touchmove', (e) => draw(e, mapInstance), { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
}

function startDrawing(e, mapInstance) {
    isDrawing = true;
    drawingPath = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const touch = e.touches[0];
    addPoint(touch.clientX, touch.clientY, mapInstance);
    
    ctx.beginPath();
    ctx.moveTo(touch.clientX, touch.clientY);
    ctx.strokeStyle = '#38bdf8'; // צבע כחול ניאון בהתאם לשפה העיצובית
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
}

function draw(e, mapInstance) {
    if (!isDrawing) return;
    e.preventDefault(); // מניעת גלילה של הדפדפן בזמן הציור
    
    const touch = e.touches[0];
    ctx.lineTo(touch.clientX, touch.clientY);
    ctx.stroke();
    
    addPoint(touch.clientX, touch.clientY, mapInstance);
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.closePath();
    
    // הצגת כפתור האישור רק אם יש מספיק נקודות ליצירת שטח[cite: 1]
    if (drawingPath.length > 10) {
        document.getElementById('btn-confirm-drawing').style.display = 'block';
    }
}

// המרת פיקסל על המסך לקואורדינטת GPS לפי מצב המפה הנוכחי
function addPoint(x, y, mapInstance) {
    const latlng = mapInstance.containerPointToLatLng([x, y]);
    drawingPath.push([latlng.lat, latlng.lng]);
}

function clearDrawing() {
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawingPath = [];
    document.getElementById('btn-confirm-drawing').style.display = 'none';
}

// ==========================================
// 2. Finalize & Calculate Arena (The 5% Rule)
// ==========================================
function finalizeDrawing() {
    if (drawingPath.length < 10) return null;

    // סגירת הפוליגון: חיבור הנקודה האחרונה לראשונה
    const coords = drawingPath.map(p => [p[1], p[0]]);
    coords.push(coords[0]);

    try {
        const polygon = turf.polygon([coords]);
        const areaSqMeters = turf.area(polygon); // שטח כולל במ"ר
        
        // חישוב רדיוס תחנת המשטרה - 5% משטח הזירה[cite: 1]
        // שטח עיגול = פאי כפול רדיוס בריבוע
        const stationArea = areaSqMeters * 0.05;
        const stationRadius = Math.sqrt(stationArea / Math.PI);

        // מציאת המרכז הגיאומטרי של השטח שצוין
        const centroid = turf.centroid(polygon);
        const centerCoords = {
            lat: centroid.geometry.coordinates[1],
            lng: centroid.geometry.coordinates[0],
            radius: Math.max(15, stationRadius) // רדיוס מינימלי של 15 מטרים למשחקיות
        };

        return {
            points: drawingPath,
            totalArea: areaSqMeters,
            policeStation: centerCoords
        };
    } catch (err) {
        console.error("Area Calculation Error:", err);
        alert("השטח שצויר אינו תקין. נסה לצייר צורה סגורה וברורה יותר.");
        return null;
    }
}

// פונקציית עזר לבדיקה האם שחקן נמצא בתוך הזירה
function isPointInArena(lat, lng, arenaPoints) {
    if (!arenaPoints || arenaPoints.length < 3) return true;
    try {
        const pt = turf.point([lng, lat]);
        const polyCoords = arenaPoints.map(p => [p[1], p[0]]);
        polyCoords.push(polyCoords[0]);
        const poly = turf.polygon([polyCoords]);
        return turf.booleanPointInPolygon(pt, poly);
    } catch(e) { return true; }
}