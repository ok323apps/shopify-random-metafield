const express = require('express');
const axios = require('axios');
const ColorThief = require('colorthief');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Map descriptive color values to Airtable base colors
const colorMap = {
  Sage: "Green",
  Olive: "Green",
  Emerald: "Green",
  Mint: "Green",
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

// Try to find the 'Color' value from product options
const getColorFromVariantOption = (product) => {
  const colorOptionIndex = product.options.findIndex(
    o => o.name.toLowerCase() === "color"
  );

  if (colorOptionIndex === -1) return null;

  const variantWithImage = product.variants.find(v =>
    product.images.some(img => img.variant_ids?.includes(v.id))
  );

  const variant = variantWithImage || product.variants[0];
  const colorValue = variant[`option${colorOptionIndex + 1}`];

  return colorValue || null;
};

// Convert an RGB array into a base color name
const rgbToColorName = (rgb) => {
  const [r, g, b] = rgb;
  if (r > 180 && g < 100 && b < 100) return "Red";
  if (g > 180 && r < 120 && b < 120) return "Green";
  if (b > 180 && r < 120 && g < 120) return "Blue";
  if (r > 200 && g > 140 && b < 100) return "Orange";
  if (r > 220 && g > 220 && b > 220) return "White";
  if (r < 70 && g < 70 && b < 70) return "Black";
  if (r > 160 && g > 160 && b > 160) return "Gray";

  if (r > g && r > b) return "Red";
  if (g > r && g > b) return "Green";
  if (b > r && b > g) return "Blue";

  return "Other";
};

// Use ColorThief to detect color if variant option isn't available
const getDominantColorName = async (imageUrl) => {
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.buffer();
    const rgb = await ColorThief.getColor(buffer);
    return rgbToColorName(rgb);
  } catch (err) {
    console.error("ColorThief failed:", err.message);
    return "Other";
  }
};

// Fetch color word from Airtable using row number
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

// Main Shopify webhook handler
app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;

  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  let colorValue = getColorFromVariantOption(product);
  let baseColor = colorMap[colorValue] || null;

  // Fallback to image detection if color not found in variant
  if (!baseColor) {
    const imageUrl = product.images?.[0]?.src;
    baseColor = imageUrl ? await getDominantColorName(imageUrl) : "Other";
    colorValue = baseColor;
  }

  const color1 = await getColorFromAirtable(baseColor, random1);
  const color2 = await getColorFromAirtable(baseColor, random2);
  const combinedNatureWords = [color1, color2].filter(Boolean).join(" ");

  const metafields = [
    {
      namespace: "custom",
      key: "product_color",
      type: "single_line_text_field",
      value: baseColor
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

    res.status(200).send("Metafields updated based on variant or image color.");
  } catch (err) {
    console.error("Shopify metafield update error:", err.message);
    res.status(500).send("Failed to update metafields.");
  }
});

app.get('/', (req, res) => {
  res.send('🎨 Shopify color-detection webhook is running!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
