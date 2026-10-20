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

  // Preserve upstream selection/loading handlers; enrich the existing controls.
  const makerSearch = document.createElement('input');
  makerSearch.type = 'search';
  makerSearch.className = 'maker-filter';
  makerSearch.placeholder = 'Filter manufacturers…';
  makerSearch.setAttribute('aria-label', 'Filter manufacturers');
  const noMakers = document.createElement('p');
  noMakers.className = 'maker-no-results';
  noMakers.textContent = 'No manufacturers found';
  noMakers.hidden = true;
  $('maker-options').before(makerSearch);
  $('maker-options').after(noMakers);
  const filterMakers = () => {
    const query = makerSearch.value.trim().toLowerCase();
    const buttons = [...$('maker-options').querySelectorAll('button')];
    buttons.forEach(button => { button.hidden = !button.textContent.toLowerCase().includes(query); });
    noMakers.hidden = $('maker-options').hidden || buttons.some(button => !button.hidden);
  };
  makerSearch.addEventListener('input', filterMakers);
  makerSearch.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      $('maker-options').hidden = true;
      $('maker-toggle').setAttribute('aria-expanded', 'false');
      $('maker-toggle').focus();
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      [...$('maker-options').querySelectorAll('button')].find(b => !b.hidden)?.focus();
    }
  });
  $('maker-options').addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const buttons = [...$('maker-options').querySelectorAll('button')].filter(b => !b.hidden);
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }, true);
  let galleryWasOpen = false;
  new MutationObserver(() => {
    const open = !$('maker-options').hidden;
    makerSearch.hidden = !open;
    if (open && !galleryWasOpen) { makerSearch.value = ''; filterMakers(); }
    if (!open) noMakers.hidden = true;
    galleryWasOpen = open;
  }).observe($('maker-options'), {attributes:true, attributeFilter:['hidden']});
  makerSearch.hidden = true;
  fetch(new URL('catalog.json', document.currentScript.src)).then(r => {
    if (!r.ok) throw new Error('Catalogue unavailable');
    return r.json();
  }).then(catalog => {
    const enhance = () => {
      const buttons = [...$('maker-options').querySelectorAll('.maker-option')];
      if (buttons.length !== catalog.manufacturers.length) return;
      buttons.forEach((button, index) => {
        if (button.querySelector('.maker-model-count')) return;
        const count = document.createElement('small');
        count.className = 'maker-model-count';
        count.textContent = catalog.manufacturers[index].ships.length;
        button.title = catalog.manufacturers[index].name;
        button.setAttribute('aria-label', catalog.manufacturers[index].name + ', ' + count.textContent + ' ships');
        count.setAttribute('aria-label', count.textContent + ' ships');
        button.append(count);
      });
      observer.disconnect();
    };
    const observer = new MutationObserver(enhance);
    observer.observe($('maker-options'), {childList:true});
    enhance();
  }).catch(() => { /* Upstream catalogue reports loading errors. */ });
  const highlightMaker = () => {
    $('maker-options').querySelectorAll('.maker-option').forEach(button => {
      button.setAttribute('aria-pressed', String(button.querySelector('span')?.textContent === $('maker-value').textContent));
    });
  };
  new MutationObserver(highlightMaker).observe($('maker-value'), {childList:true});

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
