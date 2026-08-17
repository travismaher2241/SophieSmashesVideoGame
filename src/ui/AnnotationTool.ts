import { CandidateAnnotations, CandidatePoint } from '../course/CandidateAnnotations';
import { GeoTransform } from '../course/GeoTransform';
import { TerrainData } from '../course/TerrainData';

export type AnnotationModeType = 'INSPECT' | 'TEE' | 'GREEN' | 'FAIRWAY' | 'BUNKER' | 'PATH';

export class AnnotationTool {
  private container: HTMLElement;
  private candidateStore: CandidateAnnotations;
  private terrainData: TerrainData;
  private geoTransform: GeoTransform;

  private activeMode: AnnotationModeType = 'INSPECT';
  private activeFeatureId: string | null = null;
  private statusMessage: string = 'Select a surface type, then click its boundary points.';
  private onModeChange?: (mode: AnnotationModeType) => void;
  private onAnnotationsUpdated?: () => void;

  private activeModeBadge!: HTMLElement;
  private candidateSummaryElem!: HTMLElement;
  private statusElem!: HTMLElement;
  private finishButton!: HTMLButtonElement;
  private undoButton!: HTMLButtonElement;
  private cancelButton!: HTMLButtonElement;

  constructor(
    candidateStore: CandidateAnnotations,
    terrainData: TerrainData,
    geoTransform: GeoTransform,
    callbacks: {
      onModeChange?: (mode: AnnotationModeType) => void;
      onAnnotationsUpdated?: () => void;
    }
  ) {
    this.candidateStore = candidateStore;
    this.terrainData = terrainData;
    this.geoTransform = geoTransform;
    this.onModeChange = callbacks.onModeChange;
    this.onAnnotationsUpdated = callbacks.onAnnotationsUpdated;

    this.container = document.createElement('div');
    this.setupStyles();
    this.buildHTML();
    document.body.appendChild(this.container);
    this.updateUI();
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
  }

  public getActiveMode(): AnnotationModeType {
    return this.activeMode;
  }

  public handleTerrainClick(worldX: number, worldZ: number, elevation: number): void {
    if (this.activeMode === 'INSPECT') return;

    const pt: CandidatePoint = {
      x: Math.round(worldX * 10) / 10,
      z: Math.round(worldZ * 10) / 10,
      elevation: Math.round(elevation * 100) / 100,
      label: `UNVERIFIED ${this.activeMode}`,
      isVerified: false
    };

    if (this.activeMode === 'TEE') {
      this.candidateStore.setTee(pt);
      this.activeMode = 'INSPECT';
      this.statusMessage = 'Candidate tee placed.';
    } else if (this.activeMode === 'GREEN') {
      this.candidateStore.setGreenCentre(pt);
      this.activeMode = 'INSPECT';
      this.statusMessage = 'Candidate green centre placed.';
    } else {
      // Fairway, bunker and path modes stay active while the author traces a
      // boundary. The polygon only becomes exportable after Finish Polygon.
      if (this.activeFeatureId === null) {
        this.activeFeatureId = `feat-${Date.now()}`;
        this.candidateStore.addFeature({
          id: this.activeFeatureId,
          type: this.activeMode.toLowerCase() as 'fairway' | 'bunker' | 'path',
          label: `UNVERIFIED ${this.activeMode}`,
          isVerified: false,
          isClosed: false,
          points: [pt]
        });
      } else {
        this.candidateStore.appendFeaturePoint(this.activeFeatureId, pt);
      }

      const pointCount = this.getActiveFeature()?.points.length ?? 0;
      this.statusMessage = `${this.activeMode} draft: ${pointCount} point${pointCount === 1 ? '' : 's'}. ` +
        (pointCount >= 3 ? 'Finish when the boundary is complete.' : `Add ${3 - pointCount} more to form a polygon.`);
    }

    this.updateUI();
    this.onModeChange?.(this.activeMode);
    this.onAnnotationsUpdated?.();
  }

  public updateUI(): void {
    if (this.activeModeBadge) {
      this.activeModeBadge.textContent = this.activeMode;
      this.activeModeBadge.style.color = this.activeMode === 'INSPECT' ? '#aaffaa' : '#ffaa33';
    }

    if (this.candidateSummaryElem) {
      const tee = this.candidateStore.getTee();
      const green = this.candidateStore.getGreenCentre();
      const features = this.candidateStore.getFeatures();
      const closedCount = features.filter((feature) => feature.isClosed).length;
      const activeFeature = this.getActiveFeature();

      const teeStr = tee ? `Tee: (${tee.x}m, ${tee.z}m)` : 'Tee: None';
      const greenStr = green ? `Green: (${green.x}m, ${green.z}m)` : 'Green: None';
      const draftStr = activeFeature
        ? `<div style="color: #ffcc66;">Drafting ${activeFeature.type.toUpperCase()}: ${activeFeature.points.length} points</div>`
        : '';

      this.candidateSummaryElem.innerHTML = `
        <div><b>[UNVERIFIED CANDIDATES]</b></div>
        <div>${teeStr} | ${greenStr}</div>
        <div>Closed polygons: ${closedCount} | Drafts: ${features.length - closedCount}</div>
        ${draftStr}
      `;
    }

    if (this.statusElem) this.statusElem.textContent = this.statusMessage;

    const hasActiveFeature = this.activeFeatureId !== null;
    const pointCount = this.getActiveFeature()?.points.length ?? 0;
    if (this.finishButton) this.finishButton.disabled = !hasActiveFeature || pointCount < 3;
    if (this.undoButton) this.undoButton.disabled = !hasActiveFeature || pointCount === 0;
    if (this.cancelButton) this.cancelButton.disabled = !hasActiveFeature;
  }

  private setupStyles(): void {
    this.container.style.position = 'absolute';
    this.container.style.top = '12px';
    this.container.style.right = '12px';
    this.container.style.padding = '14px 18px';
    this.container.style.backgroundColor = 'rgba(10, 24, 12, 0.9)';
    this.container.style.border = '2px solid #ffaa33';
    this.container.style.borderRadius = '6px';
    this.container.style.color = '#ffeedd';
    this.container.style.fontFamily = "'Courier New', Courier, monospace";
    this.container.style.fontSize = '12px';
    this.container.style.lineHeight = '1.45';
    this.container.style.maxWidth = '380px';
    this.container.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.6)';
    this.container.style.zIndex = '50';
  }

  private buildHTML(): void {
    this.container.innerHTML = `
      <div style="font-weight: bold; font-size: 14px; color: #ffaa33; margin-bottom: 6px; border-bottom: 1px solid #775522; padding-bottom: 4px;">
        🛠️ CANDIDATE ANNOTATION TOOL
      </div>

      <div style="margin-bottom: 8px; font-size: 11px; color: #ffcc88; background: rgba(50, 25, 0, 0.5); padding: 6px; border-left: 3px solid #ffaa33;">
        <b>NOTE:</b> Candidate markers are purely provisional. They do NOT mutate verified course data (<code>hole.json</code>).
      </div>

      <div style="margin-bottom: 8px;">
        <div><b>Active Mode:</b> <span id="ann-active-badge" style="font-weight: bold; color: #aaffaa;">INSPECT</span></div>
      </div>

      <div id="ann-status" style="margin-bottom: 8px; color: #ddffdd; min-height: 32px;">
        Select a surface type, then click its boundary points.
      </div>

      <!-- Mode selection buttons -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px;">
        <button id="btn-ann-inspect" class="ann-btn">Inspect (Click OFF)</button>
        <button id="btn-ann-tee" class="ann-btn">+ Candidate Tee</button>
        <button id="btn-ann-green" class="ann-btn">+ Candidate Green</button>
        <button id="btn-ann-fairway" class="ann-btn">+ Candidate Fairway</button>
        <button id="btn-ann-bunker" class="ann-btn">+ Candidate Bunker</button>
        <button id="btn-ann-path" class="ann-btn">+ Candidate Path</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 10px;">
        <button id="btn-ann-finish" class="ann-action-btn" disabled>Finish Polygon</button>
        <button id="btn-ann-undo" class="ann-action-btn" disabled>Undo Point</button>
        <button id="btn-ann-cancel" class="ann-action-btn" disabled>Cancel Draft</button>
      </div>

      <!-- Candidate summary -->
      <div id="ann-summary" style="margin-bottom: 10px; background: rgba(0, 30, 0, 0.4); padding: 6px; border: 1px solid #336633; border-radius: 4px;">
        <div><b>[UNVERIFIED CANDIDATES]</b></div>
        <div>Tee: None | Green: None</div>
        <div>Total Features: 0</div>
      </div>

      <!-- Actions -->
      <div style="display: flex; gap: 6px;">
        <button id="btn-ann-export" class="ann-action-btn">💾 Download Candidate JSON</button>
        <button id="btn-ann-copy" class="ann-action-btn">📋 Copy to Clipboard</button>
        <button id="btn-ann-clear" class="ann-action-btn" style="background: #441111; border-color: #aa4444;">Clear</button>
      </div>

      <style>
        .ann-btn {
          background: #1d2c1c;
          border: 1px solid #55aa55;
          color: #ddffdd;
          padding: 5px;
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
          border-radius: 3px;
        }
        .ann-btn:hover {
          background: #2d4c2c;
          border-color: #ffaa33;
        }
        .ann-action-btn {
          background: #3a2a12;
          border: 1px solid #ffaa33;
          color: #ffddaa;
          padding: 6px;
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
          border-radius: 3px;
          flex: 1;
        }
        .ann-action-btn:hover {
          background: #5a4a22;
          border-color: #ffeeaa;
        }
        .ann-action-btn:disabled {
          cursor: not-allowed;
          opacity: 0.4;
        }
      </style>
    `;

    this.activeModeBadge = this.container.querySelector('#ann-active-badge')!;
    this.candidateSummaryElem = this.container.querySelector('#ann-summary')!;
    this.statusElem = this.container.querySelector('#ann-status')!;
    this.finishButton = this.container.querySelector('#btn-ann-finish')!;
    this.undoButton = this.container.querySelector('#btn-ann-undo')!;
    this.cancelButton = this.container.querySelector('#btn-ann-cancel')!;

    // Bind button listeners
    this.container.querySelector('#btn-ann-inspect')?.addEventListener('click', () => this.setMode('INSPECT'));
    this.container.querySelector('#btn-ann-tee')?.addEventListener('click', () => this.setMode('TEE'));
    this.container.querySelector('#btn-ann-green')?.addEventListener('click', () => this.setMode('GREEN'));
    this.container.querySelector('#btn-ann-fairway')?.addEventListener('click', () => this.setMode('FAIRWAY'));
    this.container.querySelector('#btn-ann-bunker')?.addEventListener('click', () => this.setMode('BUNKER'));
    this.container.querySelector('#btn-ann-path')?.addEventListener('click', () => this.setMode('PATH'));
    this.finishButton.addEventListener('click', () => this.finishActiveFeature());
    this.undoButton.addEventListener('click', () => this.undoActivePoint());
    this.cancelButton.addEventListener('click', () => this.cancelActiveFeature());

    this.container.querySelector('#btn-ann-clear')?.addEventListener('click', () => {
      this.candidateStore.clearAll();
      this.activeFeatureId = null;
      this.activeMode = 'INSPECT';
      this.statusMessage = 'All candidate annotations cleared.';
      this.updateUI();
      this.onAnnotationsUpdated?.();
    });

    this.container.querySelector('#btn-ann-export')?.addEventListener('click', () => this.exportJSON(true));
    this.container.querySelector('#btn-ann-copy')?.addEventListener('click', () => this.exportJSON(false));
  }

  private setMode(mode: AnnotationModeType): void {
    if (this.activeFeatureId !== null && mode !== this.activeMode) {
      this.statusMessage = 'Finish or cancel the current polygon before changing modes.';
      this.updateUI();
      return;
    }

    this.activeMode = mode;
    this.statusMessage = mode === 'INSPECT'
      ? 'Inspection mode: clicks do not create annotations.'
      : mode === 'TEE' || mode === 'GREEN'
        ? `Click once on the terrain to place the candidate ${mode === 'TEE' ? 'tee' : 'green centre'}.`
        : `Click around the ${mode.toLowerCase()} boundary, then choose Finish Polygon.`;
    this.updateUI();
    this.onModeChange?.(mode);
  }

  private finishActiveFeature(): void {
    if (this.activeFeatureId === null) return;

    try {
      this.candidateStore.closeFeature(this.activeFeatureId);
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : String(error);
      this.updateUI();
      return;
    }

    this.activeFeatureId = null;
    this.activeMode = 'INSPECT';
    this.statusMessage = 'Polygon finished and included in candidate surface export.';
    this.updateUI();
    this.onModeChange?.(this.activeMode);
    this.onAnnotationsUpdated?.();
  }

  private undoActivePoint(): void {
    if (this.activeFeatureId === null) return;
    const remaining = this.candidateStore.removeLastFeaturePoint(this.activeFeatureId);
    if (remaining === 0) {
      this.candidateStore.removeFeature(this.activeFeatureId);
      this.activeFeatureId = null;
      this.statusMessage = 'Draft removed. Select a surface type to start again.';
    } else {
      this.statusMessage = `Removed the last point; ${remaining} point${remaining === 1 ? '' : 's'} remain.`;
    }
    this.updateUI();
    this.onAnnotationsUpdated?.();
  }

  private cancelActiveFeature(): void {
    if (this.activeFeatureId === null) return;
    this.candidateStore.removeFeature(this.activeFeatureId);
    this.activeFeatureId = null;
    this.activeMode = 'INSPECT';
    this.statusMessage = 'Polygon draft cancelled.';
    this.updateUI();
    this.onModeChange?.(this.activeMode);
    this.onAnnotationsUpdated?.();
  }

  private getActiveFeature() {
    if (this.activeFeatureId === null) return undefined;
    return this.candidateStore.getFeatures().find((feature) => feature.id === this.activeFeatureId);
  }

  private exportJSON(downloadFile: boolean): void {
    const candidatePkg = this.candidateStore.generateExportPackage(this.terrainData, this.geoTransform);
    const jsonStr = JSON.stringify(candidatePkg, null, 2);

    if (candidatePkg.incompleteFeatures.length > 0) {
      this.statusMessage = `${candidatePkg.incompleteFeatures.length} unfinished draft(s) excluded from candidateSurfaces.`;
      this.updateUI();
    }

    if (downloadFile) {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `warragul_hole06_candidate_layout.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      navigator.clipboard.writeText(jsonStr).then(() => {
        alert('Candidate layout JSON copied to clipboard!');
      }).catch((err) => {
        console.error('Clipboard copy failed:', err);
        alert('Copy failed. Check browser permissions.');
      });
    }
  }
}
