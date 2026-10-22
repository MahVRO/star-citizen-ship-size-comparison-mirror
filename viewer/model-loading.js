// A tab can outlive a deployment and still hold an older catalogue in memory.
// Refresh the model entry once on failure instead of retrying its retired URL.
export async function loadModel(loader, ship, catalogueURL, prefix, fetchCatalogue = fetch) {
  delete ship.modelLoadWarning;
  const modelURL = path => prefix + path.split('/').map(encodeURIComponent).join('/');
  try {
    return await loader.loadAsync(modelURL(ship.path));
  } catch (originalError) {
    let replacement;
    try {
      const refreshURL = catalogueURL + (catalogueURL.includes('?') ? '&' : '?') + 'refresh=' + Date.now();
      const response = await fetchCatalogue(refreshURL, {cache: 'no-store'});
      if (!response.ok) throw originalError;
      const catalogue = await response.json();
      replacement = catalogue.manufacturers.flatMap(maker => maker.ships)
        .find(entry => entry.id === (ship.catalogId ?? ship.id));
    } catch {
      // An existing fallback can still be cached even if the catalogue is offline.
    }
    let failure = originalError;
    if (replacement?.path && replacement.path !== ship.path) {
      try {
        const model = await loader.loadAsync(modelURL(replacement.path));
        for (const key of ['path', 'rotation', 'length', 'scale']) {
          if (key in replacement) ship[key] = replacement[key];
        }
        return model;
      } catch (error) {
        failure = error;
      }
    }
    const fallback = replacement?.fallbackPath ?? ship.fallbackPath;
    if (fallback && fallback !== ship.path && fallback !== replacement?.path) {
      const model = await loader.loadAsync(modelURL(fallback));
      ship.modelLoadWarning = `${ship.name}: detailed model unavailable; loaded standard detail. Reload to retry.`;
      return model;
    }
    throw failure;
  }
}
