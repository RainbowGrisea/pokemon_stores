const express = require("express");
const path = require("path");
const { checkPages, getDefaultPages } = require("./checkStore");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function parseLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;

  const statuses = ["In stock ✅", "Out of stock ❌", "Stock status unclear ⚠️"];
  const status = statuses.find((value) => trimmed.endsWith(` - ${value}`));

  if (!status) {
    return { title: trimmed, stock: null };
  }

  return {
    title: trimmed.slice(0, -(` - ${status}`).length).trim(),
    stock: status
  };
}

function normalizeUrls(inputUrls) {
  if (!Array.isArray(inputUrls)) return [];

  return inputUrls
    .map((url) => String(url || "").trim())
    .filter(Boolean);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/check", async (req, res) => {
  const urls = normalizeUrls(req.body?.urls);
  const availableOnly = Boolean(req.body?.availableOnly);

  if (urls.length === 0) {
    return res.status(400).json({ error: "Please provide at least one URL." });
  }

  try {
    const results = await checkPages(urls, { availableOnly });

    const formatted = results.map((entry) => {
      const lines = String(entry.result || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const items = lines
        .map(parseLine)
        .filter(Boolean)
        .filter((item) => item.stock !== null);

      const counts = {
        inStock: items.filter((item) => item.stock === "In stock ✅").length,
        outOfStock: items.filter((item) => item.stock === "Out of stock ❌").length,
        unclear: items.filter((item) => item.stock === "Stock status unclear ⚠️").length
      };

      return {
        url: entry.url,
        raw: entry.result,
        items,
        counts
      };
    });

    return res.json({
      checkedAt: new Date().toISOString(),
      availableOnly,
      results: formatted
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Unexpected server error"
    });
  }
});

app.post("/api/check-default", async (req, res) => {
  const availableOnly = Boolean(req.body?.availableOnly);

  try {
    const results = await checkPages(getDefaultPages(), { availableOnly });

    const formatted = results.map((entry) => {
      const lines = String(entry.result || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const items = lines
        .map(parseLine)
        .filter(Boolean)
        .filter((item) => item.stock !== null);

      const counts = {
        inStock: items.filter((item) => item.stock === "In stock ✅").length,
        outOfStock: items.filter((item) => item.stock === "Out of stock ❌").length,
        unclear: items.filter((item) => item.stock === "Stock status unclear ⚠️").length
      };

      return {
        url: entry.url,
        raw: entry.result,
        items,
        counts
      };
    });

    return res.json({
      checkedAt: new Date().toISOString(),
      availableOnly,
      results: formatted
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Unexpected server error"
    });
  }
});

app.use("/api", (_req, res) => {
  return res.status(404).json({ error: "API endpoint not found" });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Web app running on port ${PORT}`);
});
