// ============================================
// PATANG BAZI — Lobby UI
// Name entry → connect → waiting → countdown
// ============================================

export type LobbyCallback = (name: string) => void;

export class LobbyUI {
  private overlay: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private playerListEl!: HTMLDivElement;
  private countdownEl!: HTMLDivElement;
  private connectBtn!: HTMLButtonElement;
  private nameInput!: HTMLInputElement;

  constructor(onConnect: LobbyCallback) {
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
          min-height: 20px; transition: color 0.3s;
        }
        .lobby-status.error { color: #ff6b6b; }
        .lobby-players {
          margin-top: 20px; display: flex; flex-direction: column;
          align-items: center; gap: 8px; min-height: 60px;
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
          font-size: 12px; line-height: 2;
        }
        .lobby-instructions kbd {
          background: rgba(255,214,102,0.12); border: 1px solid rgba(255,214,102,0.2);
          border-radius: 4px; padding: 1px 7px; color: #ffd666; font-weight: 600;
        }
      </style>
      <div class="lobby-kite">🪁</div>
      <div class="lobby-title">PATANG BAZI</div>
      <div class="lobby-sub">Multiplayer Kite Fighting</div>
      <div class="lobby-form">
        <input class="lobby-input" id="lobby-name" type="text" placeholder="Your name..." maxlength="16" />
        <button class="lobby-btn" id="lobby-connect">FLY! 🪁</button>
      </div>
      <div class="lobby-status" id="lobby-status"></div>
      <div class="lobby-players" id="lobby-players"></div>
      <div class="lobby-countdown" id="lobby-countdown">3</div>
      <div class="lobby-instructions">
        <kbd>SPACE</kbd> or <kbd>CLICK</kbd> to pull string & fly up<br>
        <kbd>← →</kbd> or <kbd>A D</kbd> to steer · Catch ⭐ stars · Cut opponents' strings!
      </div>
    `;
    document.body.appendChild(this.overlay);

    this.nameInput = document.getElementById('lobby-name') as HTMLInputElement;
    this.connectBtn = document.getElementById('lobby-connect') as HTMLButtonElement;
    this.statusEl = document.getElementById('lobby-status') as HTMLDivElement;
    this.playerListEl = document.getElementById('lobby-players') as HTMLDivElement;
    this.countdownEl = document.getElementById('lobby-countdown') as HTMLDivElement;

    // Random default name
    const names = ['Ustaad', 'Patangbaaz', 'Pilot', 'Hawk', 'Eagle', 'Falcon'];
    this.nameInput.value = names[Math.floor(Math.random() * names.length)] +
      Math.floor(Math.random() * 99);

    // Connect on click or Enter
    const doConnect = () => {
      const name = this.nameInput.value.trim() || 'Player';
      this.connectBtn.disabled = true;
      this.nameInput.disabled = true;
      this.setStatus('Connecting...');
      onConnect(name);
    };

    this.connectBtn.addEventListener('click', doConnect);
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doConnect();
    });

    // Auto-focus
    setTimeout(() => this.nameInput.focus(), 100);
  }

  setStatus(text: string, isError = false) {
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle('error', isError);
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
    this.connectBtn.disabled = false;
    this.nameInput.disabled = false;
  }

  enableReconnect() {
    this.connectBtn.disabled = false;
    this.nameInput.disabled = false;
    this.connectBtn.textContent = 'RECONNECT 🪁';
  }

  destroy() {
    this.overlay.remove();
  }
}
