import { Component, ElementRef, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import PictureMarkerSymbol from '@arcgis/core/symbols/PictureMarkerSymbol';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import * as geodesicBufferOperator from '@arcgis/core/geometry/operators/geodesicBufferOperator';
import * as unionOperator from '@arcgis/core/geometry/operators/unionOperator';

interface CirclePoint {
  id: number;
  point: Point;
  radius: number;
  graphic: Graphic;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) private mapViewEl!: ElementRef;

  // ArcGIS Members
  private view!: MapView;
  private pointsLayer = new GraphicsLayer();
  private circlesLayer = new GraphicsLayer();
  private resultLayer = new GraphicsLayer();
  private sketchVM!: SketchViewModel;

  // State
  points: CirclePoint[] = [];
  isDrawMode = false;
  private pointIdCounter = 1;

  // RxJS for performance
  private recalculateSubject = new Subject<void>();
  private subscriptions = new Subscription();

  constructor() {}

  ngOnInit(): void {
    this.initializeMap();
    
    // Subscribe to recalculate events with debounce
    this.subscriptions.add(
      this.recalculateSubject.pipe(debounceTime(50)).subscribe(() => {
        this.updateUnion();
      })
    );
  }

  ngOnDestroy(): void {
    if (this.view) {
      this.view.destroy();
    }
    this.subscriptions.unsubscribe();
  }

  private async initializeMap(): Promise<void> {
    const map = new Map({
      basemap: 'streets-navigation-vector'
    });

    // Add layers in specific order: Result (bottom), Circles (middle), Points (top)
    map.addMany([this.resultLayer, this.circlesLayer, this.pointsLayer]);

    this.view = new MapView({
      container: this.mapViewEl.nativeElement,
      map: map,
      center: [31.2357, 30.0444], // Cairo, Egypt
      zoom: 10,
      ui: { components: ["zoom", "compass"] }
    });

    await this.view.when();
    this.setupSketchVM();
    this.setupEventListeners();
  }

  private setupSketchVM(): void {
    this.sketchVM = new SketchViewModel({
      view: this.view,
      layer: this.pointsLayer,
      pointSymbol: new PictureMarkerSymbol({
        url: 'https://static.arcgis.com/images/Symbols/Shapes/BluePin1LargeB.png',
        width: '32px',
        height: '32px'
      }),
      updateOnGraphicClick: true,
      defaultUpdateOptions: {
        enableRotation: false,
        enableScaling: false
      }
    });

    // Handle sketch updates (moving points)
    this.sketchVM.on('update', (event) => {
      if (event.state === 'active' || event.state === 'complete') {
        event.graphics.forEach((graphic) => {
          const pointId = (graphic as any).attributes?.id;
          const pointState = this.points.find(p => p.id === pointId);
          if (pointState) {
            pointState.point = graphic.geometry as Point;
            this.recalculateSubject.next();
          }
        });
      }
    });

    // Handle point creation via click when in draw mode
    this.view.on('click', async (event) => {
      if (this.isDrawMode) {
        // Only add a point if we didn't click an existing graphic
        const response = await this.view.hitTest(event);
        const hasPointGraphic = response.results.some(
          (result) => result.type === 'graphic' && result.graphic.layer === this.pointsLayer
        );

        if (!hasPointGraphic) {
          this.addPoint(event.mapPoint);
        }
      }
    });
  }

  private setupEventListeners(): void {
    // Prevent default sketch behavior for create if needed, 
    // but here we use manual click handling to stay simple.
  }

  toggleDrawMode(): void {
    this.isDrawMode = !this.isDrawMode;
    
    if (this.view?.container && typeof this.view.container !== 'string') {
      this.view.container.style.cursor = this.isDrawMode ? 'crosshair' : 'default';
    }

    if (!this.isDrawMode) {
      this.sketchVM?.cancel();
    }
  }

  private addPoint(mapPoint: Point): void {
    const id = this.pointIdCounter++;
    
    const graphic = new Graphic({
      geometry: mapPoint,
      symbol: new PictureMarkerSymbol({
        url: 'https://static.arcgis.com/images/Symbols/Shapes/BluePin1LargeB.png',
        width: '32px',
        height: '32px'
      }),
      attributes: { id }
    });

    this.points.push({
      id,
      point: mapPoint,
      radius: 2000, // Default 2km
      graphic
    });

    this.pointsLayer.add(graphic);
    this.recalculateSubject.next();
  }

  deletePoint(id: number): void {
    const index = this.points.findIndex(p => p.id === id);
    if (index > -1) {
      const removed = this.points.splice(index, 1)[0];
      this.pointsLayer.remove(removed.graphic);
      this.recalculateSubject.next();
    }
  }

  onRadiusChange(): void {
    this.recalculateSubject.next();
  }

  private async updateUnion(): Promise<void> {
    this.circlesLayer.removeAll();
    this.resultLayer.removeAll();

    if (this.points.length === 0) return;

    try {
      // Ensure operators are loaded
      if (!geodesicBufferOperator.isLoaded()) await geodesicBufferOperator.load();

      // Calculate individual buffers using the operator
      const buffers = this.points.map(p => 
        geodesicBufferOperator.execute(p.point, p.radius, { unit: 'meters' })
      ).filter(b => !!b) as Polygon[];

      // Draw individual buffers (gray outline, transparent fill)
      // const circleGraphics = buffers.map(buffer => new Graphic({
      //   geometry: buffer,
      //   symbol: {
      //     type: 'simple-fill',
      //     color: [0, 0, 0, 0],
      //     outline: { color: [128, 128, 128, 0.5], width: 1 }
      //   } as any
      // }));
      // this.circlesLayer.addMany(circleGraphics);

      // Calculate Union using the operator
      if (buffers.length > 0) {
        const unionedGeometry = unionOperator.executeMany(buffers) as Polygon;
        
        if (unionedGeometry) {
          const resultGraphic = new Graphic({
            geometry: unionedGeometry,
            symbol: {
              type: 'simple-fill',
              color: [0, 0, 0, 0],
              outline: { color: 'red', width: 2 }
            } as any
          });
          this.resultLayer.add(resultGraphic);
        }
      }
    } catch (error) {
      console.error('Geometry calculation failed', error);
    }
  }

  trackById(index: number, item: CirclePoint): number {
    return item.id;
  }
}
