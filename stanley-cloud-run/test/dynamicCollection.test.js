const test = require('node:test');
const assert = require('node:assert/strict');
const { assertList, enrichList, extractDomList, scrollUntil } = require('../src/use-case-engine/dynamicCollection');

test('dynamic feed scrolling targets nested containers and stops after enough items load', async () => {
  const counts = [4, 11, 24];
  let reads = 0;
  let scrolls = 0;
  const page = {
    locator(selector) {
      if (selector === '.card') return { count: async () => counts[Math.min(reads++, counts.length - 1)] };
      if (selector === '[role="feed"]') return { first: () => ({ evaluate: async (_fn, amount) => { assert.equal(amount, 1400); scrolls += 1; } }) };
      throw new Error(`Unexpected selector ${selector}`);
    },
    waitForTimeout: async () => {},
  };
  const result = await scrollUntil({ page, containerSelector: '[role="feed"]', itemSelector: '.card', targetCount: 24, maxScrolls: 10, scrollAmount: 1400, settleMs: 0 });
  assert.equal(result.reachedTarget, true);
  assert.equal(result.count, 24);
  assert.equal(scrolls, 2);
});

test('dynamic feed targets can count unique attributes instead of duplicate DOM matches', async () => {
  const page = {
    locator: () => ({ evaluateAll: async (_fn, attribute) => { assert.equal(attribute, 'href'); return 3; } }),
  };
  const result = await scrollUntil({ page, itemSelector: 'a', uniqueByAttribute: 'href', targetCount: 3, maxScrolls: 2, settleMs: 0 });
  assert.equal(result.reachedTarget, true);
  assert.equal(result.count, 3);
});

test('deterministic DOM collection keeps required records and deduplicates canonical URLs', async () => {
  const page = {
    locator: () => ({ evaluateAll: async (_fn, config) => {
      assert.equal(config.fields.url.attribute, 'href');
      return [
        { name: 'One', url: 'https://example.com/1' },
        { name: 'One duplicate', url: 'https://example.com/1' },
        { name: '', url: 'https://example.com/2' },
      ];
    } }),
  };
  const records = await extractDomList({ page, itemSelector: '.card', fields: { name: { attribute: 'text', required: true }, url: { attribute: 'href', required: true } }, dedupeBy: 'url', maxItems: 20 });
  assert.deepEqual(records, [{ name: 'One', url: 'https://example.com/1' }]);
});

test('detail enrichment visits bounded source URLs and merges recovered fields', async () => {
  const visited = [];
  const agent = {
    navigate: async (url) => visited.push(url),
    waitForPageStable: async () => {},
    page: { evaluate: async () => ({ phone: 'Phone: 312-555-0100', address: 'Address: Chicago' }) },
  };
  const records = await enrichList({ agent, records: [{ name: 'One', listingUrl: 'https://example.com/1' }, { name: 'No URL' }], urlField: 'listingUrl', fields: { phone: { selector: '.phone', attribute: 'text' }, address: { selector: '.address', attribute: 'text' } }, maxItems: 5, settleMs: 0 });
  assert.deepEqual(visited, ['https://example.com/1']);
  assert.equal(records[0].phone, 'Phone: 312-555-0100');
  assert.equal(records[0].name, 'One');
});

test('use-case assertions fail closed on count, required fields, and duplicate output', () => {
  const valid = [{ name: 'One', url: 'https://example.com/1' }, { name: 'Two', url: 'https://example.com/2' }];
  assert.deepEqual(assertList(valid, { minItems: 2, requiredFields: ['name', 'url'], uniqueBy: 'url' }), valid);
  assert.throws(() => assertList(valid, { minItems: 3 }), /expected at least 3/);
  assert.throws(() => assertList([{ name: 'One' }], { minItems: 1, requiredFields: ['url'] }), /missing url/);
  assert.deepEqual(assertList([valid[0], valid[0]], { minItems: 1, uniqueBy: 'url' }), [valid[0]]);
  assert.deepEqual(assertList([{ name: 'Incomplete' }, ...valid], { minItems: 2, requiredFields: ['url'], uniqueBy: 'url', dropIncomplete: true, outputLimit: 2 }), valid);
});
