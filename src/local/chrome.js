'use strict';
const updateButton = document.querySelector('#update');
const updateLabel = document.querySelector('#update-label');
// Always visible: progress, a ready update, and failures (a failed check must not
// vanish silently). Visible only for checks the user started: "Checking…" and
// "Up to date" — the automatic ones stay quiet.
const ALWAYS_SHOWN = new Set(['downloading', 'ready', 'installing', 'error']);
const MANUAL_SHOWN = new Set(['checking', 'current']);
let hideTimer = 0;
function renderUpdate(state) {
  if (!state) return;
  const labels = { idle:'Check updates', checking:'Checking…', current:'Up to date',
    downloading:'Downloading ' + state.percent + '%', ready:'Restart & update',
    installing:'Restarting…', error:'Retry update', disabled:'Dev build' };
  updateLabel.textContent = labels[state.status] || 'Check updates';
  updateButton.dataset.state = state.status;
  updateButton.title = state.message;
  updateButton.setAttribute('aria-label', state.message);
  updateButton.disabled = ['disabled','checking','downloading','installing'].includes(state.status);
  document.querySelector('#update-status').textContent = state.message;
  const show = ALWAYS_SHOWN.has(state.status) || (state.manual === true && MANUAL_SHOWN.has(state.status));
  clearTimeout(hideTimer);
  updateButton.style.display = show ? 'flex' : 'none';
  if (show && state.status === 'current' && state.manual === true) {
    hideTimer = setTimeout(() => { updateButton.style.display = 'none'; }, 6000);
  }
}
document.querySelector('#menu').addEventListener('click', () => window.tavernChrome.menu());
window.tavernChrome.onUpdate(renderUpdate);
updateButton.addEventListener('click', () => {
  updateButton.disabled = true;
  renderUpdate({ status:'checking', manual:true, percent:0, message:'Checking for updates…' });
  window.tavernChrome.update().then(renderUpdate).catch(() => renderUpdate({
    status:'error', manual:true, message:'Could not start the update check. Click to retry.'
  }));
});
window.tavernChrome.info().then(info => {
  document.querySelector('#version').textContent = 'v' + info.version;
  if (info.title !== 'Tavern') document.querySelector('#caption').textContent = info.title;
  renderUpdate(info.update);
});
