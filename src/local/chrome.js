'use strict';
const updateButton = document.querySelector('#update');
function renderUpdate(state) {
  if (!state) return;
  const labels = { idle:'Check updates', checking:'Checking…', current:'Up to date',
    downloading:'Downloading ' + state.percent + '%', ready:'Restart & update',
    installing:'Restarting…', error:'Retry update', disabled:'Dev build' };
  updateButton.textContent = labels[state.status] || 'Check updates';
  updateButton.dataset.state = state.status;
  updateButton.title = state.message;
  updateButton.setAttribute('aria-label', state.message);
  updateButton.disabled = ['disabled','checking','downloading','installing'].includes(state.status);
  document.querySelector('#update-status').textContent = state.message;
}
document.querySelector('#menu').addEventListener('click', () => window.tavernChrome.menu());
window.tavernChrome.onUpdate(renderUpdate);
updateButton.addEventListener('click', () => {
  updateButton.disabled = true;
  window.tavernChrome.update().then(renderUpdate).catch(() => renderUpdate({
    status:'error', message:'Could not start the update check. Click to retry.'
  }));
});
window.tavernChrome.info().then(info => {
  document.querySelector('#version').textContent = 'v' + info.version;
  if (info.title !== 'Tavern') document.querySelector('#caption').textContent = info.title;
  renderUpdate(info.update);
});
