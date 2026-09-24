import { describe, it, expect, beforeEach } from 'vitest';
import { extractDataset } from '../src/content/domActions';

describe('Scrape Products - Resilient Tag & Nested Text Extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts text directly based on bare h2, h3, and p selectors', async () => {
    document.body.innerHTML = `
      <div class="product-grid">
        <div class="product-card">
          <h2>Wireless Noise Cancelling Headphones</h2>
          <h3>Model WH-1000XM5</h3>
          <p>$349.99</p>
        </div>
        <div class="product-card">
          <h2>True Wireless Earbuds</h2>
          <h3>Model WF-1000XM5</h3>
          <p>$279.99</p>
        </div>
      </div>
    `;

    const res = await extractDataset({
      containerSelector: '.product-card',
      fields: [
        { name: 'title', selector: 'h2', attribute: 'text' },
        { name: 'model', selector: 'h3', attribute: 'text' },
        { name: 'price', selector: 'p', attribute: 'text' },
      ],
    });

    expect(res.items.length).toBe(2);
    expect(res.items[0].title).toBe('Wireless Noise Cancelling Headphones');
    expect(res.items[0].model).toBe('Model WH-1000XM5');
    expect(res.items[0].price).toBe('$349.99');

    expect(res.items[1].title).toBe('True Wireless Earbuds');
    expect(res.items[1].model).toBe('Model WF-1000XM5');
    expect(res.items[1].price).toBe('$279.99');
  });

  it('extracts deeply nested text inside h2, h3, or p (a > span > strong)', async () => {
    document.body.innerHTML = `
      <div class="product-card">
        <h2>
          <a href="/p/air-max">
            <span>
              <strong>Nike Air Max 90</strong>
            </span>
          </a>
        </h2>
        <p class="description">
          <span>
            <span>Iconic waffle sole with <em>stitched overlays</em> and classic accents.</span>
          </span>
        </p>
        <p class="price">
          <span class="currency">$</span>
          <span class="value">130.00</span>
        </p>
      </div>
    `;

    const res = await extractDataset({
      containerSelector: '.product-card',
      fields: [
        { name: 'title', selector: 'h2', attribute: 'text' },
        { name: 'description', selector: 'p.description', attribute: 'text' },
        { name: 'price', selector: 'p.price', attribute: 'text' },
      ],
    });

    expect(res.items.length).toBe(1);
    expect(res.items[0].title).toBe('Nike Air Max 90');
    expect(res.items[0].description).toContain('Iconic waffle sole');
    expect(res.items[0].description).toContain('stitched overlays');
    expect(res.items[0].price).toContain('130.00');
  });

  it('extracts using specific selectors (classes, pseudo-selectors, child combinators)', async () => {
    document.body.innerHTML = `
      <div class="product-card">
        <div class="info-box">
          <h3 class="product-title primary">Apple MacBook Pro 14</h3>
        </div>
        <div class="meta">
          <p class="tag">Refurbished</p>
          <p class="price-val special">$1,599</p>
          <p class="shipping">Free 2-day delivery</p>
        </div>
      </div>
    `;

    const res = await extractDataset({
      containerSelector: '.product-card',
      fields: [
        { name: 'title', selector: 'h3.product-title', attribute: 'text' },
        { name: 'price', selector: 'p.price-val', attribute: 'text' },
        { name: 'tag', selector: 'p:nth-of-type(1)', attribute: 'text' },
        { name: 'shipping', selector: 'p:last-of-type', attribute: 'text' },
      ],
    });

    expect(res.items.length).toBe(1);
    expect(res.items[0].title).toBe('Apple MacBook Pro 14');
    expect(res.items[0].price).toBe('$1,599');
    expect(res.items[0].tag).toBe('Refurbished');
    expect(res.items[0].shipping).toBe('Free 2-day delivery');
  });

  it('handles selectors that redundantly include the container class prefix or combinator', async () => {
    document.body.innerHTML = `
      <div class="product-card">
        <h2 class="title">Bose QuietComfort Ultra</h2>
        <p class="price">$429.00</p>
      </div>
    `;

    const res = await extractDataset({
      containerSelector: '.product-card',
      fields: [
        // User pasted selector with container prefix: '.product-card h2'
        { name: 'title', selector: '.product-card h2', attribute: 'text' },
        // User pasted combinator: '> p.price'
        { name: 'price', selector: '> p.price', attribute: 'text' },
      ],
    });

    expect(res.items.length).toBe(1);
    expect(res.items[0].title).toBe('Bose QuietComfort Ultra');
    expect(res.items[0].price).toBe('$429.00');
  });

  it('intelligently distinguishes price <p> from description and badge <p> tags', async () => {
    document.body.innerHTML = `
      <div class="card">
        <h3>Sony Bravia OLED TV</h3>
        <p class="promo-badge">HOT DEAL</p>
        <p class="description">4K HDR processor with Acoustic Surface Audio+.</p>
        <p class="price">
          <span class="now">Special: $1,498.00</span>
        </p>
      </div>
    `;

    const res = await extractDataset({
      containerSelector: '.card',
      fields: [
        { name: 'title', selector: 'h3', attribute: 'text' },
        // User just specifies 'p' for price!
        { name: 'price', selector: 'p', attribute: 'text' },
        { name: 'description', selector: 'p.description', attribute: 'text' },
      ],
    });

    expect(res.items.length).toBe(1);
    expect(res.items[0].title).toBe('Sony Bravia OLED TV');
    // Price should pick the <p> containing currency/price digits rather than "HOT DEAL"
    expect(res.items[0].price).toContain('$1,498.00');
    expect(res.items[0].description).toContain('4K HDR processor');
  });

  it('supports comma-separated multi-tag selectors like h2, h3, p', async () => {
    document.body.innerHTML = `
      <div class="item-card">
        <!-- Site uses h3 for card 1 -->
        <h3>Kindle Paperwhite</h3>
      </div>
      <div class="item-card">
        <!-- Site uses h2 for card 2 -->
        <h2>Kindle Oasis</h2>
      </div>
      <div class="item-card">
        <!-- Site uses p for card 3 -->
        <p class="heading">Kindle Scribe</p>
      </div>
    `;

    const res = await extractDataset({
      containerSelector: '.item-card',
      fields: [
        { name: 'title', selector: 'h2, h3, p', attribute: 'text' },
      ],
    });

    expect(res.items.length).toBe(3);
    expect(res.items[0].title).toBe('Kindle Paperwhite');
    expect(res.items[1].title).toBe('Kindle Oasis');
    expect(res.items[2].title).toBe('Kindle Scribe');
  });

  it('automatically falls back to image alt or title attribute if no textual node exists inside h2/h3', async () => {
    document.body.innerHTML = `
      <div class="product">
        <h3>
          <a href="/catalog/item-1" title="Mechanical Gaming Keyboard">
            <img src="/img/kbd.png" alt="Mechanical Gaming Keyboard" />
          </a>
        </h3>
        <p>$89.99</p>
      </div>
    `;

    const res = await extractDataset({
      containerSelector: '.product',
      fields: [
        { name: 'title', selector: 'h3', attribute: 'text' },
        { name: 'price', selector: 'p', attribute: 'text' },
      ],
    });

    expect(res.items.length).toBe(1);
    expect(res.items[0].title).toBe('Mechanical Gaming Keyboard');
    expect(res.items[0].price).toBe('$89.99');
  });

  it('auto-detects repeating card containers on websites when containerSelector is default or empty', async () => {
    // E.g. books.toscrape.com uses article.product_pod, but containerSelector default is .product-card
    document.body.innerHTML = `
      <ol class="row">
        <li class="col-xs-6 col-sm-4 col-md-3 col-lg-3">
          <article class="product_pod">
            <h3><a href="book1.html" title="A Light in the Attic">A Light in the ...</a></h3>
            <div class="product_price">
              <p class="price_color">£51.77</p>
            </div>
          </article>
        </li>
        <li class="col-xs-6 col-sm-4 col-md-3 col-lg-3">
          <article class="product_pod">
            <h3><a href="book2.html" title="Tipping the Velvet">Tipping the Velvet</a></h3>
            <div class="product_price">
              <p class="price_color">£53.74</p>
            </div>
          </article>
        </li>
      </ol>
    `;

    // containerSelector is left as '.product-card' (default), but page has article.product_pod!
    const res = await extractDataset({
      containerSelector: '.product-card',
      fields: [
        { name: 'title', selector: 'h3', attribute: 'text' },
        { name: 'price', selector: 'p', attribute: 'text' },
      ],
    });

    expect(res.items.length).toBe(2);
    // Should extract title correctly (using a[title] fallback since h3 text is truncated with ...)
    expect(res.items[0].title).toBe('A Light in the Attic');
    expect(res.items[0].price).toBe('£51.77');
    expect(res.items[1].title).toBe('Tipping the Velvet');
    expect(res.items[1].price).toBe('£53.74');
  });
});
