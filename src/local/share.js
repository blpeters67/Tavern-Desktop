'use strict';
(async () => {
  document.querySelector('#cancel').addEventListener('click', () => window.desktop.cancel());
  try {
    const list = await window.desktop.sources();
    const box = document.querySelector('#sources');
    box.replaceChildren();
    if (!list.length) box.textContent = 'No screens or windows are available. Cancel and try again.';
    for (const source of list) {
      const button = document.createElement('button'); button.className = 'source';
      const img = document.createElement('img'); img.src = source.thumbnail; img.alt = '';
      const label = document.createElement('span'); label.textContent = source.name;
      button.append(img, label);
      button.addEventListener('click', async () => {
        document.querySelectorAll('.source').forEach(b => b.disabled = true);
        await window.desktop.share(source.id, document.querySelector('#audio').checked);
      });
      box.append(button);
    }
  } catch { document.querySelector('#error').textContent = 'Unable to list screens. Cancel and try again.'; }
})();