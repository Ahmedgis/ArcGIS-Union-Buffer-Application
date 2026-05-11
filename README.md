# ArcGIS Union Buffer Application

A high-performance Angular application designed to calculate and render unioned buffer polygons for user-defined geographic points.

## Features
- **Interactive Mapping**: Powered by ArcGIS Maps SDK for JavaScript (v5.0).
- **Reactive Buffer Calculation**: Uses `Geometry Operators` for efficient, real-time union and buffer operations.
- **Modern Angular**: Built with Angular 17+ standalone components and RxJS for state management.

## Getting Started

### Prerequisites
- Node.js (Latest LTS recommended)
- npm

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
Start the development server:
```bash
npm start
```
Navigate to `http://localhost:4200/`.

## Core Logic
The application utilizes modern ArcGIS Geometry Operators to:
1. Buffer individual point geometries.
2. Perform a union operation on the resulting polygons.
3. Render the final result as a single unified graphic on the map.

## Technologies
- **Frontend**: Angular (Standalone)
- **GIS**: @arcgis/core
- **State**: RxJS
- **Build**: Angular CLI / Vitest
