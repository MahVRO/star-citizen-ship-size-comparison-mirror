/* Local presentation layer. Catalogue, import and WebGL stay upstream-owned. */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('workspace')) return;
  document.body.classList.add('mirror-ui');
  document.querySelector('.add-title').textContent = 'Ship catalogue';
  document.querySelector('.eyebrow').textContent = 'YOUR FLEET STARTS HERE';
  $('ship-search').placeholder = 'Search ships or manufacturers…';
  $('ship-search').setAttribute('aria-keyshortcuts', '/');
  const searchLabel = document.createElement('label');
  searchLabel.className = 'mirror-search-label';
  searchLabel.htmlFor = 'ship-search';
  searchLabel.innerHTML = '<span>Find your next ship</span><kbd>/</kbd>';
  $('ship-search').before(searchLabel);

  const support = document.createElement('details');
  support.className = 'mirror-support';
  const summary = document.createElement('summary');
  summary.textContent = 'Resources & community';
  support.append(summary);
  const sidebar = $('fleet-sidebar');
  sidebar.querySelectorAll('.starter-shortcut, .referral-panel').forEach(el => support.append(el));
  sidebar.querySelector('.unofficial').before(support);

  const empty = document.createElement('section');
  empty.className = 'mirror-welcome';
  empty.setAttribute('aria-labelledby', 'mirror-welcome-title');
  empty.innerHTML = `<span class="mirror-orbit" aria-hidden="true">＋</span>
    <span class="mirror-kicker">YOUR PERSONAL HANGAR</span>
    <h1 id="mirror-welcome-title">Every fleet starts<br>with one ship.</h1>
    <p>Find a ship, bring it into the hangar,<br>and compare your fleet at true scale.</p>
    <button class="mirror-browse" type="button">Explore the catalogue <span aria-hidden="true">↗</span></button>
    <span class="mirror-scale">REAL SHIPS. REAL SCALE. YOUR FLEET.</span>`;
  $('workspace').append(empty);
  const openCatalogue = () => {
    if (sidebar.classList.contains('closed')) $('toggle-panels').click();
    $('ship-search').focus();
  };
  empty.querySelector('button').addEventListener('click', openCatalogue);
  const suggestions = document.createElement('div');
  suggestions.className = 'mirror-suggestions';
  suggestions.innerHTML = '<span>Start exploring</span>';
  for (const name of ['Avenger', 'Cutlass', 'Aurora']) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = name;
    button.addEventListener('click', () => {
      $('ship-search').value = name;
      $('ship-search').dispatchEvent(new Event('input', { bubbles: true }));
      $('ship-search').focus();
    });
    suggestions.append(button);
  }
  $('ship-search').after(suggestions);
  const update = () => {
    empty.hidden = !$('fleet-tray').hidden || !!document.querySelector('.fatal');
    suggestions.hidden = !!$('ship-search').value.trim() || $('maker-value').textContent !== 'Choose a manufacturer';
  };
  new MutationObserver(update).observe($('fleet-tray'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(update).observe($('maker-value'), { childList: true });
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
