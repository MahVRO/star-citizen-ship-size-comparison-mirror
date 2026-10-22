/* Layout behavior is separate from catalogue selection and the 3D viewer. */
(() => {
  const $ = id => document.getElementById(id);
  const panel = document.querySelector('.add-panel');
  if (!panel || !document.querySelector('.maker-picker')) return;

  const split = document.createElement('div');
  split.className = 'catalogue-split';
  const manufacturers = document.createElement('section');
  manufacturers.id = 'manufacturer-pane';
  manufacturers.className = 'manufacturer-pane';
  manufacturers.setAttribute('aria-label', 'Manufacturers');
  const ships = document.createElement('section');
  ships.id = 'ship-pane';
  ships.className = 'ship-pane';
  ships.setAttribute('aria-label', 'Ships');
  const divider = document.createElement('div');
  divider.className = 'catalogue-divider';
  divider.tabIndex = 0;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', 'Resize manufacturer and ship sections');
  divider.setAttribute('aria-orientation', 'horizontal');
  divider.setAttribute('aria-controls', 'manufacturer-pane ship-pane');
  divider.title = 'Drag to resize · Arrow keys to adjust · Double-click to reset';
  const picker = document.querySelector('.maker-picker');
  picker.before(split);
  manufacturers.append(picker);
  ships.append($('ship-search'), $('ship-section'));
  split.append(manufacturers, divider, ships);

  const preferenceKey = 'fleet-viewer:catalogue-split:v1';
  let ratio = 0.43;
  try {
    const saved = Number(localStorage.getItem(preferenceKey));
    if (saved >= 0.1 && saved <= 0.9) ratio = saved;
  } catch { /* Storage can be unavailable in private sessions. */ }
  const setRatio = value => {
    const height = Math.max(1, split.clientHeight - divider.offsetHeight);
    const makerMin = Math.min(110, height * 0.4);
    const shipMin = Math.min(140, height * 0.4);
    ratio = Math.max(makerMin / height, Math.min(1 - shipMin / height, value));
    split.style.setProperty('--maker-share', ratio + 'fr');
    split.style.setProperty('--ship-share', (1 - ratio) + 'fr');
    divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    divider.setAttribute('aria-valuemin', String(Math.ceil(makerMin / height * 100)));
    divider.setAttribute('aria-valuemax', String(Math.floor((1 - shipMin / height) * 100)));
    divider.setAttribute('aria-valuetext', `${Math.round(ratio * 100)} percent manufacturers`);
  };
  const save = () => { try { localStorage.setItem(preferenceKey, String(ratio)); } catch {} };
  const updateLayout = () => {
    const both = !$('maker-options').hidden && !$('ship-section').hidden;
    split.classList.toggle('has-both', both);
    split.classList.toggle('makers-closed', $('maker-options').hidden);
    divider.hidden = !both;
    if (both && split.clientHeight > 0) setRatio(ratio);
  };
  for (const element of [$('maker-options'), $('ship-section')]) {
    new MutationObserver(updateLayout).observe(element, {attributes: true, attributeFilter: ['hidden']});
  }
  new ResizeObserver(() => { if (!divider.hidden && split.clientHeight > 0) setRatio(ratio); }).observe(split);
  let activePointer = null;
  let grabOffset = 0;
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    activePointer = event.pointerId;
    grabOffset = event.clientY - divider.getBoundingClientRect().top;
    divider.setPointerCapture(activePointer);
    divider.focus({preventScroll: true});
    document.body.classList.add('resizing-catalogue');
  });
  divider.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    const available = split.clientHeight - divider.offsetHeight;
    setRatio((event.clientY - split.getBoundingClientRect().top - grabOffset) / Math.max(1, available));
  });
  const finish = event => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    document.body.classList.remove('resizing-catalogue');
    save();
  };
  divider.addEventListener('pointerup', finish);
  divider.addEventListener('pointercancel', finish);
  divider.addEventListener('lostpointercapture', finish);
  divider.addEventListener('keydown', event => {
    const direction = {ArrowUp: -1, ArrowDown: 1}[event.key];
    if (direction || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setRatio(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : ratio + direction * (event.shiftKey ? 0.1 : 0.025));
      save();
    }
  });
  divider.addEventListener('dblclick', () => { setRatio(0.43); save(); });
  updateLayout();

  // Transparent image/SVG canvases often have asymmetric padding. Fit the
  // painted pixels, not the source canvas, into the existing centered frame.
  const pending = new WeakMap();
  const fitLogo = async image => {
    const source = image.getAttribute('src');
    if (!source || source.startsWith('data:') || pending.get(image) === source) return;
    pending.set(image, source);
    try {
      await image.decode();
      if (image.getAttribute('src') !== source || !image.isConnected) return;
      const scale = 256 / Math.max(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 12) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      if (right < left) return;
      const width = right - left + 1, height = bottom - top + 1;
      const pad = Math.max(2, Math.round(Math.max(width, height) * 0.04));
      const fitted = document.createElement('canvas');
      fitted.width = width + pad * 2;
      fitted.height = height + pad * 2;
      fitted.getContext('2d').drawImage(canvas, left, top, width, height, pad, pad, width, height);
      image.dataset.originalSrc = source;
      image.src = fitted.toDataURL('image/png');
    } catch { /* Keep the source artwork if it cannot be sampled. */ }
  };
  const alignLogos = () => $('maker-options').querySelectorAll('.maker-option img').forEach(fitLogo);
  new MutationObserver(alignLogos).observe($('maker-options'), {
    childList: true, subtree: true, attributes: true, attributeFilter: ['src'],
  });
  alignLogos();
})();
