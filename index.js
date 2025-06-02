const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const allowedColors = [
  "White", "Green", "Blue", "Purple", "Pink",
  "Brown", "Red", "Yellow", "Tan", "Gray", "Black", "Orange"
];

// Utility to detect base color from variant name
function detectBaseColorFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const color of allowedColors) {
    if (lower.includes(color.toLowerCase())) {
      return color;
    }
  }
  return null;
}

// Get nature word from Google Sheets based on tab and row
const getNatureWordFromSheet = async (colorTab, rowNumber) => {
  try {
    const res = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEETS_ID}/values/${encodeURIComponent(colorTab)}!A1:Z1000?key=${process.env.GOOGLE_API_KEY}`
    );
    const rows = res.data.values || [];
    const row = rows.find(r => r[0] && r[0].toString().trim() === rowNumber.toString());
    return row ? row[1] : null;
  } catch (err) {
    console.error(`Google Sheets fetch error for ${rowNumber} in ${colorTab}:`, err.response?.data || err.message);
    return null;
  }
};

// Normalize color and update Shopify variant if needed
const normalizeVariantColors = async (product) => {
  const colorOptionIndex = product.options.findIndex(o => o.name.toLowerCase() === "color");
  if (colorOptionIndex === -1) return null;

  let baseColor = null;

  for (const variant of product.variants) {
    const colorVal = variant[`option${colorOptionIndex + 1}`];
    const detectedColor = detectBaseColorFromText(colorVal);
    if (detectedColor && colorVal !== detectedColor) {
      try {
        await axios.put(
          `https://${process.env.SHOPIFY_SHOP}/admin/api/${process.env.API_VERSION}/variants/${variant.id}.json`,
          {
            variant: {
              id: variant.id,
              [`option${colorOptionIndex + 1}`]: detectedColor
            }
          },
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
              "Content-Type": "application/json"
            }
          }
        );
        console.log(`✅ Updated variant ${variant.id} to "${detectedColor}"`);
      } catch (err) {
        console.error(`❌ Failed to update variant ${variant.id}:`, err.response?.data || err.message);
      }
    }
    baseColor = detectedColor || baseColor;
  }

  return baseColor;
};

app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;

  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  const baseColor = await normalizeVariantColors(product);
  const tabName = baseColor || "Other";

  const color1 = await getNatureWordFromSheet(tabName, random1);
  const color2 = await getNatureWordFromSheet(tabName, random2);

  const combinedNatureWords = [color1, color2].filter(Boolean).join(" ") || "Unknown";

  console.log("🎨 Nature Words Lookup:", { baseColor: tabName, random1, random2, color1, color2 });

  const metafields = [
    { namespace: "custom", key: "product_color", type: "single_line_text_field", value: baseColor || "Other" },
    { namespace: "custom", key: "random_number_1", type: "single_line_text_field", value: String(random1) },
    { namespace: "custom", key: "random_number_2", type: "single_line_text_field", value: String(random2) },
    { namespace: "custom", key: "nature_words", type: "single_line_text_field", value: combinedNatureWords }
  ];

  try {
    for (const metafield of metafields) {
      await axios.post(
        `https://${process.env.SHOPIFY_SHOP}/admin/api/${process.env.API_VERSION}/products/${product.id}/metafields.json`,
        { metafield },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );
    }
    res.status(200).send("✅ Metafields and variant colors updated.");
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
