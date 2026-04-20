const axios = require("axios");
const cheerio = require("cheerio");
const { randomUUID } = require("crypto");

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function cleanProductText(text) {
  return normalizeText(text)
    .replace(/készletértesítő|értesítés kérhető|részletek|nincs készleten|nem elérhető|elfogyott|raktáron/g, "")
    .replace(/\s*\d{1,3}(?:[ .]\d{3})*\s*ft\s*$/g, "")
    .replace(/\s*\d{1,3}(?:[ .]\d{3})*\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyStock(text) {
  const normalized = normalizeText(text);

  const outStockKeywords = [
    "értesítés kérhető",
    "nincs készleten",
    "nincs raktáron",
    "nem elérhető",
    "nem rendelhető",
    "elfogyott",
    "out of stock",
    "sold out",
    "unavailable"
  ];

  const inStockKeywords = [
    "kosárba",
    "készleten",
    "raktáron",
    "in stock",
    "add to cart",
    "buy now"
  ];

  const isOut = outStockKeywords.some(keyword => normalized.includes(keyword));
  const isIn = inStockKeywords.some(keyword => normalized.includes(keyword));

  if (isOut) return "Out of stock ❌";
  if (isIn) return "In stock ✅";
  return "Stock status unclear ⚠️";
}

function classifyMetagamesStock(text) {
  const normalized = normalizeText(text);

  if (/nincs készleten|elfogyott|készletértesítő|értesítés kérhető/.test(normalized)) {
    return "Out of stock ❌";
  }

  if (/készleten|raktáron|kosárba/.test(normalized)) {
    return "In stock ✅";
  }

  return "Stock status unclear ⚠️";
}

function extractProductTitle($, link) {
  const directText = cleanProductText($(link).text());
  if (directText) return directText;

  const parentText = cleanProductText($(link).parent().text());
  if (parentText) return parentText;

  return cleanProductText($(link).closest("article, li, .product, .item, .card, .product-item, .product-list-item").text());
}

function extractProductContext($, link) {
  const container = $(link).closest("article, li, .product, .item, .card, .product-item, .product-list-item");

  if (container.length) {
    return container.text();
  }

  return $(link).parent().text();
}

function isLikelySearchOrListingPage(url, $) {
  const normalizedUrl = (url || "").toLowerCase();
  if (/kereses|search|category|kategori|list|products/.test(normalizedUrl)) {
    return true;
  }

  const bodyClass = ($("body").attr("class") || "").toLowerCase();
  if (/category|search|listing|product-list/.test(bodyClass)) {
    return true;
  }

  return false;
}

function isLikelyProductPage(url, $) {
  const normalizedUrl = (url || "").toLowerCase();
  const bodyClass = ($("body").attr("class") || "").toLowerCase();

  if (/product-page|productid_|product-detail/.test(bodyClass)) {
    return true;
  }

  if ($("input[name='product_id']").length > 0) {
    return true;
  }

  if (/\/product\/|\/termek\//.test(normalizedUrl)) {
    return true;
  }

  return false;
}

function hasNoResultsSignal(pageText) {
  const normalized = normalizeText(pageText);
  const noResultsKeywords = [
    "nincs találat",
    "nincs a keresési feltételeknek megfelelő",
    "nincs megfelelő termék",
    "nincs található termék",
    "no results",
    "no products",
    "nothing found"
  ];

  return noResultsKeywords.some(keyword => normalized.includes(keyword));
}

function isMetagamesUrl(url) {
  return /metagames\.hu/i.test(url || "");
}

function isGamerunnerUrl(url) {
  return /gamerunner\.hu/i.test(url || "");
}

function isSportKartyaboltUrl(url) {
  return /sportkartyabolt\.hu/i.test(url || "");
}

function isMomokoshopUrl(url) {
  return /momokoshop\.hu/i.test(url || "");
}

function isPokedomUrl(url) {
  return /pokedom\.hu/i.test(url || "");
}

function isReflexshopUrl(url) {
  return /reflexshop\.hu/i.test(url || "");
}

function isPokekaUrl(url) {
  return /pokeka\.hu/i.test(url || "");
}

function isMythgamesUrl(url) {
  return /mythgames\.(eu|hu)/i.test(url || "");
}

function isCobracardUrl(url) {
  return /cobracard\.hu/i.test(url || "");
}

function buildGamerunnerSearchUrl(keyword) {
  const sessionId = `session-${randomUUID()}`;
  const userId = randomUUID();
  const queryId = `${randomUUID()}/${Date.now()}`;

  const params = new URLSearchParams({
    customer_group_id: "8",
    data_index: "es_hu6_client_5",
    engine: "shoprenter",
    filter_description: "1",
    fuzziness: "",
    fuzzy_search: "1",
    replace_hyphens_with_spaces: "1",
    in_stock_only: "0",
    is_admin: "0",
    is_mobile: "0",
    is_preview: "0",
    lang: "hu",
    new_product_threshold: "30",
    out_of_stock_show_children: "0",
    resultpage_hide_parent_products: "0",
    search_subcategory: "0",
    session_id: sessionId,
    show_child_data: "1",
    show_child_products: "0",
    show_original_price: "1",
    user_id: `"${userId}"`,
    weights: JSON.stringify({
      attributes: 1,
      description: 1,
      manufacturer: 1,
      model: 5,
      parameters: 1,
      product_name: 5,
      short_description: 1,
      sku: 5,
      tags: 5
    }),
    zero_search_mode: "undefined",
    filters: "{}",
    show_filters: "1",
    query_id: queryId,
    max_product_count: "24",
    max_keyword_count: "11",
    page: "1",
    sort: "relevance",
    type: "resultPage",
    image_width: "214",
    image_height: "214",
    price_mode: "only_gross",
    useGeneralFOC: "0",
    filter_category_id: "0",
    selected_manufacturer: "",
    is_collection_page: "0",
    includeProductVariants: "0",
    keyword
  });

  return `https://europe-west1-rapid-product-search.cloudfunctions.net/appV2/api/gamerunner.shoprenter.hu/search/?${params.toString()}`;
}

function classifyGamerunnerProduct(product) {
  const stockName = normalizeText(product.stockStatus?.name || "");
  const stockCount = typeof product.stock === "number" ? product.stock : null;

  if (stockCount && stockCount > 0) {
    return "In stock ✅";
  }

  if (/raktáron|készleten|kosárba/.test(stockName)) {
    return "In stock ✅";
  }

  if (/értesítés kérhető|nincs készleten|nem elérhető|elfogyott|out of stock|sold out|unavailable/.test(stockName)) {
    return "Out of stock ❌";
  }

  return "Stock status unclear ⚠️";
}

function isAvailableStock(stock) {
  return /In stock ✅/i.test(stock);
}

function formatProducts(products, options = {}) {
  const filteredProducts = options.availableOnly
    ? products.filter(product => isAvailableStock(product.stock))
    : products;

  return {
    products: filteredProducts,
    filteredOutCount: products.length - filteredProducts.length
  };
}

async function fetchGamerunnerProducts(keyword) {
  const apiUrl = buildGamerunnerSearchUrl(keyword);
  const { data } = await axios.get(apiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
      "Referer": `https://gamerunner.hu/kereses?description=1&keyword=${encodeURIComponent(keyword)}`
    },
    timeout: 30000
  });

  if (!data || !Array.isArray(data.products)) {
    return [];
  }

  return data.products
    .map(product => ({
      title: product.productName || "",
      stock: classifyGamerunnerProduct(product),
      url: product.productUrl || ""
    }))
    .filter(product => product.title);
}

function extractSportKartyaboltProducts($) {
  const products = [];
  const seen = new Set();

  const candidateProducts = $("article.product, article.js-product, article")
    .map((_, article) => {
      const articleText = $(article).text().replace(/\s+/g, " ").trim();
      const titleSource = $(article).find("a.product__name-link, h2.product__name, h1, h2, h3").first();
      const title = cleanProductText(titleSource.attr("title") || titleSource.text() || articleText);
      const stockText = $(article).find("strong").first().text() || articleText;

      return {
        title,
        context: stockText || articleText
      };
    })
    .get()
    .filter(product => product.title)
    .filter(product => product.title.length >= 8)
    .filter(product => /pokemon|pok[eé]mon|elite trainer box|etb|booster|tin|collection|box|card/i.test(product.title))
    .filter(product => /raktáron|nincs raktáron|készleten|nincs készleten|elfogyott|nem elérhető|kosárba|értesítés kérhető/i.test(product.context));

  for (const product of candidateProducts) {
    const stock = classifyStock(product.context);
    if (!/In stock|Out of stock/i.test(stock)) continue;

    const key = product.title;
    if (seen.has(key)) continue;

    seen.add(key);
    products.push({ title: product.title, stock });
  }

  return products;
}

function extractMomokoshopProducts($) {
  const products = [];
  const seen = new Set();

  $("li.product, article.product")
    .each((_, element) => {
      const card = $(element);
      const cardClass = (card.attr("class") || "").toLowerCase();
      const titleLink = card.find("h3.product-title a").first().length
        ? card.find("h3.product-title a").first()
        : card.find("h2 a, a.woocommerce-LoopProduct-link").first();
      const title = cleanProductText(titleLink.attr("title") || titleLink.text() || card.text());
      const context = card.text().replace(/\s+/g, " ").trim();

      if (!title || title.length < 8) return;
      if (!/pokemon|pok[eé]mon/i.test(title)) return;

      let stock = "Stock status unclear ⚠️";

      if (/outofstock|sold out/.test(cardClass) || /elfogyott|nincs készleten|nem elérhető|out of stock|sold out/i.test(context)) {
        stock = "Out of stock ❌";
      } else if (/instock|kosárba|készleten|raktáron|add to cart/i.test(cardClass) || /kosárba|készleten|raktáron|in stock|add to cart/i.test(context)) {
        stock = "In stock ✅";
      }

      if (!/In stock|Out of stock/i.test(stock)) return;

      const key = title;
      if (seen.has(key)) return;

      seen.add(key);
      products.push({ title, stock });
    });

  return products;
}

function extractPokedomProducts($) {
  const products = [];
  const seen = new Set();
  const noisePattern = /(kívánságlistára teszem|értesítés|kosárba|tovább olvasom|quick view|wishlist|add to wishlist|icon-heart|js-add-to-wishlist|\bár:|eredeti ár|akciós ár|kedvezmény|színválasztó)/gi;

  $("article.product, li.product")
    .each((_, element) => {
      const card = $(element);
      const cardClass = (card.attr("class") || "").toLowerCase();
      const productLink = card
        .find("h1 a, h2 a, h3 a, a.product__name-link, a.woocommerce-LoopProduct-link, a[href*='/product/'], a[href*='/termek/']")
        .filter((__, link) => {
          const text = ($(link).text() || $(link).attr("title") || "").replace(/\s+/g, " ").trim();
          return text.length >= 8;
        })
        .first();
      const href = productLink.attr("href") || "";
      const title = cleanProductText((productLink.attr("title") || productLink.text() || "").replace(noisePattern, " "));
      const context = card
        .text()
        .replace(noisePattern, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!title || title.length < 8) return;
      if (!/pokemon|pok[eé]mon|elite trainer box|etb|booster|tin|collection|box|card/i.test(title)) return;
      if (/kívánságlistára teszem|quick view|tovább olvasom/i.test(title)) return;

      const stock = /outofstock|elfogyott|nincs készleten|nincs raktáron|nem elérhető|értesítés|notification/i.test(cardClass) || /out of stock|elfogyott|nincs készleten|nincs raktáron|nem elérhető|értesítés/i.test(context)
        ? "Out of stock ❌"
        : /instock|kosárba|készleten|raktáron|add to cart|utolsó \d+ db/i.test(cardClass) || /kosárba|készleten|raktáron|in stock|add to cart|utolsó \d+ db/i.test(context)
          ? "In stock ✅"
          : "Stock status unclear ⚠️";

      if (!/In stock|Out of stock/i.test(stock)) return;

      const key = normalizeText(href || title);
      if (seen.has(key)) return;

      seen.add(key);
      products.push({ title, stock });
    });

  return products;
}

function extractReflexshopProducts($) {
  const products = [];
  const seen = new Set();

  $("article.product-card")
    .each((_, element) => {
      const card = $(element);
      const titleLink = card.find("a.name-link").first();
      const title = cleanProductText(titleLink.text() || titleLink.attr("title") || card.text());
      const context = card.text().replace(/\s+/g, " ").trim();

      if (!title || title.length < 8) return;
      if (!/pokemon|pok[eé]mon|elite trainer box|etb|booster|tin|collection|box|card/i.test(title)) return;

      const stock = /nem rendelhető|elfogyott|nincs készleten|nincs raktáron|nem elérhető|out of stock|sold out/i.test(context)
        ? "Out of stock ❌"
        : /raktáron|készleten|in stock|add to cart/i.test(context)
          ? "In stock ✅"
          : "Stock status unclear ⚠️";

      if (!/In stock|Out of stock/i.test(stock)) return;

      const key = normalizeText(title);
      if (seen.has(key)) return;

      seen.add(key);
      products.push({ title, stock });
    });

  return products;
}

function classifyPokekaStock(text) {
  const stock = classifyStock(text || "");
  if (/Out of stock/i.test(stock)) {
    return "Out of stock ❌";
  }

  return "In stock ✅";
}

function extractPokekaProducts($) {
  const products = [];
  const seen = new Set();

  $("a[href*='/products/']")
    .each((_, link) => {
      const href = $(link).attr("href") || "";
      const title = cleanProductText($(link).text() || $(link).attr("title") || "");
      const context = $(link)
        .closest("li, article, .grid__item, .card-wrapper, .card")
        .text()
        .replace(/\s+/g, " ")
        .trim();

      if (!href || !title || title.length < 8) return;

      const stock = classifyPokekaStock(context || title);
      const key = normalizeText(href);

      if (seen.has(key)) return;

      seen.add(key);
      products.push({ title, stock });
    });

  return products;
}

function classifyMythgamesStock(text) {
  const normalized = normalizeText(text || "");

  if (/sold out|out of stock|elfogyott|nincs készleten|nincs raktáron|nem elérhető|nem rendelhető/i.test(normalized)) {
    return "Out of stock ❌";
  }

  return "In stock ✅";
}

function extractMythgamesProducts($) {
  const products = [];
  const seen = new Set();

  $("a.hdt-card-product__title[href*='/products/']")
    .each((_, element) => {
      const titleLink = $(element);
      const card = titleLink.closest(".hdt-card-product");
      const href = titleLink.attr("href") || "";
      const title = cleanProductText(titleLink.text() || titleLink.attr("title") || card.text());
      const context = card.length ? card.text().replace(/\s+/g, " ").trim() : titleLink.parent().text().replace(/\s+/g, " ").trim();

      if (!href) return;
      if (!title || title.length < 8) return;
      if (!/pokemon|pok[eé]mon/i.test(title)) return;

      const stock = classifyMythgamesStock(context || title);
      const key = normalizeText(href);

      if (seen.has(key)) return;

      seen.add(key);
      products.push({ title, stock });
    });

  return products;
}

function extractCobracardProducts($) {
  const products = [];
  const seen = new Set();

  $("li.product")
    .each((_, element) => {
      const card = $(element);
      const cardClass = normalizeText(card.attr("class") || "");

      const candidateTitleLinks = card
        .find("a[href*='/termek/']")
        .map((__, link) => {
          const text = ($(link).text() || "").replace(/\s+/g, " ").trim();
          return {
            text,
            href: $(link).attr("href") || ""
          };
        })
        .get()
        .filter(item => item.href)
        .filter(item => item.text.length >= 8)
        .filter(item => !/^out of stock$/i.test(item.text))
        .filter(item => !/tov[aá]bb olvasom|term[eé]kr[oő]l t[oö]bb inform[aá]ci[oó]/i.test(item.text));

      const bestTitleLink = candidateTitleLinks.sort((a, b) => b.text.length - a.text.length)[0];
      if (!bestTitleLink) return;

      const title = cleanProductText(bestTitleLink.text.replace(/\s*out of stock\s*$/i, "").trim());
      const context = card.text().replace(/\s+/g, " ").trim();

      if (!title || title.length < 8) return;
      if (!/pokemon|pok[eé]mon/i.test(title)) return;

      const stock = /outofstock|out-of-stock|sold out|elfogyott|nincs készleten|nincs raktáron|nem elérhető/i.test(cardClass)
        || /out of stock|sold out|elfogyott|nincs készleten|nincs raktáron|nem elérhető|tov[aá]bb olvasom/i.test(context)
        ? "Out of stock ❌"
        : /instock|in-stock|készleten|raktáron|kosárba|add to cart/i.test(cardClass)
          || /k[oö]s[aá]rba teszem|k[oö]s[aá]rba|készleten|raktáron|add to cart|in stock/i.test(context)
          ? "In stock ✅"
          : "Stock status unclear ⚠️";

      if (!/In stock|Out of stock/i.test(stock)) return;

      const key = normalizeText(bestTitleLink.href || title);
      if (seen.has(key)) return;

      seen.add(key);
      products.push({ title, stock });
    });

  return products;
}

function extractMetagamesProducts($) {
  const cards = $(".product-list-text");
  const products = [];
  const seen = new Set();

  cards.each((_, element) => {
    const rawText = $(element).text().replace(/\s+/g, " ").trim();
    if (!rawText) return;

    const stock = classifyMetagamesStock(rawText);
    if (!/In stock|Out of stock/i.test(stock)) return;

    const title = rawText
      .replace(/(Készleten|Nincs készleten|Raktáron|Készletértesítő|Értesítés kérhető)/gi, "")
      .replace(/\d{1,3}(?:[ .]\d{3})*\s*ft/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!title) return;
    if (seen.has(title)) return;

    seen.add(title);
    products.push({ title, stock });
  });

  return products;
}

function extractGamerunnerContext($, link) {
  let current = $(link);
  const contexts = [];

  for (let depth = 0; depth < 8 && current.length; depth += 1) {
    const text = current.text().replace(/\s+/g, " ").trim();
    const siblingText = current.next().text().replace(/\s+/g, " ").trim();

    if (text) contexts.push(text);
    if (siblingText) contexts.push(siblingText);

    current = current.parent();
  }

  for (const context of contexts) {
    if (/raktáron|készleten|kosárba|értesítés kérhető|nincs készleten|nem elérhető|elfogyott|sold out|out of stock|add to cart/i.test(context)) {
      return context;
    }
  }

  return contexts[0] || "";
}

function cleanGamerunnerTitle(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—:]+\s*$/g, "")
    .replace(/\s*(Részletek|Kosárba|Értesítés)\s*$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractGamerunnerProducts($) {
  const products = [];
  const seen = new Map();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const bodyPattern = /((?:Pok[eé]mon|Pokemon)\s+TCG[\s\S]{0,180}?)(Raktáron|Értesítés kérhető|Nincs készleten|Nem elérhető|Elfogyott)(?:\s*([0-9][0-9.\s]*Ft))?/gi;

  for (const match of bodyText.matchAll(bodyPattern)) {
    const title = cleanGamerunnerTitle(match[1]);
    const stock = classifyStock(match[2]);

    if (!title || title.length < 8) continue;
    if (!/In stock|Out of stock/i.test(stock)) continue;

    const key = title;
    const existing = seen.get(key);
    const priority = { "In stock ✅": 2, "Out of stock ❌": 1 };

    if (!existing || (priority[stock] || 0) > (priority[existing.stock] || 0)) {
      seen.set(key, { title, stock });
    }
  }

  for (const product of seen.values()) {
    products.push(product);
  }

  if (products.length > 0) {
    return products;
  }

  const productLinks = $("a[href*='keyword=']")
    .map((_, link) => ({
      href: $(link).attr("href"),
      title: cleanGamerunnerTitle($(link).text()),
      context: extractGamerunnerContext($, link)
    }))
    .get()
    .filter(product => product.href && product.title)
    .filter(product => product.title.length >= 8)
    .filter(product => !/találatok szűkítése|kategória|ár|gyártó|termékállapot|rendezés|összes|gyűjtögetős kártyajátékok|kezdőlap|gamerunner|raktáron lévő termékeknél/i.test(product.title));

  for (const product of productLinks) {
    const stock = classifyStock(product.context || product.title);
    if (!/In stock|Out of stock/i.test(stock)) continue;

    const key = product.title;
    const existing = seen.get(key);
    const priority = { "In stock ✅": 2, "Out of stock ❌": 1 };

    if (!existing || (priority[stock] || 0) > (priority[existing.stock] || 0)) {
      seen.set(key, { title: product.title, stock });
    }
  }

  return [...seen.values()];
}

function extractSearchKeyword(url) {
  try {
    const parsed = new URL(url);
    return normalizeText(parsed.searchParams.get("keyword") || "");
  } catch {
    return "";
  }
}

function extractCandidateLinks($, baseUrl, keyword) {
  let base;

  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const disallowed = /account|login|register|checkout|cart|wishlist|newsletter|blog|kapcsolat|rolunk|fizetes|szallitas/i;
  const keywordPattern = keyword ? new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

  const links = $("a[href]")
    .map((_, link) => $(link).attr("href"))
    .get()
    .filter(Boolean)
    .filter(href => !href.startsWith("#") && !href.startsWith("javascript:"))
    .map(href => {
      try {
        return new URL(href, base).href;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter(href => {
      try {
        const parsed = new URL(href);
        if (parsed.hostname !== base.hostname) return false;
      } catch {
        return false;
      }

      if (disallowed.test(href)) return false;
      if (/kereses\?|search\?/.test(href)) return false;
      if (keywordPattern) return keywordPattern.test(href);

      return /pokemon|product|termek|jatek/i.test(href);
    });

  return [...new Set(links)].slice(0, 12);
}

async function checkStock(url, options = {}) {
  const depth = options.depth || 0;
  const visited = options.visited || new Set();

  if (visited.has(url)) {
    return "Already checked this page";
  }

  visited.add(url);

  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      timeout: 30000
    });

      const $ = cheerio.load(data);
      const isSearchOrListingPage = isLikelySearchOrListingPage(url, $);
      const isProductPage = isLikelyProductPage(url, $);
      const searchKeyword = extractSearchKeyword(url);

      if (isMetagamesUrl(url)) {
        const metagamesProducts = extractMetagamesProducts($);
        const { products } = formatProducts(metagamesProducts, options);

        if (products.length > 0) {
          return products.map(product => `${product.title} - ${product.stock}`).join("\n");
        }

        if (options.availableOnly && metagamesProducts.length > 0) {
          return "No available products found ❌";
        }

        const pageText = $("body").text();
        if (hasNoResultsSignal(pageText)) {
          return "No matching products found ❌";
        }

        return "No matching products found ❌";
      }

      if (isGamerunnerUrl(url)) {
        const gamerunnerProducts = await fetchGamerunnerProducts(extractSearchKeyword(url));
        const { products } = formatProducts(gamerunnerProducts, options);

        if (products.length > 0) {
          return products.map(product => `${product.title} - ${product.stock}`).join("\n");
        }

        if (options.availableOnly && gamerunnerProducts.length > 0) {
          return "No available products found ❌";
        }

        const pageText = $("body").text();
        if (hasNoResultsSignal(pageText)) {
          return "No matching products found ❌";
        }

        return "No matching products found ❌";
      }

      if (isSportKartyaboltUrl(url)) {
        const sportKartyaboltProducts = extractSportKartyaboltProducts($);
        const { products } = formatProducts(sportKartyaboltProducts, options);

        if (products.length > 0) {
          return products.map(product => `${product.title} - ${product.stock}`).join("\n");
        }

        if (options.availableOnly && sportKartyaboltProducts.length > 0) {
          return "No available products found ❌";
        }

        const pageText = $("body").text();
        if (hasNoResultsSignal(pageText)) {
          return "No matching products found ❌";
        }

        return "No matching products found ❌";
      }

      if (isMomokoshopUrl(url)) {
        const momokoshopProducts = extractMomokoshopProducts($);
        const { products } = formatProducts(momokoshopProducts, options);

        if (products.length > 0) {
          return products.map(product => `${product.title} - ${product.stock}`).join("\n");
        }

        if (options.availableOnly && momokoshopProducts.length > 0) {
          return "No available products found ❌";
        }

        const pageText = $("body").text();
        if (hasNoResultsSignal(pageText)) {
          return "No matching products found ❌";
        }

        return "No matching products found ❌";
      }

      if (isPokedomUrl(url)) {
        const pokedomProducts = extractPokedomProducts($);
        const { products } = formatProducts(pokedomProducts, options);

        if (products.length > 0) {
          return products.map(product => `${product.title} - ${product.stock}`).join("\n");
        }

        if (options.availableOnly && pokedomProducts.length > 0) {
          return "No available products found ❌";
        }

        const pageText = $("body").text();
        if (hasNoResultsSignal(pageText)) {
          return "No matching products found ❌";
        }

        return "No matching products found ❌";
      }

      if (isReflexshopUrl(url)) {
        const reflexshopProducts = extractReflexshopProducts($);
        const { products } = formatProducts(reflexshopProducts, options);

        if (products.length > 0) {
          return products.map(product => `${product.title} - ${product.stock}`).join("\n");
        }

        if (options.availableOnly && reflexshopProducts.length > 0) {
          return "No available products found ❌";
        }

        const pageText = $("body").text();
        if (hasNoResultsSignal(pageText)) {
          return "No matching products found ❌";
        }

        return "No matching products found ❌";
      }

      if (isPokekaUrl(url)) {
        const pokekaProducts = extractPokekaProducts($);
        const { products } = formatProducts(pokekaProducts, options);

        if (products.length > 0) {
          return products.map(product => `${product.title} - ${product.stock}`).join("\n");
        }

        if (options.availableOnly && pokekaProducts.length > 0) {
          return "No available products found ❌";
        }

        const pageText = $("body").text();
        if (hasNoResultsSignal(pageText)) {
          return "No matching products found ❌";
        }

        return "No matching products found ❌";
      }

      if (isMythgamesUrl(url)) {
        const mythgamesProducts = extractMythgamesProducts($);
        const { products } = formatProducts(mythgamesProducts, options);

        if (products.length > 0) {
          return products.map(product => `${product.title} - ${product.stock}`).join("\n");
        }

        if (options.availableOnly && mythgamesProducts.length > 0) {
          return "No available products found ❌";
        }

        const pageText = $("body").text();
        if (hasNoResultsSignal(pageText)) {
          return "No matching products found ❌";
        }

        return "No matching products found ❌";
      }

      if (isCobracardUrl(url)) {
        const cobracardProducts = extractCobracardProducts($);
        const { products } = formatProducts(cobracardProducts, options);

        if (products.length > 0) {
          return products.map(product => `${product.title} - ${product.stock}`).join("\n");
        }

        if (options.availableOnly && cobracardProducts.length > 0) {
          return "No available products found ❌";
        }

        const pageText = $("body").text();
        if (hasNoResultsSignal(pageText)) {
          return "No matching products found ❌";
        }

        return "No matching products found ❌";
      }

    const productLinks = $("a[href*='pid'], [data-product-id] a[href], .product a[href], .product-item a[href], .product-layout a[href], .product-thumb a[href], .product-grid a[href], .product-list a[href]")
      .map((_, link) => ({
        href: $(link).attr("href"),
        title: extractProductTitle($, link),
        context: extractProductContext($, link)
      }))
      .get()
      .filter(product => product.href && product.title)
      .filter(product => /ft|készletértesítő|értesítés kérhető|nincs készleten|nem elérhető|elfogyott|kosárba|raktáron|készleten|sold out|in stock|add to cart/i.test(product.context));

    const uniqueProducts = [];
    const seen = new Set();

    for (const product of productLinks) {
      if (seen.has(product.href)) continue;

      seen.add(product.href);
      uniqueProducts.push(product);
    }

    if (uniqueProducts.length > 0) {
      return uniqueProducts
        .map(product => `${product.title} - ${classifyStock(product.context)}`)
        .join("\n");
    }

    const pageText = $("body").text();

    if (hasNoResultsSignal(pageText)) {
      return "No matching products found ❌";
    }

    if (!isProductPage && isSearchOrListingPage) {
      if (depth < 1) {
        const candidateLinks = extractCandidateLinks($, url, searchKeyword);

        if (candidateLinks.length > 0) {
          const candidateResults = [];

          for (const candidateUrl of candidateLinks) {
            const candidateResult = await checkStock(candidateUrl, { depth: depth + 1, visited, availableOnly: options.availableOnly });

            if (/in stock|out of stock/i.test(candidateResult)) {
              candidateResults.push(`${candidateUrl} -> ${candidateResult}`);
            }
          }

          if (candidateResults.length > 0) {
            return candidateResults.join("\n");
          }
        }
      }

      return "No matching products found ❌";
    }

    return classifyStock(pageText);
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return `Timeout fetching page (site may require JavaScript rendering or is blocking automated requests)`;
    }
    return "Error fetching page: " + err.message;
  }
}

async function checkPages(urls, options = {}) {
  const results = [];

  for (const url of urls) {
    const result = await checkStock(url, options);
    results.push({ url, result });
  }

  return results;
}

function getDefaultPages() {
  return [
    "https://www.metagames.hu/gyujtogetos-kartyajatekok/pokemon-tcg?kereses=elite+trainer+box&categoryId=pokemon-tcg&pageSize=48",
    "https://gamerunner.hu/kereses?description=1&keyword=elite+trainer+box",
    "https://sportkartyabolt.hu/shop_search.php?search=elite+trainer+box",
    "https://momokoshop.hu/?s=elite+trainer+box&post_type=product&product_cat&product_count=104",
    "https://reflexshop.hu/shop_search.php?search=elite+trainer+box",
    "https://pokeka.hu/search?q=elite+trainer+box&options%5Bprefix%5D=last",
    "https://www.cardverse.hu/termekkategoria/gyujtogetos-kartyajatekok/?_s=elite%20trainer%20box&_cat=gyujtogetos-kartyajatekok&_brand=pokemon-tcg&~1",
    "https://mythgames.eu/search?filter.p.product_type=Elite+Trainer+Box&options%5Bprefix%5D=last&options%5Bunavailable_products%5D=last&q=elite+trainer+box&sort_by=relevance&type=product",
    "https://cobracard.hu/?s=elite+trainber+box&post_type=product&dgwt_wcas=1"

    // "https://www.gemklub.hu/index.php?route=product%2Flist&description=0&keyword=elite+trainer+box",
    // "https://pokedom.hu/akcios-termekek-206/elite-trainer-boksz-268",
  ];
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const availableOnly = args.includes("--available-only") || args.includes("--in-stock-only");
  const pages = args.filter(arg => !arg.startsWith("--"));

  const urls = pages.length > 0 ? pages : getDefaultPages();

  checkPages(urls, { availableOnly }).then(results => {
    for (const { url, result } of results) {
      console.log(`\n${url}`);
      console.log(result);
    }
  });
}

module.exports = { checkStock, checkPages, getDefaultPages };
