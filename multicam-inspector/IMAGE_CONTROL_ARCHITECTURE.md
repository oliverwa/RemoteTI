# Image Control Architecture

## Current Implementation Overview

The MultiCam Inspector uses a layered approach for image display and control:

### Components

1. **CamTile** - The main container component for each camera view
   - Handles touch/mouse events (wheel, drag, pinch)
   - Manages touch state for mobile devices
   - Renders the CanvasImage component

2. **CanvasImage** - The actual image rendering component
   - Uses HTML5 Canvas for rendering
   - Handles zoom/pan transformations
   - Draws validation boxes
   - Applies brightness/contrast filters

3. **Fullscreen** - Fullscreen view component
   - Uses CSS transforms instead of Canvas
   - Simple transform-based zoom/pan

### Current Control Flow

```
User Input → CamTile → Event Handlers → State Update → CanvasImage Re-render
```

## Zoom/Pan Implementation Issues

### Problem 1: Zoom Center Point
Currently, the zoom is trying to focus on the image center but the calculation is incorrect because:
1. The pan values are applied incorrectly in the canvas drawing
2. The zoom focal point calculation doesn't properly account for the image position

### Problem 2: Multiple Control Methods
There are several different ways zoom/pan is controlled:
- Scroll wheel (`onWheel`)
- Pinch gestures (`onPinch`)
- Touch events (handled in CamTile)
- Drag to pan (`onDrag`)
- Button controls (`zoomIn`, `zoomOut`)
- Double-click to reset

### Problem 3: Coordinate Systems
The code mixes different coordinate systems:
- Container coordinates (viewport)
- Image coordinates (actual image pixels)
- Canvas coordinates (drawing context)
- Normalized coordinates (0-1 range for validation boxes)

## Recommended Standardization

### 1. Unified Zoom/Pan State
```typescript
interface ViewState {
  zoom: number;        // Zoom level (1.0 = 100%)
  pan: {
    x: number;         // Pan offset in pixels
    y: number;         // Pan offset in pixels
  };
  focusPoint?: {       // Optional focus point for zoom
    x: number;         // Focus X in normalized coords (0-1)
    y: number;         // Focus Y in normalized coords (0-1)
  };
}
```

### 2. Standardized Control API
```typescript
interface ImageController {
  // Core operations
  setZoom(zoom: number, focusPoint?: Point): void;
  setPan(pan: Point): void;
  reset(): void;
  
  // Relative operations
  zoomBy(factor: number, focusPoint?: Point): void;
  panBy(delta: Point): void;
  
  // Utility
  clampView(): void;  // Ensure view is within bounds
  getImageBounds(): Rect;
  containerToImage(point: Point): Point;
  imageToContainer(point: Point): Point;
}
```

### 3. Fix for Zoom-to-Image-Center

The issue is in the CanvasImage component. The pan is applied as:
```javascript
const panOffsetX = panX / zoom;
const panOffsetY = panY / zoom;
```

This should be:
```javascript
const panOffsetX = panX;
const panOffsetY = panY;
```

And the zoom focal point calculation needs to be simplified.

### 4. Unified Event Handling

Create a single event handler that converts all input types to standardized operations:
- Mouse wheel → `zoomBy()`
- Pinch → `zoomBy()`
- Drag → `panBy()`
- Touch pan → `panBy()`

## Implementation Steps

1. Fix immediate zoom-to-center issue in CanvasImage
2. Create unified zoom/pan controller utility
3. Refactor event handlers to use controller
4. Test across all devices and input methods
5. Document the final API

## Testing Checklist

- [ ] Mouse wheel zoom centers on image
- [ ] Pinch zoom centers on image
- [ ] Pan works correctly when zoomed
- [ ] Double-click resets view
- [ ] Zoom buttons work correctly
- [ ] Validation boxes stay aligned
- [ ] Camera transforms still work
- [ ] Works on iPad/mobile devices