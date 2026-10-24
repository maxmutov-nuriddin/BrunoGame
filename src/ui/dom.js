/** Build an element from an HTML string (callers escape any user data with escapeHtml). */
export function html(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

export const $ = (root, selector) => root.querySelector(selector);
export const $$ = (root, selector) => [...root.querySelectorAll(selector)];

/** Delegate clicks on `[data-act]` elements to a handler map. */
export function onAction(root, handlers, sound) {
  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (!target || target.disabled || !root.contains(target)) return;
    sound?.(target.dataset.act);
    handlers[target.dataset.act]?.(target, event);
  });
}
