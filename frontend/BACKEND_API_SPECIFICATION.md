# Technical Office AI Platform — Backend API Specification & Contract

This document specifies the exact REST API endpoints, file upload requirements, data schemas, coordinate system for drawing overlays, and WebSocket events needed by the frontend application.

---

## 1. File Upload Specifications

### Supported File Formats
The backend MUST accept the following file formats for engineering floor plans:
- **PDF** (`.pdf`) — Scanned or vector CAD floor plans (Multi-page PDFs should rasterize/convert Page 1 or all pages to PNG/JPEG images).
- **Images** (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`) — Direct raster or vector floor plan images.
- **CAD files** (`.dwg`, `.dxf`) — *(Optional)* Auto-converted by backend renderer to web-viewable PNG/JPEG/SVG.

### File Upload Endpoint
`POST /api/drawings/upload`

- **Content-Type**: `multipart/form-data`
- **Request Body**:
  | Field | Type | Description | Required |
  |---|---|---|---|
  | `file` | File Binary | The uploaded drawing file (PDF, PNG, JPG, etc.) | **Yes** |
  | `projectId` | String (UUID) | ID of the target project | **Yes** |
  | `drawingType` | String | `'ARCHITECTURAL'`, `'CIVIL'`, or `'MIXED'` | **Yes** |

- **Response Format (`201 Created`)**:
```json
{
  "status": "success",
  "data": {
    "id": "87483ead-333b-4d14-b9ea-75482e4684e6",
    "projectId": "proj_12345",
    "fileName": "Floor_Plan_Level_3.pdf",
    "fileSizeMb": 4.2,
    "drawingType": "ARCHITECTURAL",
    "status": "ANALYZING",
    "imageUrl": "https://your-storage-bucket.com/drawings/Floor_Plan_Level_3.png",
    "createdAt": "2026-08-11T14:00:00Z"
  }
}
```

---

## 2. Drawing Coordinate System & Overlays

To render detected rooms, columns, doors, and walls accurately on top of any screen resolution, all coordinates use a **Normalized 0–1000 Coordinate Scale**.

### Coordinate Standard (0 to 1000)
- `x = 0` is the left edge of the image, `x = 1000` is the right edge.
- `y = 0` is the top edge of the image, `y = 1000` is the bottom edge.

```
(0,0) ───────────────────────────── (1000,0)
  │                                   │
  │     [ymin, xmin, ymax, xmax]       │
  │     e.g., [150, 200, 480, 580]    │
  │                                   │
(0,1000) ────────────────────────── (1000,1000)
```

---

## 3. Spatial Elements Schema

`GET /api/drawings/:id` or bundled with `GET /api/quantities?drawingId=:id`

Each AI-detected element (Room, Column, Beam, Door, Window, Wall) should be returned in this exact structure:

```json
{
  "status": "success",
  "data": {
    "drawingId": "87483ead-333b-4d14-b9ea-75482e4684e6",
    "status": "COMPLETED",
    "elements": [
      {
        "id": "room_101",
        "category": "ROOM",
        "name": "Master Bedroom 101",
        "box_2d": [150, 200, 480, 580],
        "polygon": [
          [200, 150],
          [580, 150],
          [580, 480],
          [200, 480]
        ],
        "area": 32.5,
        "perimeter": 22.8,
        "walls_area": 64.0,
        "doors_count": 1,
        "windows_count": 2,
        "unitPrice": 180
      },
      {
        "id": "col_c1",
        "category": "COLUMN",
        "name": "Column C1 (30x70)",
        "box_2d": [140, 190, 190, 240],
        "length": 0.7,
        "width": 0.3,
        "height": 3.2,
        "volume": 0.672,
        "unitPrice": 4500
      },
      {
        "id": "door_d1",
        "category": "DOOR",
        "name": "Timber Door D1 (90x220)",
        "box_2d": [460, 350, 500, 420],
        "width": 0.9,
        "height": 2.2,
        "area": 1.98,
        "unitPrice": 1200
      }
    ]
  }
}
```

### Supported Categories (`category` enum):
- `'ROOM'` — Floor space polygon, area ($m^2$), perimeter ($m$)
- `'COLUMN'` — Structural column, volume ($m^3$)
- `'BEAM'` — Structural beam, volume ($m^3$) / length ($m$)
- `'SLAB'` — Floor/roof slab, volume ($m^3$) / area ($m^2$)
- `'DOOR'` — Wall opening count / area ($m^2$)
- `'WINDOW'` — Wall opening count / area ($m^2$)
- `'STEEL_BAR'` — Reinforcement tonnage / length ($m$)

---

## 4. Extracted Quantities (Bill of Quantities - BOQ)

`GET /api/quantities?drawingId=:id`

Returns summary items extracted by AI to populate the interactive BOQ table:

```json
{
  "status": "success",
  "data": [
    {
      "id": "q1",
      "code": "CSI-03300",
      "name": "Concrete Column C1 (30x70)",
      "category": "Structural",
      "quantity": 1.344,
      "unit": "m³",
      "unitPrice": 4500,
      "totalPrice": 6048
    },
    {
      "id": "q2",
      "code": "CSI-09300",
      "name": "Master Bedroom Floor Tiling",
      "category": "Finishes",
      "quantity": 32.5,
      "unit": "m²",
      "unitPrice": 180,
      "totalPrice": 5850
    }
  ]
}
```

---

## 5. Manual Measurements API (Canvas Takeoff)

When a user draws a custom polygon area, length line, or pin count on the frontend, the frontend sends:

`POST /api/quantities/manual`

```json
{
  "drawingId": "87483ead-333b-4d14-b9ea-75482e4684e6",
  "type": "AREA",
  "name": "Custom Slab Extension",
  "category": "Custom Area",
  "points": [
    [250, 300],
    [600, 300],
    [600, 550],
    [250, 550]
  ],
  "value": 45.2,
  "unit": "m²",
  "unitPrice": 220,
  "color": "#06b6d4"
}
```

---

## 6. Complete API Endpoint List

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register user (`email`, `name`, `password`) |
| `POST` | `/api/auth/login` | Authenticate user (`email`, `password`) |
| `GET` | `/api/projects` | List all user projects |
| `POST` | `/api/projects` | Create new project |
| `DELETE` | `/api/projects/:id` | Delete project |
| `POST` | `/api/drawings/upload` | Upload PDF/image file (`multipart/form-data`) |
| `GET` | `/api/drawings/project/:projectId` | Get all drawings in project |
| `GET` | `/api/drawings/:id` | Get single drawing details & spatial elements |
| `DELETE` | `/api/drawings/:id` | Delete drawing |
| `GET` | `/api/quantities?drawingId=:id` | Get extracted BOQ items |
| `POST` | `/api/quantities/manual` | Save manual canvas takeoff measurement |
| `GET` | `/api/quantities/export/:projectId` | Stream/download Excel `.xlsx` report |

---

## 7. Real-Time Processing Updates (WebSocket)

When a drawing upload finishes, the backend asynchronously processes the file with AI. It emits status updates over Socket.io:

- **Event Name**: `drawing_status_update`
- **Payload**:
```json
{
  "drawingId": "87483ead-333b-4d14-b9ea-75482e4684e6",
  "status": "COMPLETED",
  "errorMessage": null
}
```
*(Status values: `'PENDING'`, `'ANALYZING'`, `'COMPLETED'`, `'FAILED'`)*
