import { html, $ } from '../dom.js';

/** Real asset progress, a retry on failure, and the click that unlocks audio. */
export default class LoadingScreen {
  constructor(container) {
    this.el = html(`
      <section class="screen loading">
        <div class="brand">
          <h1 class="brand__title">NITRO<b>CLASH</b></h1>
        </div>
        <div class="loading__bar"><i></i></div>
        <p class="loading__status" role="status">Preparing assets…</p>
        <div class="loading__actions">
          <button class="btn btn--primary loading__start" type="button" hidden>Press to start</button>
          <button class="btn loading__retry" type="button" hidden>Retry</button>
        </div>
      </section>`);
    container.appendChild(this.el);
    this.bar = $(this.el, '.loading__bar i');
    this.status = $(this.el, '.loading__status');
    this.startButton = $(this.el, '.loading__start');
    this.retryButton = $(this.el, '.loading__retry');
  }

  progress(percent, label) {
    this.bar.style.width = `${percent}%`;
    this.status.textContent = label;
  }

  failed(message, onRetry) {
    this.status.textContent = message;
    this.el.classList.add('is-error');
    this.retryButton.hidden = false;
    this.retryButton.onclick = () => {
      this.el.classList.remove('is-error');
      this.retryButton.hidden = true;
      onRetry();
    };
  }

  /** Resolves on the first click or key press (needed to start audio). */
  waitForStart() {
    this.status.textContent = 'Ready.';
    this.startButton.hidden = false;
    this.startButton.focus();
    return new Promise((resolve) => {
      const go = () => {
        window.removeEventListener('keydown', go);
        resolve();
      };
      this.startButton.addEventListener('click', go, { once: true });
      window.addEventListener('keydown', go);
    });
  }

  dispose() {
    this.el.remove();
  }
}
