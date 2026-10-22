/* Phone navigation exposes either the catalogue or the hangar, with no overlap. */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('workspace') || !$('fleet-sidebar')) return;
  const mobile = matchMedia('(max-width: 760px), (max-width: 1024px) and (pointer: coarse), (max-width: 1024px) and (max-height: 500px)');
  const sidebar = $('fleet-sidebar');
  const toggle = $('toggle-panels');
  const nav = document.createElement('nav');
  nav.className = 'mobile-view-nav';
  nav.setAttribute('aria-label', 'Mobile workspace');
  const hangar = document.createElement('button');
  hangar.type = 'button'; hangar.textContent = 'Hangar';
  const catalogue = document.createElement('button');
  catalogue.type = 'button'; catalogue.textContent = 'Ships';
  const about = document.createElement('a');
  about.textContent = 'About';
  about.href = document.querySelector('.navbar nav a[href$="about/"]')?.href || '#';
  nav.append(hangar, catalogue, about);
  document.body.append(nav);
  const walkPad = document.createElement('div');
  walkPad.className = 'mobile-walk-pad';
  walkPad.setAttribute('role', 'group');
  walkPad.setAttribute('aria-label', 'Walking movement');
  const held = new Map();
  const releaseMovement = () => {
    for (const [button, code] of held) {
      window.dispatchEvent(new KeyboardEvent('keyup', {code, bubbles:true}));
      button.classList.remove('is-held');
    }
    held.clear();
  };
  for (const [symbol, name, code] of [['↑', 'Move forward', 'KeyW'], ['←', 'Move left', 'KeyA'], ['↓', 'Move backward', 'KeyS'], ['→', 'Move right', 'KeyD']]) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = symbol; button.setAttribute('aria-label', name);
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      $('viewport').focus({preventScroll:true});
      held.set(button, code);
      button.classList.add('is-held');
      $('viewport').dispatchEvent(new KeyboardEvent('keydown', {code, bubbles:true, cancelable:true}));
    });
    const release = () => {
      if (!held.has(button)) return;
      window.dispatchEvent(new KeyboardEvent('keyup', {code, bubbles:true}));
      held.delete(button); button.classList.remove('is-held');
    };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, release);
    walkPad.append(button);
  }
  $('workspace').append(walkPad);
  window.addEventListener('blur', releaseMovement);
  document.addEventListener('visibilitychange', releaseMovement);
  let desktopClosed = sidebar.classList.contains('closed');
  let mobileActive = false;
  const showCatalogue = open => {
    if (sidebar.classList.contains('closed') === open) toggle.click();
    sync();
  };
  const sync = () => {
    const open = !sidebar.classList.contains('closed');
    document.body.classList.toggle('mobile-catalogue-open', mobile.matches && open);
    hangar.setAttribute('aria-pressed', String(!open));
    catalogue.setAttribute('aria-pressed', String(open));
    const count = Number($('fleet-count').textContent.match(/\d+/)?.[0] || 0);
    hangar.textContent = count ? `Hangar · ${count}` : 'Hangar';
    nav.hidden = !mobile.matches;
    walkPad.hidden = !mobile.matches || open || $('camera-walk').getAttribute('aria-pressed') !== 'true';
    if (walkPad.hidden) releaseMovement();
    document.body.style.setProperty('--mobile-height', `${window.visualViewport?.height || innerHeight}px`);
  };
  hangar.addEventListener('click', () => showCatalogue(false));
  catalogue.addEventListener('click', () => showCatalogue(true));
  new MutationObserver(sync).observe(sidebar, {attributes:true, attributeFilter:['class']});
  new MutationObserver(sync).observe($('camera-walk'), {attributes:true, attributeFilter:['aria-pressed']});
  new MutationObserver(sync).observe($('fleet-count'), {childList:true});
  // Show the loaded fleet after a successful add; keep errors in the catalogue.
  new MutationObserver(() => {
    if (mobile.matches && /^\d+ ships? added\.$/.test($('load-status').textContent.trim())) showCatalogue(false);
  }).observe($('load-status'), {childList:true, characterData:true, subtree:true});
  const applyMode = () => {
    if (mobile.matches && !mobileActive) {
      desktopClosed = sidebar.classList.contains('closed');
      mobileActive = true;
      showCatalogue($('fleet-tray').hidden);
    } else if (!mobile.matches && mobileActive) {
      mobileActive = false;
      showCatalogue(!desktopClosed);
    }
    sync();
  };
  mobile.addEventListener('change', applyMode);
  window.visualViewport?.addEventListener('resize', sync);
  window.addEventListener('resize', sync);
  applyMode();
})();
