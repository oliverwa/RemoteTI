# Zoom and Pan Command Structure

## Data Structure
Each camera maintains its view state:
```typescript
interface Cam {
  id: number;
  zoom: number;      // 1.0 = 100%, 2.0 = 200%, etc. (range: 1.0 to 10.0)
  pan: {
    x: number;       // Horizontal offset in pixels (negative = left, positive = right)
    y: number;       // Vertical offset in pixels (negative = up, positive = down)
  };
  // ... other properties
}
```

## Zoom Commands

### 1. Mouse Wheel / Trackpad Scroll
```javascript
// When scrolling:
const zoomDelta = e.deltaY > 0 ? 0.8 : 1.25;  // Scroll down = zoom out (0.8x), up = zoom in (1.25x)
const newZoom = clamp(cam.zoom * zoomDelta, 1.0, 10);

// The actual state update:
setCams(prev => prev.map(c => 
  c.id === id 
    ? { ...c, zoom: newZoom, pan: { x: newPanX, y: newPanY } }
    : c
));
```

### 2. Pinch Zoom (Touch Devices)
```javascript
// Factor is the pinch scale change
const newZoom = clamp(currentZoom * factor, 1.0, 10);

// With pinch center point (centerX, centerY):
const zoomFactor = newZoom / currentZoom;
const newPanX = (pan.x - offsetX) * zoomFactor + offsetX;
const newPanY = (pan.y - offsetY) * zoomFactor + offsetY;
```

### 3. Button Controls
```javascript
// Zoom in button
zoomIn: () => setCams(prev => prev.map(cam => 
  cam.id === id 
    ? { ...cam, zoom: Math.min(cam.zoom + 0.5, 10) }
    : cam
));

// Zoom out button
zoomOut: () => setCams(prev => prev.map(cam => 
  cam.id === id 
    ? { ...cam, zoom: Math.max(cam.zoom - 0.5, 1) }
    : cam
));
```

## Pan Commands

### 1. Mouse Drag
```javascript
// On mouse move during drag:
const deltaX = currentMouseX - startMouseX;
const deltaY = currentMouseY - startMouseY;
const sensitivity = 1.0;  // Fixed sensitivity

const newPan = {
  x: startPan.x + deltaX * sensitivity,
  y: startPan.y + deltaY * sensitivity
};

// Apply with clamping
const clampedPan = clampPan(newPan, zoom, containerRect, true);
setCams(prev => prev.map(c => 
  c.id === id ? { ...c, pan: clampedPan } : c
));
```

### 2. Touch Pan (Single Finger)
```javascript
// Similar to mouse drag:
const deltaX = touch.clientX - lastTouch.x;
const deltaY = touch.clientY - lastTouch.y;

const newPan = {
  x: currentPan.x + deltaX,
  y: currentPan.y + deltaY
};
```

## Reset Commands

### Reset Single Camera
```javascript
resetView: (id) => setCams(prev => prev.map(c => 
  c.id === id 
    ? { ...c, zoom: 1, pan: { x: 0, y: 0 } }
    : c
));
```

### Reset All Cameras
```javascript
resetAll: () => setCams(prev => prev.map(c => 
  ({ ...c, zoom: 1, pan: { x: 0, y: 0 } })
));
```

## Pan Clamping Logic
```javascript
function clampPan(pan, zoom, rect, limit) {
  if (zoom <= 1) return { x: 0, y: 0 };  // No pan at 100% zoom
  
  // Maximum pan distance based on zoom
  const maxPanX = (rect.width * (zoom - 1)) / 2;
  const maxPanY = (rect.height * (zoom - 1)) / 2;
  
  return {
    x: clamp(pan.x, -maxPanX, maxPanX),
    y: clamp(pan.y, -maxPanY, maxPanY)
  };
}
```

## Canvas Rendering
The final image position in the canvas:
```javascript
// Image scaled size
const scaledWidth = drawWidth * zoom;
const scaledHeight = drawHeight * zoom;

// Final position with pan applied
const finalX = offsetX + (rect.width - scaledWidth) / 2 + panX;
const finalY = offsetY + (rect.height - scaledHeight) / 2 + panY;

// Draw the image
ctx.drawImage(img, finalX, finalY, scaledWidth, scaledHeight);
```

## Example State Changes

### Zooming In (2x):
```javascript
// Before
{ zoom: 1.0, pan: { x: 0, y: 0 } }

// After scroll up
{ zoom: 1.25, pan: { x: 0, y: 0 } }

// After another scroll up
{ zoom: 1.5625, pan: { x: 0, y: 0 } }
```

### Panning While Zoomed:
```javascript
// Start (zoomed in)
{ zoom: 2.0, pan: { x: 0, y: 0 } }

// After dragging right 100px
{ zoom: 2.0, pan: { x: 100, y: 0 } }

// After dragging down 50px
{ zoom: 2.0, pan: { x: 100, y: 50 } }
```

### Pinch Zoom with Center:
```javascript
// Pinching at point (300, 200) relative to container center
// Initial state
{ zoom: 1.0, pan: { x: 0, y: 0 } }

// After pinch (2x zoom)
{ zoom: 2.0, pan: { x: -300, y: -200 } }
// The pan adjusts to keep the pinch point fixed
```