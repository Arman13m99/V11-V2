# 📁 SnappFood vs TapsiFood Price Comparator V 11-V2 - Project Structure

```
📦 snappfood-tapsifood-comparator/
├── 📄 README.md                          # Project documentation
├── 📄 manifest.json                      # Chrome extension configuration
├── 📄 background.js                      # Service worker (API communication)
│
├── 📁 popup/                             # Extension popup interface
│   ├── 📄 popup.html                     # Popup UI structure
│   ├── 📄 popup.css                      # Popup styling
│   └── 📄 popup.js                       # Popup functionality
│
├── 📁 content/                           # Content scripts (page injection)
│   └── 📄 universal-injector.js          # Single unified content script
│
├── 📁 styles/                            # Styling files
│   └── 📄 injected-styles.css            # Styles for injected elements
│
└── 📁 assets/                            # Extension assets
    ├── 🖼️ icon16.png                      # 16x16 extension icon
    ├── 🖼️ icon48.png                      # 48x48 extension icon
    └── 🖼️ icon128.png                     # 128x128 extension icon
```

## 📊 File Size Overview
- **Total Files**: 9
- **JavaScript Files**: 3 (~45KB)
- **CSS Files**: 1 (~15KB)
- **HTML Files**: 1 (~3KB)
- **Assets**: 3 icons (~12KB)
- **Total Package**: ~75KB


 How It Works
System Architecture
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chrome        │    │   FastAPI        │    │   Live Price    │
│   Extension     │◄──►│   Backend        │◄──►│   APIs          │
│                 │    │   Server         │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
    ┌────▼────┐              ┌────▼────┐              ┌────▼────┐
    │Content  │              │Restaurant│              │SnappFood│
    │Scripts  │              │& Item    │              │TapsiFood│
    │         │              │Mappings  │              │APIs     │
    └─────────┘              └─────────┘              └─────────┘
Data Flow

Detection: Extension detects vendor codes from page URLs
API Request: Queries FastAPI server for restaurant mappings
Live Fetching: Retrieves current prices from both platforms simultaneously
Comparison: Calculates price differences using AI-powered item matching
Display: Injects comparison results seamlessly into the page


🛠️ Technical Stack
Frontend (Chrome Extension)

Vanilla JavaScript: High-performance, no dependencies
CSS3: Modern styling with animations and Persian fonts
Chrome Extension APIs: Manifest V3 compliance

Backend (Required)

FastAPI Server: Python-based API server on port 8000
Restaurant Database: Vendor mappings and item correlations
Real-time APIs: Live integration with SnappFood and TapsiFood

Performance

Optimized Processing: Chunk-based rendering for large datasets
Smart Caching: 5-minute cache for vendor data, 10-minute for vendor lists
Memory Management: WeakMap/WeakSet usage prevents memory leaks
Non-blocking Operations: Uses requestIdleCallback for smooth UX


🎨 User Experience
Visual Design

Native Integration: Matches platform design languages perfectly
Professional Badges: Same styling as existing platform badges
Color Psychology:

Green for savings
Red for warnings
Yellow for recommendations


Smooth Animations: Subtle hover effects and transitions

Interaction Patterns

Click-to-Navigate: Seamless switching between platforms
Hover Tooltips: Contextual information on demand
Floating Widget: Unobtrusive search functionality
Progressive Enhancement: Works without disrupting existing functionality

GET /health                                    # Health check
GET /vendors?limit=1000                        # Vendor list
GET /extension/vendor-data/{platform}/{code}  # Vendor mappings

**Food Price Comparator API**

**Version:** 1.0.0\
**OpenAPI Specification:** 3.1\
**Base Path:** `/`\
**Specification File:** `/openapi.json`

An API for comparing food prices between SnappFood and TapsiFood.

---

### Overview

This API exposes endpoints to retrieve vendor mappings, item mappings, and statistics to support price comparison across two major food delivery platforms:

- **SnappFood (SF)**
- **TapsiFood (TF)**

All endpoints are public (no authentication required by default).

---

## Endpoints

### Health Check

- **GET** `/health`
  - **Description:** Simple liveness endpoint to verify the API is up.
  - **Response Code:** `200 OK`
  - **Response Body:** `null`

```json
null
```

---

### Get Stats

- **GET** `/stats`
  - **Description:** Returns global statistics about vendor and item mappings.
  - **Response Code:** `200 OK`
  - **Response Schema:** `StatsResponse`

```json
{
  "total_vendors": 0,
  "total_items": 0,
  "unique_sf_vendors": 0,
  "unique_tf_vendors": 0
}
```

---

### Vendor Endpoints

#### Get All Vendors

- **GET** `/vendors`
  - **Description:** Retrieves a paginated list of all vendor mappings.
  - **Query Parameters:**
    - `limit` (integer, 1–1000, default: 100) — Number of records to return.
    - `offset` (integer, ≥0, default: 0) — Record offset for pagination.
    - `business_line` (string or `null`) — Filter by business line.
  - **Response Code:** `200 OK` or `422 Validation Error`
  - **Response Schema:** Array of `VendorMappingResponse` objects.

```json
[
  {
    "id": 0,
    "sf_code": "string",
    "sf_name": "string",
    "tf_code": "string",
    "tf_name": "string",
    "business_line": "string",
    "created_at": "2019-08-24T14:15:22Z"
  }
]
```

#### Get Vendor by SnappFood Code

- **GET** `/vendors/sf/{sf_code}`
  - **Description:** Retrieve a vendor mapping by its SF code.
  - **Path Parameter:**
    - `sf_code` (string) — The SnappFood vendor code.
  - **Response Code:** `200 OK` or `422 Validation Error`
  - **Response Schema:** `VendorLookupResponse` + `item_count`

```json
{
  "vendor_mapping": { /* VendorMappingResponse */ },
  "item_count": 0
}
```

#### Get Vendor by TapsiFood Code

- **GET** `/vendors/tf/{tf_code}`
  - **Description:** Retrieve a vendor mapping by its TF code.
  - **Path Parameter:**
    - `tf_code` (string) — The TapsiFood vendor code.
  - **Response Code:** `200 OK` or `422 Validation Error`
  - **Response Schema:** `VendorLookupResponse` + `item_count`

```json
{
  "vendor_mapping": { /* VendorMappingResponse */ },
  "item_count": 0
}
```

---

### Item Endpoints

#### Get Items by SnappFood Code

- **GET** `/items/sf/{sf_code}`
  - **Description:** Retrieve all item mappings for a given SF vendor.
  - **Path Parameter:**
    - `sf_code` (string) — The SnappFood vendor code.
  - **Response Code:** `200 OK` or `422 Validation Error`
  - **Response Schema:** `ItemMappingsResponse`

```json
{
  "sf_code": "string",
  "tf_code": "string",
  "sf_name": "string",
  "tf_name": "string",
  "mappings": [ { /* item mapping */ } ]
}
```

#### Get Items by TapsiFood Code

- **GET** `/items/tf/{tf_code}`
  - **Description:** Retrieve all item mappings for a given TF vendor.
  - **Path Parameter:**
    - `tf_code` (string) — The TapsiFood vendor code.
  - **Response Code:** `200 OK` or `422 Validation Error`
  - **Response Schema:** `ItemMappingsResponse`

```json
{
  "sf_code": "string",
  "tf_code": "string",
  "sf_name": "string",
  "tf_name": "string",
  "mappings": [ { /* item mapping */ } ]
}
```

---

### Extension Endpoint

#### Get Vendor Data for Extension

- **GET** `/extension/vendor-data/{platform}/{vendor_code}`
  - **Description:** Optimized endpoint for browser extension. Returns vendor info and all item mappings.
  - **Path Parameters:**
    - `platform` (string) — Platform identifier (`"sf"` or `"tf"`).
    - `vendor_code` (string) — The vendor code for the specified platform.
  - **Response Code:** `200 OK` or `422 Validation Error`
  - **Response Body:** Vendor + item mappings in one combined payload.

```json
null
```

---

### Search Vendors

- **GET** `/search/vendors`
  - **Description:** Search vendors by name across both platforms.
  - **Query Parameters:**
    - `q` (string, ≥2 chars) — Search query.
    - `limit` (integer, 1–100, default: 20) — Maximum number of results.
  - **Response Code:** `200 OK` or `422 Validation Error`
  - **Response Body:** Array of `VendorLookupResponse`.

```json
null
```

---

### Root

- **GET** `/`
  - **Description:** API root endpoint. Returns basic metadata.
  - **Response Code:** `200 OK`
  - **Response Body:** `null`

```json
null
```

---

## Schemas

- **HTTPValidationError**: Error details for validation failures.
- **ValidationError**: Single validation error.
- **StatsResponse**: `{ total_vendors, total_items, unique_sf_vendors, unique_tf_vendors }`
- **VendorMappingResponse**: Mapping between SF and TF vendors (`id, sf_code, sf_name, tf_code, tf_name, business_line, created_at`).
- **VendorLookupResponse**: `{ vendor_mapping: VendorMappingResponse, item_count: integer }`
- **ItemMappingsResponse**: `{ sf_code, tf_code, sf_name, tf_name, mappings: array of item-level mappings }`

---

*For full details and to download the complete OpenAPI specification, visit **``**.*

