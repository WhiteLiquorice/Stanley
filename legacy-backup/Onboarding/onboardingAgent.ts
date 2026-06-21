import { StanleyFoundation, AgentConfig } from "../foundationAgent";

export interface LoginCredentials {
  email?: string;
  username?: string;
  password?: string;
}

export interface ExtractedClient {
  name: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  address: string | null;
  notes: string | null;
}

interface SimplifiedNode {
  tag: string;
  stanleyId: string;
  attributes: Record<string, string>;
  textContent: string;
  children: SimplifiedNode[];
}

interface AccessTreeNode {
  role: string;
  name?: string;
  children?: AccessTreeNode[];
}

/**
 * Project Stanley Onboarding Specialist Agent
 * 
 * Focuses on programmatically navigating legacy directories (Mindbody, Vagaro),
 * resolving DOM layouts, and extracting customer lists to normalize them into
 * Bridgeway's native Client schemas.
 */
export class StanleyOnboardingAgent extends StanleyFoundation {
  constructor(config: AgentConfig = {}) {
    super(config);
  }

  /**
   * Main entrypoint to log in, navigate to directory, traverse access tree, and extract clients.
   */
  public async extractLegacyData(
    competitor: 'mindbody' | 'vagaro',
    loginUrl: string,
    credentials: LoginCredentials
  ): Promise<ExtractedClient[]> {
    if (!this.page) {
      await this.initialize();
    }

    if (!this.page) {
      throw new Error("Failed to initialize browser page context.");
    }

    console.log(`[Stanley Onboarding] Beginning onboarding extraction for competitor: ${competitor}`);
    await this.navigate(loginUrl);

    // 1. Perform Competitor-Specific Login
    await this.performLogin(competitor, credentials);
    await this.wait(3000); // Wait for dashboard loads

    // 2. Navigate to Client Directory Section
    console.log("[Stanley Onboarding] Searching accessibility tree for Client Directory node...");
    
    let directoryLinkNode: AccessTreeNode | null = null;
    try {
      // page.accessibility is deprecated in Playwright 1.46+ — replace with page.ariaSnapshot() when upgrading
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accessibilitySnapshot = await (this.page as any).accessibility.snapshot() as AccessTreeNode | null;
      if (accessibilitySnapshot) {
        directoryLinkNode = this.findNodeByRoleAndName(accessibilitySnapshot, 'link', /client|customer|directory/i);
      }
    } catch (err) {
      console.warn("[Stanley Onboarding] Accessibility snapshot not available or failed:", err);
    }

    if (directoryLinkNode && directoryLinkNode.name) {
      console.log(`[Stanley Onboarding] Access Tree matched directory path link: "${directoryLinkNode.name}". Clicking...`);
      await this.page.click(`text="${directoryLinkNode.name}"`);
    } else {
      console.log("[Stanley Onboarding] Access Tree did not match directory node link. Accessing default directory endpoint...");
      const directoryPath = competitor === 'mindbody' ? '/clients/directory' : '/merchant/customers';
      const currentUrl = this.page.url();
      const origin = new URL(currentUrl).origin;
      await this.navigate(`${origin}${directoryPath}`);
    }

    await this.wait(4000); // Wait for table records render

    // 3. Extract Grid Rows programmatically
    console.log("[Stanley Onboarding] Running concrete extraction utility...");
    return await this.scrapeLegacyDataTables();
  }

  /**
   * Internal DOM compression algorithm.
   * Instead of parsing large, text-heavy HTML source code, it loops through visible
   * semantic elements and strips inline styles, Tailwind utility classes, scripts, and SVGs.
   * Maps interactive elements to sequential ids and outputs a dense JSON tree.
   */
  public async compressActiveViewportDOM(): Promise<string> {
    if (!this.page) {
      throw new Error("Agent browser session is not initialized.");
    }

    return await this.page.evaluate(() => {
      function isElementVisible(el: HTMLElement): boolean {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function cleanClasses(className: string): string {
        if (!className) return "";
        const tailwindKeywords = [
          'p-', 'm-', 'pt-', 'pb-', 'pl-', 'pr-', 'px-', 'py-', 'mt-', 'mb-', 'ml-', 'mr-', 'mx-', 'my-',
          'w-', 'h-', 'max-w', 'max-h', 'min-w', 'min-h',
          'bg-', 'text-', 'border-', 'rounded-', 'shadow-', 'opacity-', 'cursor-',
          'flex', 'grid', 'hidden', 'block', 'inline', 'items-', 'justify-', 'content-',
          'absolute', 'relative', 'fixed', 'static', 'sticky',
          'top-', 'bottom-', 'left-', 'right-', 'z-',
          'overflow-', 'whitespace-', 'break-',
          'hover:', 'focus:', 'active:', 'disabled:', 'group-', 'peer-', 'md:', 'lg:', 'sm:', 'xl:', '2xl:',
          'transition', 'duration-', 'ease-', 'delay-',
          'animate-', 'transform', 'scale-', 'rotate-', 'translate-',
          'font-', 'leading-', 'tracking-', 'align-',
          'gap-', 'col-', 'row-', 'self-'
        ];

        const classes = className.split(/\s+/);
        const filtered = classes.filter(c => {
          if (!c) return false;
          return !tailwindKeywords.some(keyword => {
            if (keyword.endsWith('-')) {
              return c.startsWith(keyword);
            }
            if (keyword.endsWith(':')) {
              return c.includes(keyword);
            }
            return c === keyword;
          });
        });
        return filtered.join(" ");
      }

      const semanticTags = ['table', 'tr', 'td', 'th', 'ul', 'li', 'form', 'button', 'input', 'select', 'textarea'];
      let sequentialId = 1;

      interface SimplifiedDOMNode {
        tag: string;
        stanleyId: string;
        attributes: Record<string, string>;
        textContent: string;
        children: SimplifiedDOMNode[];
      }

      function buildTree(element: HTMLElement): SimplifiedDOMNode | null {
        if (!isElementVisible(element)) return null;

        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'script' || tagName === 'style' || tagName === 'svg' || tagName === 'path') {
          return null;
        }

        const isSemantic = semanticTags.includes(tagName);

        let stanleyId = "";
        if (isSemantic) {
          stanleyId = String(sequentialId++);
          element.setAttribute('data-stanley-id', stanleyId);
        }

        const children: SimplifiedDOMNode[] = [];
        const childElements = Array.from(element.children) as HTMLElement[];
        for (const child of childElements) {
          const childNode = buildTree(child);
          if (childNode) {
            children.push(childNode);
          }
        }

        if (!isSemantic && children.length === 0) {
          return null;
        }

        const attributes: Record<string, string> = {};
        if (isSemantic) {
          attributes['data-stanley-id'] = stanleyId;
          
          for (const attrName of ['type', 'placeholder', 'name', 'value', 'href', 'role']) {
            const val = element.getAttribute(attrName);
            if (val !== null) {
              attributes[attrName] = val;
            }
          }

          const className = element.className;
          if (typeof className === 'string' && className) {
            const cleaned = cleanClasses(className);
            if (cleaned) {
              attributes['class'] = cleaned;
            }
          }
        }

        let textContent = "";
        if (isSemantic && children.length === 0) {
          textContent = element.textContent?.trim().slice(0, 200) || "";
        }

        return {
          tag: tagName,
          stanleyId: stanleyId,
          attributes: attributes,
          textContent: textContent,
          children: children
        };
      }

      const rootNode = buildTree(document.body);
      return JSON.stringify(rootNode || {}, null, 2);
    });
  }

  /**
   * Helper to perform login based on standard forms of the competitor.
   */
  private async performLogin(competitor: 'mindbody' | 'vagaro', credentials: LoginCredentials): Promise<void> {
    const emailVal = credentials.email || credentials.username || "";
    const passVal = credentials.password || "";

    if (competitor === 'mindbody') {
      console.log("[Stanley Onboarding] Executing Mindbody login credentials entry...");
      await this.type('input[type="email"], input[name="username"], #username', emailVal);
      await this.type('input[type="password"], #password', passVal);
      await this.click('button[type="submit"], #login-button, .login-btn');
    } else if (competitor === 'vagaro') {
      console.log("[Stanley Onboarding] Executing Vagaro login credentials entry...");
      await this.type('input[type="text"], input[name="email"], #emailId', emailVal);
      await this.type('input[type="password"], #passwordId', passVal);
      await this.click('button[type="submit"], #loginButton, .btn-login');
    }
  }

  /**
   * Clicks the next-page control if one exists and is not disabled.
   * Returns true if navigation happened, false if no next page found.
   */
  private async clickNextPage(): Promise<boolean> {
    if (!this.page) return false;

    return await this.page.evaluate(() => {
      // Text-based next button detection (no jQuery :contains needed)
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"]')) as HTMLElement[];
      const nextBtn = candidates.find(el => {
        if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const text = (el.textContent || '').trim().toLowerCase();
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        const cls = el.className.toLowerCase();
        return text === 'next' || text === '>' || text === '›' || text === 'next page'
          || label.includes('next page') || label === 'next'
          || (cls.includes('next') && !cls.includes('disabled'));
      });

      if (nextBtn) {
        nextBtn.setAttribute('data-stanley-next-page', 'true');
        return true;
      }
      return false;
    }).then(async (found) => {
      if (!found) return false;
      try {
        await this.page!.click('[data-stanley-next-page="true"]');
        await this.waitForPageStable(3000);
        await this.wait(1200); // extra buffer for table re-render
        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Scrapes tabular rows directly from the browser context in-memory.
   * Follows pagination up to MAX_PAGES pages.
   */
  private async scrapeLegacyDataTables(): Promise<ExtractedClient[]> {
    if (!this.page) return [];

    const MAX_PAGES = 20;
    const allRaw: Record<string, string>[] = [];

    for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
      const pageRaw = await this.extractCurrentPageRows();
      allRaw.push(...pageRaw);
      console.log(`[Stanley Onboarding] Page ${pageNum + 1}: extracted ${pageRaw.length} rows (total: ${allRaw.length})`);

      const advanced = await this.clickNextPage();
      if (!advanced) break;
    }

    return this.normalizeClients(allRaw);
  }

  /**
   * Extracts raw row data from the currently-visible table or list.
   */
  private async extractCurrentPageRows(): Promise<Record<string, string>[]> {
    if (!this.page) return [];

    return await this.page.evaluate(() => {
      const records: Record<string, string>[] = [];

      function cleanHeader(txt: string): string {
        return txt.replace(/[^a-zA-Z0-9\s]/g, "").trim().toLowerCase();
      }

      // Approach 1: Standard Table Scraper
      const tables = Array.from(document.querySelectorAll('table, [role="grid"], .grid, .customer-list'));
      let bestTable: Element | null = null;
      let maxRows = 0;

      for (const table of tables) {
        const rows = table.querySelectorAll('tr, [role="row"], .row, .grid-row');
        if (rows.length > maxRows) {
          maxRows = rows.length;
          bestTable = table;
        }
      }

      if (bestTable && maxRows >= 2) {
        const rows = Array.from(bestTable.querySelectorAll('tr, [role="row"], .row, .grid-row'));
        const headerRow = rows[0];
        const headers = Array.from(headerRow.querySelectorAll('th, td, [role="columnheader"], .header-cell'))
          .map(cell => cleanHeader(cell.textContent || ''));

        const hasPatientKeywords = headers.some(h => /name|email|phone|client|patient|customer|dob|date/i.test(h));
        
        if (headers.length > 0 && hasPatientKeywords) {
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = Array.from(row.querySelectorAll('td, [role="gridcell"], .cell, .grid-cell'));
            if (cells.length === 0) continue;

            const item: Record<string, string> = {};
            headers.forEach((header, index) => {
              if (header && cells[index]) {
                item[header] = cells[index].textContent?.trim() || "";
              }
            });
            if (Object.keys(item).length > 0) {
              records.push(item);
            }
          }
        }
      }

      // Approach 2: If no table found, search for repeated layouts (like lists of divs/items with headers)
      if (records.length === 0) {
        const candidateContainers = Array.from(document.querySelectorAll('div, ul, ol')).filter(c => {
          const children = Array.from(c.children);
          return children.length > 3 && children.every(child => child.tagName.toLowerCase() === 'li' || child.className.includes('row') || child.className.includes('item'));
        });

        for (const container of candidateContainers) {
          const items = Array.from(container.children) as HTMLElement[];
          for (const item of items) {
            const text = item.textContent?.trim() || "";
            const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
            
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length > 0 && (emailMatch || phoneMatch)) {
              records.push({
                name: lines[0],
                email: emailMatch ? emailMatch[0] : "",
                phone: phoneMatch ? phoneMatch[0] : "",
                notes: lines.slice(1).join(" ")
              });
            }
          }
          if (records.length > 0) break;
        }
      }

      return records;
    });
  }

  /**
   * Standardizes raw scraped column headers to Bridgeway client properties.
   */
  private normalizeClients(raw: Record<string, string>[]): ExtractedClient[] {
    return raw.map((c) => {
      const nameKey = Object.keys(c).find(k => /name|full\s*name|client|customer/i.test(k));
      let nameVal = nameKey ? c[nameKey] : "";

      if (!nameVal) {
        const firstNameKey = Object.keys(c).find(k => /first|given/i.test(k));
        const lastNameKey = Object.keys(c).find(k => /last|surname/i.test(k));
        const first = firstNameKey ? c[firstNameKey] : "";
        const last = lastNameKey ? c[lastNameKey] : "";
        nameVal = `${first} ${last}`.trim();
      }

      const emailKey = Object.keys(c).find(k => /email|mail|e-mail/i.test(k));
      const emailVal = emailKey ? c[emailKey] : null;

      const phoneKey = Object.keys(c).find(k => /phone|mobile|cell|telephone/i.test(k));
      const phoneVal = phoneKey ? c[phoneKey] : null;

      const dobKey = Object.keys(c).find(k => /dob|birth|birthday/i.test(k));
      const dobVal = dobKey ? c[dobKey] : null;

      const addressKey = Object.keys(c).find(k => /address|street|location/i.test(k));
      const addressVal = addressKey ? c[addressKey] : null;

      const notesKey = Object.keys(c).find(k => /notes|comments|desc/i.test(k));
      const notesVal = notesKey ? c[notesKey] : null;

      return {
        name: nameVal || "Scraped Client",
        email: emailVal,
        phone: phoneVal,
        dateOfBirth: dobVal,
        address: addressVal,
        notes: notesVal
      };
    });
  }

  /**
   * Helper to recursively scan accessibility tree snapshot nodes for a target role and name regex.
   */
  private findNodeByRoleAndName(node: AccessTreeNode, role: string, nameRegex: RegExp): AccessTreeNode | null {
    if (!node) return null;

    if (node.role === role && node.name && nameRegex.test(node.name)) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const match = this.findNodeByRoleAndName(child, role, nameRegex);
        if (match) return match;
      }
    }

    return null;
  }
}
