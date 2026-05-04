// territory.js - Canvas Drawing to GPS Mapping & Arena Math + Safety Logic[cite: 7, 13]

let drawingPath = [];
let isDrawing = false;
let canvas, ctx;

// ==========================================
// 1. Canvas Drawing Initialization
// ==========================================
function initDrawingCanvas(mapInstance) {
    canvas = document.getElementById('drawing-canvas');
    ctx = canvas.getContext('2d');
    
    // התאמת גודל הקנבס למסך המכשיר[cite: 13]
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    document.getElementById('drawing-container').style.display = 'block';
    
    // מאזיני מגע לציור חופשי[cite: 13]
    canvas.addEventListener('touchstart', (e) => startDrawing(e, mapInstance), { passive: false });
    canvas.addEventListener('touchmove', (e) => draw(e, mapInstance), { passive: false });
    canvas.addEventListener('touchend', stopDrawing);

    window.addEventListener('resize', () => {
        if (canvas && document.getElementById('drawing-container').style.display === 'block') {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            clearDrawing(); 
        }
    });
}

function startDrawing(e, mapInstance) {
    isDrawing = true;
    drawingPath = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const touch = e.touches[0];
    addPoint(touch.clientX, touch.clientY, mapInstance);
    
    ctx.beginPath();
    ctx.moveTo(touch.clientX, touch.clientY);
    ctx.strokeStyle = '#38bdf8'; 
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
}

function draw(e, mapInstance) {
    if (!isDrawing) return;
    e.preventDefault(); 
    
    const touch = e.touches[0];
    ctx.lineTo(touch.clientX, touch.clientY);
    ctx.stroke();
    
    addPoint(touch.clientX, touch.clientY, mapInstance);
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.closePath();
    
    if (drawingPath.length > 10) {
        document.getElementById('btn-confirm-drawing').style.display = 'block';
    }
}

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
// 2. Finalize & Calculate Arena (Safety Rule Check)[cite: 7]
// ==========================================
function finalizeDrawing() {
    // 3.1: בדיקת אישור בטיחות גיל (חובה לפי האפיון)[cite: 7]
    const safetyChecked = document.getElementById('safety-confirm-checkbox').checked;
    if (!safetyChecked) {
        alert(window.currentLang === 'he' 
            ? "עליך לאשר שכל השחקנים מעל גיל 16 לטובת בטיחות בדרכים לפני התחלת המשחק!" 
            : "You must confirm all players are over 16 for road safety before starting!");
        return null;
    }

    if (drawingPath.length < 10) return null;

    const coords = drawingPath.map(p => [p[1], p[0]]);
    coords.push(coords[0]);

    try {
        const polygon = turf.polygon([coords]);
        const areaSqMeters = turf.area(polygon); 
        
        const stationArea = areaSqMeters * 0.05;
        const stationRadius = Math.sqrt(stationArea / Math.PI);

        const centroid = turf.centroid(polygon);
        const centerCoords = {
            lat: centroid.geometry.coordinates[1],
            lng: centroid.geometry.coordinates[0],
            radius: Math.max(15, stationRadius) 
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