/* Local presentation layer. Catalogue, import and WebGL stay upstream-owned. */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('workspace')) return;
  document.body.classList.add('mirror-ui');
  document.querySelector('.add-title').textContent = 'Catalogue';
  $('ship-search').placeholder = 'Search ships…';
  $('ship-search').setAttribute('aria-keyshortcuts', '/');
  $('fleet-drop').textContent = 'Import JSON / CSV';
  $('fleet-drop').title = 'Import or drop a fleet file';

  const support = document.createElement('details');
  support.className = 'mirror-support';
  const summary = document.createElement('summary');
  summary.textContent = 'About & credits';
  support.append(summary);
  const sidebar = $('fleet-sidebar');
  sidebar.querySelectorAll('.starter-shortcut, .referral-panel').forEach(el => support.append(el));
  sidebar.querySelector('.unofficial').before(support);
  support.append(sidebar.querySelector('.unofficial'));

  const empty = document.createElement('section');
  empty.className = 'mirror-welcome';
  empty.setAttribute('aria-labelledby', 'mirror-welcome-title');
  empty.innerHTML = `<h1 id="mirror-welcome-title">Empty hangar</h1>
    <button class="mirror-browse" type="button">Add a ship <span aria-hidden="true">＋</span></button>`;
  $('workspace').append(empty);
  const openCatalogue = () => {
    if (sidebar.classList.contains('closed')) $('toggle-panels').click();
    $('ship-search').focus();
  };
  empty.querySelector('button').addEventListener('click', openCatalogue);
  const update = () => {
    empty.hidden = !$('fleet-tray').hidden || !!document.querySelector('.fatal') || !sidebar.classList.contains('closed');
  };
  new MutationObserver(update).observe($('fleet-tray'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(update).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(update).observe($('viewport'), { childList: true });
  $('ship-search').addEventListener('input', update);
  document.addEventListener('keydown', event => {
    const editing = event.target.closest('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); openCatalogue();
    }
    if (event.key === 'Escape' && event.target === $('ship-search')) {
      $('ship-search').value = '';
      $('ship-search').dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  for (const [id, text] of [['view-perspective', '3D'], ['view-top', 'Top']]) {
    $(id).textContent = text;
  }
  update();
})();
