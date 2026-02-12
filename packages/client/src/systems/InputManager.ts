// ============================================
// PATANG BAZI — Input Manager
// Unified input: keyboard, pointer, touch, gamepad
// ============================================

export class InputManager {
  private keys = new Set<string>();
  private pointerDown = false;

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
    });
  }

  // --- Pointer (mouse / trackpad) ---

  private bindPointer(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // Handle in touch
      this.pointerDown = true;
    });

    canvas.addEventListener('pointerup', () => {
      this.pointerDown = false;
    });

    canvas.addEventListener('pointerleave', () => {
      this.pointerDown = false;
    });
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
