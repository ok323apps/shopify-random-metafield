const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Map of descriptive color names to base Airtable table colors
const colorMap = {
  Sage: "Green",
  Olive: "Green",
  Emerald: "Green",
  Mint: "Green",
  Forest: "Green",
  Navy: "Blue",
  Sky: "Blue",
  Azure: "Blue",
  Denim: "Blue",
  Charcoal: "Gray",
  Silver: "Gray",
  Ash: "Gray",
  Ivory: "White",
  Snow: "White",
  Pearl: "White",
  Sand: "Brown",
  Mocha: "Brown",
  Cocoa: "Brown",
  Rose: "Red",
  Berry: "Red",
  Crimson: "Red",
  Coral: "Orange",
  Peach: "Orange",
  Tangerine: "Orange",
  Lemon: "Yellow",
  Gold: "Yellow",
  Mustard: "Yellow",
  Black: "Black",
  White: "White",
  Gray: "Gray",
  Brown: "Brown",
  Red: "Red",
  Blue: "Blue",
  Green: "Green",
  Orange: "Orange",
  Yellow: "Yellow"
};

// Extract a base color from the product title
const getColorFromTitle = (title) => {
  const words = title.split(/\s+/);
  for (const word of words) {
    const cleaned = word.replace(/[^\w]/g, '').toLowerCase();
    for (const [keyword, baseColor] of Object.entries(colorMap)) {
      if (cleaned.includes(keyword.toLowerCase())) {
        return baseColor;
      }
    }
  }
  return "Other"; // fallback if no match found
};

// Airtable fetch based on base color table and row number
const getColorFromAirtable = async (tableName, rowNumber) => {
  try {
    const res = await axios.get(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`
        },
        params: {
          maxRecords: 1,
          filterByFormula: `{Row} = ${rowNumber}`
        }
      }
    );
    return res.data.records[0]?.fields?.Color || null;
  } catch (err) {
    console.error(`Airtable fetch error for ${rowNumber} in table ${tableName}:`, err.response?.data || err.message);
    return null;
  }
};

// Shopify Webhook Handler
app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;

  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  const colorName = getColorFromTitle(product.title);
  console.log("Detected color from title:", colorName);

  const color1 = await getColorFromAirtable(colorName, random1);
  const color2 = await getColorFromAirtable(colorName, random2);
  const combinedNatureWords = [color1, color2].filter(Boolean).join(" ");

  const metafields = [
    {
      namespace: "custom",
      key: "product_color",
      type: "single_line_text_field",
      value: colorName
    },
    {
      namespace: "custom",
      key: "random_number_1",
      type: "single_line_text_field",
      value: String(random1)
    },
    {
      namespace: "custom",
      key: "random_number_2",
      type: "single_line_text_field",
      value: String(random2)
    },
    {
      namespace: "custom",
      key: "nature_words",
      type: "single_line_text_field",
      value: combinedNatureWords || "Unknown"
    }
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

    res.status(200).send("Metafields written from title-based color detection.");
  } catch (err) {
    console.error("Shopify update error:", err.message);
    res.status(500).send("Failed to update Shopify metafields");
  }
});

app.get('/', (req, res) => {
  res.send('🎨 Shopify metafield service is live and reading product titles!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
