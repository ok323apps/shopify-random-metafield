const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const GOOGLE_SHEETS_API_KEY = "AIzaSyD7_3HUJKqp310MH9yKzpAFAaqo-ARsBqU";
const GOOGLE_SHEETS_ID = "1LhLXCMVF4oRufwBNDAlU-_OGq4GlBXaPIrQ8H1rTMV0";

// Allowed colors (same as sheet tab names)
const allowedColors = [
  "White", "Green", "Blue", "Purple", "Pink", "Brown",
  "Yellow", "Tan", "Gray", "Black", "Red", "Orange"
];

const getSheetData = async (tabName) => {
  try {
    const url = \`https://sheets.googleapis.com/v4/spreadsheets/\${GOOGLE_SHEETS_ID}/values/\${tabName}!A1:B1000?key=\${GOOGLE_SHEETS_API_KEY}\`;
    const response = await axios.get(url);
    const rows = response.data.values || [];
    const map = {};
    rows.forEach(([rowNum, word]) => {
      if (word) map[word.trim().toLowerCase()] = tabName;
    });
    return map;
  } catch (err) {
    console.error(\`❌ Failed to fetch \${tabName} tab:\`, err.response?.data || err.message);
    return {};
  }
};

const buildColorLookup = async () => {
  const masterMap = {};
  for (const color of allowedColors) {
    const sheetMap = await getSheetData(color);
    Object.assign(masterMap, sheetMap);
  }
  return masterMap;
};

const getNatureWord = async (tab, row) => {
  try {
    const url = \`https://sheets.googleapis.com/v4/spreadsheets/\${GOOGLE_SHEETS_ID}/values/\${tab}!A1:B1000?key=\${GOOGLE_SHEETS_API_KEY}\`;
    const res = await axios.get(url);
    const values = res.data.values || [];
    const match = values.find(([a]) => parseInt(a) === row);
    return match ? match[1] : null;
  } catch (err) {
    console.error(\`Google Sheets fetch error for \${row} in \${tab}:\`, err.response?.data || err.message);
    return null;
  }
};

const normalizeColor = async (original) => {
  const colorMap = await buildColorLookup();
  const words = original.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const word of words) {
    if (colorMap[word]) return colorMap[word];
  }
  return null;
};

const normalizeVariantColors = async (product) => {
  const colorOptionIndex = product.options.findIndex(
    o => o.name.toLowerCase() === "color"
  );
  if (colorOptionIndex === -1) return null;

  let finalBaseColor = null;

  for (const variant of product.variants) {
    const originalColor = variant[\`option\${colorOptionIndex + 1}\`];
    const normalized = await normalizeColor(originalColor);
    if (!normalized) {
      console.warn(\`⚠️ No match found for \${originalColor}, assigning "Other"\`);
      finalBaseColor = "Other";
      continue;
    }
    finalBaseColor = normalized;

    if (originalColor !== normalized) {
      try {
        await axios.put(
          \`https://\${process.env.SHOPIFY_SHOP}/admin/api/\${process.env.API_VERSION}/variants/\${variant.id}.json\`,
          {
            variant: {
              id: variant.id,
              [\`option\${colorOptionIndex + 1}\`]: normalized
            }
          },
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
              "Content-Type": "application/json"
            }
          }
        );
        console.log(\`✅ Updated variant \${variant.id} to "\${normalized}"\`);
      } catch (err) {
        console.error(\`❌ Failed to update variant \${variant.id}:\`, err.response?.data || err.message);
      }
    }
  }

  return finalBaseColor;
};

app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;

  const baseColor = await normalizeVariantColors(product);
  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  let color1 = null, color2 = null, combinedNatureWords = "Unknown";

  if (allowedColors.includes(baseColor)) {
    color1 = await getNatureWord(baseColor, random1);
    color2 = await getNatureWord(baseColor, random2);
    combinedNatureWords = [color1, color2].filter(Boolean).join(" ") || "Unknown";
  }

  console.log("🎨 Nature Words Lookup:", { baseColor, random1, random2, color1, color2 });

  const metafields = [
    { namespace: "custom", key: "product_color", type: "single_line_text_field", value: baseColor || "Other" },
    { namespace: "custom", key: "random_number_1", type: "single_line_text_field", value: String(random1) },
    { namespace: "custom", key: "random_number_2", type: "single_line_text_field", value: String(random2) },
    { namespace: "custom", key: "nature_words", type: "single_line_text_field", value: combinedNatureWords }
  ];

  try {
    for (const metafield of metafields) {
      await axios.post(
        \`https://\${process.env.SHOPIFY_SHOP}/admin/api/\${process.env.API_VERSION}/products/\${product.id}/metafields.json\`,
        { metafield },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );
    }
    res.status(200).send("✅ Metafields and colors updated.");
  } catch (err) {
    console.error("Shopify metafield update error:", err.response?.data || err.message);
    res.status(500).send("❌ Failed to update metafields.");
  }
});

app.get('/', (req, res) => {
  res.send('✅ Shopify Color Normalizer Webhook is Live!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
