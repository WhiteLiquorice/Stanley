function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error('DOM field extraction requires a fields object.');
  }
  const normalized = {};
  for (const [name, raw] of Object.entries(fields)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error(`Invalid output field name "${name}".`);
    const spec = typeof raw === 'string' ? { selector: raw, attribute: 'text' } : { ...(raw || {}) };
    const attribute = String(spec.attribute || 'text');
    if (!['text', 'href', 'src', 'value', 'aria-label', 'title', 'data-item-id'].includes(attribute)) {
      throw new Error(`Unsupported DOM attribute "${attribute}" for field "${name}".`);
    }
    normalized[name] = { selector: String(spec.selector || ''), attribute, required: spec.required === true };
  }
  return normalized;
}

function dedupeRecords(records, key) {
  const seen = new Set();
  return records.filter((record) => {
    const value = key ? record?.[key] : JSON.stringify(record);
    if (value == null || value === '') return true;
    const token = String(value).trim().toLowerCase();
    if (seen.has(token)) return false;
    seen.add(token);
    return true;
  });
}

async function scrollUntil({ page, containerSelector, itemSelector, uniqueByAttribute, targetCount, maxScrolls, scrollAmount, settleMs, stagnationLimit }) {
  if (!page || !itemSelector) throw new Error('Dynamic scrolling requires a page and itemSelector.');
  const target = clampInt(targetCount, 1, 250, 25);
  const limit = clampInt(maxScrolls, 1, 100, 30);
  const amount = clampInt(scrollAmount, 100, 10000, 1200);
  const delay = clampInt(settleMs, 0, 10000, 1200);
  const stagnantLimit = clampInt(stagnationLimit, 1, 10, 3);
  let count = 0;
  let previous = -1;
  let stagnant = 0;
  let scrolls = 0;

  for (; scrolls <= limit; scrolls += 1) {
    const items = page.locator(itemSelector);
    count = uniqueByAttribute
      ? await items.evaluateAll((elements, attribute) => new Set(elements.map((element) => element.getAttribute(attribute)).filter(Boolean)).size, uniqueByAttribute)
      : await items.count();
    if (count >= target || stagnant >= stagnantLimit || scrolls === limit) break;
    stagnant = count <= previous ? stagnant + 1 : 0;
    previous = count;
    if (containerSelector) {
      await page.locator(containerSelector).first().evaluate((element, pixels) => {
        element.scrollBy({ top: pixels, behavior: 'instant' });
      }, amount);
    } else {
      await page.evaluate((pixels) => window.scrollBy({ top: pixels, behavior: 'instant' }), amount);
    }
    if (delay > 0) await page.waitForTimeout(delay);
  }
  return { count, targetCount: target, scrolls, reachedTarget: count >= target, stoppedForStagnation: stagnant >= stagnantLimit };
}

async function extractDomList({ page, itemSelector, fields, maxItems, dedupeBy }) {
  if (!page || !itemSelector) throw new Error('DOM list extraction requires a page and itemSelector.');
  const normalized = normalizeFields(fields);
  const limit = clampInt(maxItems, 1, 250, 100);
  const records = await page.locator(itemSelector).evaluateAll((elements, config) => {
    const read = (root, spec) => {
      const target = spec.selector ? root.querySelector(spec.selector) : root;
      if (!target) return '';
      if (spec.attribute === 'text') return String(target.textContent || '').replace(/\s+/g, ' ').trim();
      const raw = target.getAttribute(spec.attribute) || (spec.attribute in target ? target[spec.attribute] : '') || '';
      if (['href', 'src'].includes(spec.attribute) && raw) {
        try { return new URL(String(raw), document.baseURI).href; } catch { return String(raw); }
      }
      return String(raw).trim();
    };
    return elements.slice(0, config.limit).map((element) => Object.fromEntries(
      Object.entries(config.fields).map(([name, spec]) => [name, read(element, spec)]),
    ));
  }, { fields: normalized, limit });
  const complete = records.filter((record) => Object.entries(normalized).every(([name, spec]) => !spec.required || String(record[name] || '').trim()));
  return dedupeRecords(complete, dedupeBy).slice(0, limit);
}

async function extractDomRecord({ page, fields }) {
  const normalized = normalizeFields(fields);
  return page.evaluate((config) => {
    const read = (spec) => {
      const target = spec.selector ? document.querySelector(spec.selector) : document.body;
      if (!target) return '';
      if (spec.attribute === 'text') return String(target.textContent || '').replace(/\s+/g, ' ').trim();
      const raw = target.getAttribute(spec.attribute) || (spec.attribute in target ? target[spec.attribute] : '') || '';
      if (['href', 'src'].includes(spec.attribute) && raw) {
        try { return new URL(String(raw), document.baseURI).href; } catch { return String(raw); }
      }
      return String(raw).trim();
    };
    return Object.fromEntries(Object.entries(config).map(([name, spec]) => [name, read(spec)]));
  }, normalized);
}

async function enrichList({ agent, records, urlField, fields, maxItems, settleMs, onProgress = () => {} }) {
  if (!agent?.navigate || !agent?.page) throw new Error('List enrichment requires an active browser agent.');
  if (!Array.isArray(records)) throw new Error('List enrichment source must be an array.');
  const limit = Math.min(records.length, clampInt(maxItems, 1, 100, 50));
  const delay = clampInt(settleMs, 0, 10000, 1200);
  const enriched = [];
  for (let index = 0; index < limit; index += 1) {
    const original = records[index] || {};
    const url = String(original[urlField] || '');
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      await agent.navigate(url);
      if (typeof agent.waitForPageStable === 'function') await agent.waitForPageStable(Math.max(delay, 1000));
      else if (delay > 0) await agent.wait(delay);
      const detail = await extractDomRecord({ page: agent.page, fields });
      const record = { ...original, ...Object.fromEntries(Object.entries(detail).filter(([, value]) => value !== '')) };
      enriched.push(record);
      onProgress({ index: index + 1, total: limit, record });
    } catch (error) {
      onProgress({ index: index + 1, total: limit, error });
    }
  }
  return enriched;
}

function assertList(records, { minItems, requiredFields = [], uniqueBy, dropIncomplete = false, outputLimit }) {
  if (!Array.isArray(records)) throw new Error('Use-case assertion expected an array result.');
  const minimum = clampInt(minItems, 0, 250, 1);
  let result = uniqueBy ? dedupeRecords(records, uniqueBy) : [...records];
  if (dropIncomplete) result = result.filter((record) => requiredFields.every((field) => String(record?.[field] || '').trim()));
  if (result.length < minimum) throw new Error(`Use-case assertion failed: expected at least ${minimum} complete records, received ${result.length}.`);
  for (const [index, record] of result.entries()) {
    for (const field of requiredFields) {
      if (!String(record?.[field] || '').trim()) throw new Error(`Use-case assertion failed: record ${index + 1} is missing ${field}.`);
    }
  }
  if (uniqueBy) {
    const values = result.map((record) => String(record?.[uniqueBy] || '').trim().toLowerCase()).filter(Boolean);
    if (new Set(values).size !== values.length) throw new Error(`Use-case assertion failed: ${uniqueBy} values are not unique.`);
  }
  if (outputLimit) result = result.slice(0, clampInt(outputLimit, 1, 250, result.length));
  return result;
}

module.exports = { assertList, dedupeRecords, enrichList, extractDomList, extractDomRecord, normalizeFields, scrollUntil };
