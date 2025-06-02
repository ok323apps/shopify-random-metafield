const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Step 1: Allowed normalized colors
const allowedColors = [
  "White", "Green", "Blue", "Purple", "Pink", "Light Brown", "Dark Red"
];

// Step 2: Raw → Clean mapping
const colorNormalizationMap = {
  Oatmeal: "Light Brown",
  Beige: "Light Brown",
  Taupe: "Light Brown",
  Mocha: "Light Brown",
  Cocoa: "Light Brown",
  Blush: "Pink",
  Rose: "Pink",
  Berry: "Pink",
  Crimson: "Dark Red",
  Ruby: "Dark Red",
  Burgundy: "Dark Red",
  Sky: "Blue",
  Azure: "Blue",
  Sage: "Green",
  Olive: "Green",
  Mint: "Green",
  Emerald: "Green",
  Lilac: "Purple",
  Mauve: "Purple",
  Ivory: "White",
  Snow: "White",
  Pearl: "White"
};

// Base color for Airtable mapping
const colorMap = {
  White: "White", Green: "Green", Blue: "Blue",
  Purple: "Purple", Pink: "Red", "Light Brown": "Brown", "Dark Red": "Red"
};

// Normalize variant color values on creation
const normalizeVariantColors = async (product) => {
  const colorOptionIndex = product.options.findIndex(
    o => o.name.toLowerCase() === "color"
  );

  if (colorOptionIndex === -1) return;

  for (const variant of product.variants) {
    const originalColor = variant[`option${colorOptionIndex + 1}`];
    const normalized = colorNormalizationMap[originalColor] || originalColor;

    if (!allowedColors.includes(normalized)) continue;

    if (originalColor !== normalized) {
      try {
        await axios.put(
          `https://${process.env.SHOPIFY_SHOP}/admin/api/${process.env.API_VERSION}/variants/${variant.id}.json`,
          {
            variant: {
              id: variant.id,
              [`option${colorOptionIndex + 1}`]: normalized
            }
          },
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
              "Content-Type": "application/json"
            }
          }
        );
        console.log(`✅ Updated variant ${variant.id} from "${originalColor}" to "${normalized}"`);
      } catch (err) {
        console.error(`❌ Failed to update variant ${variant.id}:`, err.response?.data || err.message);
      }
    }
  }
};
