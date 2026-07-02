/**
 * foundationAgent.enhanced.js — drop-in superset of StanleyFoundation.
 *
 * Fixes the multi-tab indexing bug and adds the primitives branching needs,
 * WITHOUT touching the original foundationAgent.ts/js.
 *
 * MULTI-TAB FIX
 * -------------
 * The base class addresses tabs purely by their position in `this.pages`.
 * `closeTab(i)` does `pages.splice(i, 1)`, so closing tab 0 silently renumbers
 * every other tab — a later `switch_tab 2` then lands on the wrong page.
 *
 * This subclass keeps a stable identity (`id` + optional human `label`) for every
 * tab in a `Map<Page, {id,label}>`. `openTab` returns a stable string id, and
 * `switchTab`/`closeTab` accept an id, a label, OR a numeric index (back-compat).
 * The Page objects remain the source of truth, so identities never shift on close.
 *
 * BRANCHING SUPPORT
 * -----------------
 * Adds `elementExists(description)` (used by `exists`/`notExists` conditions) and
 * `runWorkflow(workflow)` is overridden to use the conditional graph executor.
 *
 * Requires the ORIGINAL compiled base class at ../foundationAgent.js.
 */

const { StanleyFoundation } = require('./foundationAgent.js');
const { executeGraph } = require('./branchingEngine.js');

class StanleyFoundationEnhanced extends StanleyFoundation {
  constructor(config = {}) {
    super(config);
    /** @type {Map<import('playwright').Page, {id:string,label:string}>} */
    this.tabMeta = new Map();
    this.tabCounter = 1; // tab-1 is conceptually the "main" tab
  }

  async initialize() {
    const page = await super.initialize();
    // Register the initial tab and any future auto-opened tabs (target=_blank etc.)
    this._ensureMeta(this.page, 'main');
    if (this.context) {
      this.context.on('page', (p) => { this._ensureMeta(p); });
    }
    return page;
  }

  /** Assigns a stable id/label to a Page if it doesn't have one yet. */
  _ensureMeta(page, label) {
    if (!page) return null;
    if (this.tabMeta.has(page)) return this.tabMeta.get(page);
    const id = this.tabMeta.size === 0 ? 'main' : `tab-${++this.tabCounter}`;
    const meta = { id, label: label || id };
    this.tabMeta.set(page, meta);
    return meta;
  }

  /**
   * Resolves a tab reference (numeric index, numeric string, id, or label)
   * to its CURRENT index in this.pages. Returns -1 if not found.
   */
  _resolveTabIndex(ref) {
    if (typeof ref === 'number') return ref;
    const s = String(ref == null ? '' : ref).trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10); // numeric string => positional (back-compat)
    for (let i = 0; i < this.pages.length; i++) {
      const meta = this.tabMeta.get(this.pages[i]);
      if (meta && (meta.id === s || meta.label === s)) return i;
    }
    return -1;
  }

  /** Human-readable list of open tabs for error messages / logging. */
  describeTabs() {
    return this.pages
      .map((p, i) => {
        const m = this.tabMeta.get(p) || {};
        return `${i}:${m.id || '?'}${m.label && m.label !== m.id ? ` "${m.label}"` : ''}`;
      })
      .join(', ') || '(none)';
  }

  /** Returns [{ index, id, label, active }] describing all open tabs. */
  listTabs() {
    return this.pages.map((p, i) => {
      const m = this.tabMeta.get(p) || {};
      return { index: i, id: m.id || `tab-${i}`, label: m.label || m.id || `tab-${i}`, active: i === this.activePageIndex };
    });
  }

  /**
   * Opens a tab and returns its STABLE id (not a fragile index).
   * @param {string} [url]
   * @param {string} [label] optional human label for `switch_tab`/`close_tab`
   */
  async openTab(url, label) {
    const index = await super.openTab(url);
    const page = this.pages[index];
    const meta = this._ensureMeta(page, label);
    return meta.id;
  }

  /** Switches active tab by id, label, or index. Returns the tab's meta. */
  async switchTab(ref) {
    const index = this._resolveTabIndex(ref);
    if (index < 0 || index >= this.pages.length) {
      throw new Error(`No open tab matches "${ref}". Open tabs: ${this.describeTabs()}`);
    }
    await super.switchTab(index);
    return this.tabMeta.get(this.page) || { id: String(index), label: String(index) };
  }

  /** Closes a tab by id, label, or index. Identities of other tabs are preserved. */
  async closeTab(ref) {
    const index = this._resolveTabIndex(ref);
    if (index < 0 || index >= this.pages.length) {
      throw new Error(`No open tab matches "${ref}". Open tabs: ${this.describeTabs()}`);
    }
    const page = this.pages[index];
    await super.closeTab(index);
    this.tabMeta.delete(page); // drop only the closed tab's identity; the rest are untouched
  }

  /**
   * Non-destructive existence check used by `exists` / `notExists` branch conditions.
   * Mirrors the natural-locator strategy but only counts, never clicks.
   */
  async elementExists(description) {
    if (!this.page || !description) return false;
    const text = String(description).trim();
    const locators = [
      ...['button', 'link', 'checkbox', 'tab', 'menuitem', 'textbox', 'heading']
        .map(role => this.page.getByRole(role, { name: text })),
      this.page.getByText(text),
      this.page.getByLabel(text),
      this.page.getByPlaceholder(text),
    ];
    for (const locator of locators) {
      try {
        if (await locator.count() > 0) return true;
      } catch (_) { /* try next */ }
    }
    return false;
  }

  /**
   * Overrides the base linear runWorkflow with the conditional graph executor,
   * so forks, failure paths, and loops are honored.
   */
  async runWorkflow(workflow, opts = {}) {
    console.error(`[StanleyEngine] Branching execution for: "${workflow.name}"`);
    return executeGraph(this, workflow, opts);
  }
}

module.exports = { StanleyFoundationEnhanced };
