// territory.js - Canvas Drawing Logic & GPS Mapping

let drawingPath = [];
let isDrawing = false;
let canvas, ctx;

// ==========================================
// 1. Canvas Initialization
// ==========================================
function initDrawingCanvas(map) {
    canvas = document.getElementById('drawing-canvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas size to match window
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    document.getElementById('drawing-container').style.display = 'block';
    
    // Event Listeners for Drawing
    canvas.addEventListener('touchstart', (e) => startDrawing(e, map), { passive: false });
    canvas.addEventListener('touchmove', (e) => draw(e, map), { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
}

function startDrawing(e, map) {
    isDrawing = true;
    drawingPath = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const touch = e.touches[0];
    addPoint(touch.clientX, touch.clientY, map);
    
    ctx.beginPath();
    ctx.moveTo(touch.clientX, touch.clientY);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
}

function draw(e, map) {
    if (!isDrawing) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    ctx.lineTo(touch.clientX, touch.clientY);
    ctx.stroke();
    
    addPoint(touch.clientX, touch.clientY, map);
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.closePath();
    
    if (drawingPath.length > 5) {
        document.getElementById('btn-confirm-drawing').style.display = 'block';
    }
}

// Convert Pixel to LatLng using Leaflet's projection
function addPoint(x, y, map) {
    const latlng = map.containerPointToLatLng([x, y]);
    drawingPath.push([latlng.lat, latlng.lng]);
}

function clearDrawing() {
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawingPath = [];
    document.getElementById('btn-confirm-drawing').style.display = 'none';
}

// ==========================================
// 2. Finalize & Calculate Area (5% Rule)
// ==========================================
function finalizeDrawing() {
    if (drawingPath.length < 5) return null;

    // Close the polygon
    const coords = drawingPath.map(p => [p[1], p[0]]);
    coords.push(coords[0]);

    try {
        const polygon = turf.polygon([coords]);
        const areaSqMeters = turf.area(polygon);
        
        // Calculate Station Radius (5% of Area)
        const stationArea = areaSqMeters * 0.05;
        const stationRadius = Math.sqrt(stationArea / Math.PI);

        // Find Center
        const centroid = turf.centroid(polygon);
        const centerCoords = {
            lat: centroid.geometry.coordinates[1],
            lng: centroid.geometry.coordinates[0],
            radius: Math.max(15, stationRadius) // Min 15m
        };

        return {
            points: drawingPath,
            totalArea: areaSqMeters,
            policeStation: centerCoords
        };
    } catch (err) {
        console.error("Area Calculation Error:", err);
        return null;
    }
}

// Check if a player is within the arena
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