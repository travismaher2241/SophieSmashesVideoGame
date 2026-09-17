export type GameStateType =
  | 'TITLE'
  | 'LAYOUT_SELECTION'
  /** The hole shown from above with the flyby running, before the tee shot. */
  | 'HOLE_PREVIEW'
  | 'ADDRESS'
  | 'SWINGING'
  | 'BALL_FLIGHT'
  | 'BALL_ROLLING'
  | 'HOLED'
  | 'DEV_ALIGNMENT';

export class GameStateManager {
  private currentState: GameStateType = 'TITLE';
  private previousState: GameStateType = 'TITLE';
  private onStateChangeCallbacks: ((newState: GameStateType, prevState: GameStateType) => void)[] = [];

  public getState(): GameStateType {
    return this.currentState;
  }

  public setState(newState: GameStateType): void {
    if (this.currentState === newState) return;
    this.previousState = this.currentState;
    this.currentState = newState;

    this.onStateChangeCallbacks.forEach((cb) => cb(newState, this.previousState));
  }

  public restorePreviousState(): void {
    this.setState(this.previousState);
  }

  public subscribe(callback: (newState: GameStateType, prevState: GameStateType) => void): () => void {
    this.onStateChangeCallbacks.push(callback);
    return () => {
      this.onStateChangeCallbacks = this.onStateChangeCallbacks.filter((cb) => cb !== callback);
    };
  }
}
