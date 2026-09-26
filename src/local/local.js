'use strict';
(async () => {
  const info = await window.desktop.info();
  document.querySelector('#address').value = info.server;
  if (info.mode === 'loading') {
    document.querySelector('#title').textContent = 'Opening Tavern…';
    document.querySelector('#description').textContent = 'Connecting to your server. You can change its address below.';
  } else if (info.mode === 'offline') {
    document.querySelector('#title').textContent = "Couldn't reach Tavern.";
    document.querySelector('#description').textContent = 'Check your connection and that your Tavern server is running, then try again.';
    document.querySelector('#retry').hidden = false;
  } else if (info.mode === 'settings') {
    document.querySelector('#title').textContent = 'Your Tavern address.';
    document.querySelector('#description').textContent = 'Connect this desktop app to your Tavern website.';
  }
  const run = async (operation) => {
    document.querySelector('#error').textContent = '';
    const buttons = document.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);
    try { const result = await operation(); if (result?.error) document.querySelector('#error').textContent = result.error; }
    catch { document.querySelector('#error').textContent = 'Unable to connect. Try again.'; }
    finally { buttons.forEach(b => b.disabled = false); }
  };
  document.querySelector('#connect-form').addEventListener('submit', e => { e.preventDefault(); void run(() => window.desktop.connect(document.querySelector('#address').value)); });
  document.querySelector('#retry').addEventListener('click', () => void run(() => window.desktop.retry()));
})();