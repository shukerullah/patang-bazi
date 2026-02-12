// ============================================
// PATANG BAZI — Lobby UI
// Name entry → connect → waiting → countdown
// Game over → results → fresh lobby
// Loading state for slow server wake-up
// ============================================

export type LobbyCallback = (name: string) => void;

export class LobbyUI {
  private overlay: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private playerListEl!: HTMLDivElement;
  private countdownEl!: HTMLDivElement;
  private connectBtn!: HTMLButtonElement;
  private nameInput!: HTMLInputElement;
  private loadingEl!: HTMLDivElement;
  private instructionsEl!: HTMLDivElement;
  private onConnect: LobbyCallback;

  constructor(onConnect: LobbyCallback) {
    this.onConnect = onConnect;
    this.overlay = document.createElement('div');
    this.overlay.id = 'lobby-overlay';
    this.overlay.innerHTML = `
      <style>
        #lobby-overlay {
          position: fixed; inset: 0; z-index: 30;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          background: rgba(10,5,25,0.88);
          backdrop-filter: blur(20px);
          font-family: 'Poppins', sans-serif;
          transition: opacity 0.6s ease;
        }
        #lobby-overlay.hidden { opacity: 0; pointer-events: none; }
        .lobby-kite { font-size: 72px; margin-bottom: 8px; animation: kbob 3s ease-in-out infinite; }
        @keyframes kbob { 0%,100% { transform: translateY(0) rotate(-5deg); } 50% { transform: translateY(-15px) rotate(5deg); } }
        .lobby-title { font-family: 'Baloo 2', cursive; font-size: 48px; font-weight: 800; color: #fff;
          text-shadow: 0 4px 30px rgba(255,150,50,0.4); margin-bottom: 6px; }
        .lobby-sub { font-size: 15px; color: rgba(255,255,255,0.45); margin-bottom: 28px; font-weight: 300; }
        .lobby-form { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
        .lobby-input {
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 12px; padding: 12px 20px; font-size: 16px; color: #fff;
          font-family: 'Poppins', sans-serif; outline: none; width: 220px;
          transition: border-color 0.2s;
        }
        .lobby-input:focus { border-color: rgba(255,214,102,0.5); }
        .lobby-input::placeholder { color: rgba(255,255,255,0.3); }
        .lobby-btn {
          background: linear-gradient(135deg, #ff8a3d, #ff5e62); border: none;
          border-radius: 50px; padding: 12px 36px;
          font-family: 'Baloo 2', cursive; font-size: 20px; font-weight: 700;
          color: #fff; cursor: pointer;
          box-shadow: 0 6px 24px rgba(255,94,98,0.4);
          transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;
        }
        .lobby-btn:hover { transform: scale(1.05); box-shadow: 0 10px 32px rgba(255,94,98,0.5); }
        .lobby-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .lobby-status {
          font-size: 14px; color: rgba(255,255,255,0.5); margin-top: 12px;
          min-height: 20px; transition: color 0.3s; text-align: center;
          max-width: 500px; line-height: 1.5;
        }
        .lobby-status.error { color: #ff6b6b; }
        .lobby-players {
          margin-top: 20px; display: flex; flex-direction: column;
          align-items: center; gap: 8px; min-height: 40px;
        }
        .lobby-player {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; padding: 6px 18px;
          font-size: 13px; color: rgba(255,255,255,0.7); display: flex; align-items: center; gap: 8px;
        }
        .lobby-player .dot { width: 8px; height: 8px; border-radius: 50%; }
        .lobby-countdown {
          font-family: 'Baloo 2', cursive; font-size: 96px; font-weight: 800;
          color: #ffd666; text-shadow: 0 4px 40px rgba(255,180,50,0.5);
          display: none;
        }
        .lobby-countdown.active { display: block; animation: countPulse 1s ease-in-out infinite; }
        @keyframes countPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        .lobby-instructions {
          margin-top: 24px; text-align: center; color: rgba(255,255,255,0.3);
          font-size: 12px; display: flex; flex-direction: column; gap: 8px;
          padding: 0 16px; width: 100%; box-sizing: border-box;
        }
        .lobby-instructions kbd {
          background: rgba(255,214,102,0.12); border: 1px solid rgba(255,214,102,0.2);
          border-radius: 4px; padding: 2px 7px; color: #ffd666; font-weight: 600;
          font-family: inherit; font-size: 11px;
        }
        /* Loading spinner */
        .lobby-loading {
          display: none; flex-direction: column; align-items: center; gap: 16px;
          margin-top: 12px;
        }
        .lobby-loading.active { display: flex; }
        .lobby-spinner {
          width: 32px; height: 32px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: #ffd666;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .lobby-loading-text {
          font-size: 13px; color: rgba(255,255,255,0.45); text-align: center;
        }
        /* Mobile responsive */
        @media (max-width: 600px) {
          .lobby-kite { font-size: 48px; margin-bottom: 4px; }
          .lobby-title { font-size: 32px; }
          .lobby-sub { font-size: 13px; margin-bottom: 20px; }
          .lobby-form { flex-direction: column; gap: 10px; }
          .lobby-input { width: 220px; padding: 10px 16px; font-size: 15px; }
          .lobby-btn { padding: 10px 32px; font-size: 18px; }
          .lobby-status { font-size: 12px; max-width: 300px; }
          .lobby-countdown { font-size: 64px; }
          .lobby-instructions { font-size: 11px; line-height: 1.8; margin-top: 16px; padding-horizontal: 16:px; }
        }
        @media (max-width: 360px) {
          .lobby-title { font-size: 26px; }
          .lobby-input { width: 180px; }
        }
      </style>
      <div class="lobby-kite">🪁</div>
      <div class="lobby-title">PATANG BAZI</div>
      <div class="lobby-sub">Multiplayer Kite Fighting</div>
      <div class="lobby-form">
        <input class="lobby-input" id="lobby-name" type="text" placeholder="Your name..." maxlength="16" />
        <button class="lobby-btn" id="lobby-connect">FLY! 🪁</button>
      </div>
      <div class="lobby-loading" id="lobby-loading">
        <div class="lobby-spinner"></div>
        <div class="lobby-loading-text" id="lobby-loading-text">Waking up server...</div>
      </div>
      <div class="lobby-status" id="lobby-status"></div>
      <div class="lobby-players" id="lobby-players"></div>
      <div class="lobby-countdown" id="lobby-countdown">3</div>
      <div class="lobby-instructions" id="lobby-instructions">
        <div><kbd>SPACE</kbd> or <kbd>CLICK</kbd> to pull string & fly up</div>
        <div><kbd>← →</kbd> or <kbd>A D</kbd> to steer · Catch ⭐ stars · Cut opponents' strings!</div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    this.nameInput = document.getElementById('lobby-name') as HTMLInputElement;
    this.connectBtn = document.getElementById('lobby-connect') as HTMLButtonElement;
    this.statusEl = document.getElementById('lobby-status') as HTMLDivElement;
    this.playerListEl = document.getElementById('lobby-players') as HTMLDivElement;
    this.countdownEl = document.getElementById('lobby-countdown') as HTMLDivElement;
    this.loadingEl = document.getElementById('lobby-loading') as HTMLDivElement;
    this.instructionsEl = document.getElementById('lobby-instructions') as HTMLDivElement;

    // Random default name
    const names = ['Ustaad', 'Patangbaaz', 'Sultan', 'Dorbaaz', 'Shikari', 'Khiladi', 'Pilot', 'Hawk', 'Eagle', 'Falcon'];
    this.nameInput.value = names[Math.floor(Math.random() * names.length)] +
      Math.floor(Math.random() * 99);

    this.connectBtn.addEventListener('click', () => this.doConnect());
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.doConnect();
    });

    // Auto-focus
    setTimeout(() => this.nameInput.focus(), 100);
  }

  private doConnect() {
    const name = this.nameInput.value.trim() || 'Player';
    this.connectBtn.disabled = true;
    this.nameInput.disabled = true;
    this.onConnect(name);
  }

  setStatus(text: string, isError = false) {
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle('error', isError);
  }

  /** Show/hide loading spinner (for Render cold starts) */
  showLoading(text = 'Waking up server...') {
    this.loadingEl.classList.add('active');
    const textEl = document.getElementById('lobby-loading-text');
    if (textEl) textEl.textContent = text;
  }

  hideLoading() {
    this.loadingEl.classList.remove('active');
  }

  updatePlayers(players: Array<{ name: string; color: string; isLocal: boolean; ready: boolean }>) {
    this.playerListEl.innerHTML = players.map(p => `
      <div class="lobby-player">
        <div class="dot" style="background: ${p.color}"></div>
        ${p.name}${p.isLocal ? ' (you)' : ''}
        ${p.ready ? ' ✓' : ''}
      </div>
    `).join('');
  }

  showCountdown(n: number) {
    this.countdownEl.textContent = String(n);
    this.countdownEl.classList.add('active');
  }

  hide() {
    this.overlay.classList.add('hidden');
  }

  show() {
    this.overlay.classList.remove('hidden');
  }

  /** Full reset to fresh "FLY!" state (after game over) */
  reset() {
    this.overlay.classList.remove('hidden');
    this.connectBtn.disabled = false;
    this.connectBtn.textContent = 'FLY! 🪁';
    this.nameInput.disabled = false;
    this.statusEl.textContent = '';
    this.statusEl.classList.remove('error');
    this.playerListEl.innerHTML = '';
    this.countdownEl.classList.remove('active');
    this.loadingEl.classList.remove('active');
    this.instructionsEl.style.display = '';
    // Keep the player's name from last game
  }

  /** Show results briefly with disabled input (between games) */
  showResults(text: string) {
    this.overlay.classList.remove('hidden');
    this.connectBtn.disabled = true;
    this.nameInput.disabled = true;
    this.statusEl.textContent = text;
    this.statusEl.classList.remove('error');
    this.playerListEl.innerHTML = '';
    this.countdownEl.classList.remove('active');
    this.loadingEl.classList.remove('active');
  }

  /** Show error state with reconnect available */
  showError(text: string) {
    this.overlay.classList.remove('hidden');
    this.connectBtn.disabled = false;
    this.connectBtn.textContent = 'FLY! 🪁';
    this.nameInput.disabled = false;
    this.statusEl.textContent = text;
    this.statusEl.classList.add('error');
    this.playerListEl.innerHTML = '';
    this.countdownEl.classList.remove('active');
    this.loadingEl.classList.remove('active');
  }

  destroy() {
    this.overlay.remove();
  }
}
