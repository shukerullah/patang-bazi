// ============================================
// PATANG BAZI — Input Manager
// Unified input: keyboard, pointer, touch
// Mouse & touch: press = pull, screen position = steer
// ============================================

export class InputManager {
  private keys = new Set<string>();

  // Pointer (mouse) — works like touch now
  private pointerDown = false;
  private pointerSteer = 0; // -1, 0, 1

  // Mobile touch regions
  private touchSteer = 0; // -1, 0, 1
  private touchPull = false;

  constructor(canvas: HTMLCanvasElement) {
    this.bindKeyboard();
    this.bindPointer(canvas);
    this.bindTouch(canvas);
  }

  // --- Public API ---

  isPulling(): boolean {
    return (
      this.keys.has('Space') ||
      this.pointerDown ||
      this.touchPull
    );
  }

  getSteer(): number {
    let steer = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) steer -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) steer += 1;
    // Mouse position steer (when clicking)
    if (this.pointerDown && this.pointerSteer !== 0 && steer === 0) steer = this.pointerSteer;
    // Touch always overrides
    if (this.touchSteer !== 0) steer = this.touchSteer;
    return steer;
  }

  // --- Keyboard ---

  private bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // Clear on blur (tab switch etc)
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointerDown = false;
      this.pointerSteer = 0;
    });
  }

  // --- Pointer (mouse / trackpad) — same behavior as touch ---

  private bindPointer(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // Handle in touch
      this.pointerDown = true;
      this.updatePointerSteer(e.clientX);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (this.pointerDown) {
        this.updatePointerSteer(e.clientX);
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointerDown = false;
      this.pointerSteer = 0;
    });

    canvas.addEventListener('pointerleave', () => {
      this.pointerDown = false;
      this.pointerSteer = 0;
    });
  }

  /** Convert pointer X position to steer direction (same zones as touch) */
  private updatePointerSteer(clientX: number) {
    const screenW = window.innerWidth;
    if (clientX < screenW * 0.4) {
      this.pointerSteer = -1;
    } else if (clientX > screenW * 0.6) {
      this.pointerSteer = 1;
    } else {
      this.pointerSteer = 0;
    }
  }

  // --- Touch (mobile) ---

  private bindTouch(canvas: HTMLCanvasElement) {
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.processTouches(e.touches);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.processTouches(e.touches);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        this.touchPull = false;
        this.touchSteer = 0;
      } else {
        this.processTouches(e.touches);
      }
    }, { passive: false });
  }

  private processTouches(touches: TouchList) {
    const screenW = window.innerWidth;

    this.touchPull = false;
    this.touchSteer = 0;

    if (touches.length === 0) return;

    const touch = touches[0]; // only use first touch
    const x = touch.clientX;

    this.touchPull = true;

    if (x < screenW * 0.4) {
      this.touchSteer = -1;
    } else if (x > screenW * 0.6) {
      this.touchSteer = 1;
    }
  }

  destroy() {
    // In a full implementation, remove all listeners
  }
}
