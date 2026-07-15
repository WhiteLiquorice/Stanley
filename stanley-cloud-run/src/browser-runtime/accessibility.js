const crypto = require('crypto');

function stableRef(pageKey, descriptor) {
  const identity = [pageKey, descriptor.role, descriptor.name, descriptor.tag, descriptor.testId, descriptor.href, descriptor.ordinal].join('|');
  return `ax-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 12)}`;
}

async function captureAccessibilitySnapshot(page, options = {}) {
  if (!page) return { schemaVersion: 1, url: '', title: '', capturedAt: new Date().toISOString(), elements: [] };
  const maxElements = Math.min(Math.max(Number(options.maxElements || 250), 1), 1000);
  const raw = await page.evaluate((limit) => {
    const candidates = Array.from(document.querySelectorAll([
      'a[href]', 'button', 'input', 'textarea', 'select', 'summary',
      '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
      '[role="tab"]', '[role="menuitem"]', '[role="textbox"]', '[contenteditable="true"]',
    ].join(',')));
    const roleFor = (element) => element.getAttribute('role') || ({
      A: 'link', BUTTON: 'button', INPUT: element.type === 'checkbox' ? 'checkbox' : element.type === 'radio' ? 'radio' : 'textbox',
      TEXTAREA: 'textbox', SELECT: 'combobox', SUMMARY: 'button',
    }[element.tagName] || element.tagName.toLowerCase());
    const nameFor = (element) => {
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const value = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
        if (value) return value;
      }
      const label = element.labels?.[0]?.textContent || element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('title');
      return String(label || element.innerText || element.placeholder || element.value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    };
    const seen = new Map();
    return candidates.filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    }).slice(0, limit).map((element) => {
      const role = roleFor(element);
      const name = nameFor(element);
      const key = `${role}|${name}`;
      const ordinal = seen.get(key) || 0;
      seen.set(key, ordinal + 1);
      return {
        role, name, ordinal, tag: element.tagName.toLowerCase(),
        testId: element.getAttribute('data-testid') || '',
        href: element.tagName === 'A' ? new URL(element.href, location.href).origin + new URL(element.href, location.href).pathname : '',
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        editable: Boolean(element.matches('input,textarea,select,[contenteditable="true"]')),
      };
    });
  }, maxElements);
  const url = new URL(page.url());
  const pageKey = `${url.origin}${url.pathname}`;
  return {
    schemaVersion: 1,
    url: pageKey,
    title: String(await page.title()).slice(0, 200),
    capturedAt: new Date().toISOString(),
    elements: raw.map((descriptor) => ({ ref: stableRef(pageKey, descriptor), ...descriptor })),
  };
}

function locatorForElement(page, descriptor) {
  if (!descriptor) throw Object.assign(new Error('Accessibility reference is unknown or expired.'), { code: 'AX_REF_EXPIRED' });
  if (descriptor.testId) return page.getByTestId(descriptor.testId).first();
  if (descriptor.role && descriptor.name) return page.getByRole(descriptor.role, { name: descriptor.name, exact: true }).nth(descriptor.ordinal || 0);
  if (descriptor.name) return page.getByText(descriptor.name, { exact: true }).nth(descriptor.ordinal || 0);
  throw Object.assign(new Error('Accessibility reference has no resolvable semantic identity.'), { code: 'AX_REF_UNRESOLVABLE' });
}

class AccessibilityReferenceMap {
  constructor() { this.elements = new Map(); }
  remember(snapshot) { for (const element of snapshot?.elements || []) this.elements.set(element.ref, element); return snapshot; }
  resolve(page, ref) { return locatorForElement(page, this.elements.get(ref)); }
  clear() { this.elements.clear(); }
}

module.exports = { AccessibilityReferenceMap, captureAccessibilitySnapshot, locatorForElement, stableRef };
