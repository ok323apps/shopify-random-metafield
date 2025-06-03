const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const SHOPIFY_API_VERSION = process.env.API_VERSION;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

const GOOGLE_SHEETS_API_KEY = 'AIzaSyD7_3HUJKqp310MH9yKzpAFAaqo-ARsBqU';
const GOOGLE_SHEETS_ID = '1LhLXCMVF4oRufwBNDAlU-_OGq4GlBXaPIrQ8H1rTMV0';

const allowedColors = [
  "White", "Green", "Blue", "Purple", "Pink", "Brown",
  "Yellow", "Tan", "Gray", "Black", "Red", "Orange"
];

const fetchNatureWordFromGoogleSheets = async (color, row) => {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(color)}!A:B?key=${GOOGLE_SHEETS_API_KEY}`;
    const response = await axios.get(url);
    const rows = response.data.values || [];

    for (const r of rows) {
      if (r[0] && parseInt(r[0]) === row) {
        return r[1] || null;
      }
    }

    console.warn(`⚠️ No nature word found for row ${row} in ${color}`);
    return null;
  } catch (err) {
    console.error(`Google Sheets fetch error for ${row} in ${color}:`, err.response?.data || err.message);
    return null;
  }
};

const findBaseColor = async (originalColor) => {
  const parts = originalColor.toLowerCase().split(/\s+/);

  for (const color of allowedColors) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(color)}!A:B?key=${GOOGLE_SHEETS_API_KEY}`;
    try {
      const response = await axios.get(url);
      const rows = response.data.values || [];
      const sheetWords = rows.map(r => r[1]?.toLowerCase().trim()).filter(Boolean);

      if (parts.some(part => sheetWords.includes(part))) {
        return color;
      }
    } catch (err) {
      console.warn(`❌ Error checking color match for ${color}:`, err.message);
    }
  }

  return allowedColors.find(c => c.toLowerCase() === originalColor.toLowerCase()) || 'Other';
};

app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;
  const productId = product.id;

  const colorOptionIndex = product.options.findIndex(o => o.name.toLowerCase() === 'color');
  if (colorOptionIndex === -1) {
    console.warn("⚠️ No color option found in product");
    return res.status(400).send("No color option found");
  }

  const variant = product.variants[0];
  const originalColor = variant[`option${colorOptionIndex + 1}`]?.trim() || '';

  const baseColor = await findBaseColor(originalColor);

  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  const color1 = await fetchNatureWordFromGoogleSheets(baseColor, random1);
  const color2 = await fetchNatureWordFromGoogleSheets(baseColor, random2);
  const combinedNatureWords = [color1, color2].filter(Boolean).join(' ') || 'Unknown';

  console.log("🎨 Nature Words Lookup:", {
    baseColor,
    random1,
    random2,
    color1,
    color2
  });

  const metafields = [
    { namespace: 'custom', key: 'product_color', type: 'single_line_text_field', value: baseColor },
    { namespace: 'custom', key: 'random_number_1', type: 'single_line_text_field', value: String(random1) },
    { namespace: 'custom', key: 'random_number_2', type: 'single_line_text_field', value: String(random2) },
    { namespace: 'custom', key: 'nature_words', type: 'single_line_text_field', value: combinedNatureWords }
  ];

  try {
    // Create/update metafields
    for (const metafield of metafields) {
      try {
        await axios.post(
          `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/metafields.json`,
          { metafield },
          {
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (err) {
        console.warn(`⚠️ Could not update metafield '${metafield.key}':`, err.response?.data || err.message);
      }
    }

    // Update variant option value if it differs from baseColor
    if (originalColor.toLowerCase() !== baseColor.toLowerCase()) {
      try {
        // Update the variant's color option to baseColor
        await axios.put(
          `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/variants/${variant.id}.json`,
          {
            variant: {
              id: variant.id,
              [`option${colorOptionIndex + 1}`]: baseColor
            }
          },
          {
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
              'Content-Type': 'application/json'
            }
          }
        );

        // Fetch all variants to find duplicates with the originalColor
        const variantsRes = await axios.get(
          `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/variants.json`,
          {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN }
          }
        );

        const variants = variantsRes.data.variants;

        // Identify variants that still have the old originalColor option value
        const originalColorVariants = variants.filter(v =>
          v[`option${colorOptionIndex + 1}`]?.toLowerCase() === originalColor.toLowerCase()
        );

        // Delete each variant with the duplicate original color
        for (const v of originalColorVariants) {
          try {
            await axios.delete(
              `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/variants/${v.id}.json`,
              {
                headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN }
              }
            );
            console.log(`🗑️ Deleted variant ID ${v.id} with old color "${originalColor}"`);
          } catch (delErr) {
            console.warn(`⚠️ Failed to delete variant ID ${v.id}:`, delErr.response?.data || delErr.message);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Could not update variant color or delete duplicates:`, err.response?.data || err.message);
      }
    }

    res.status(200).send("✅ Product creation flow completed.");
  } catch (err) {
    console.error("❌ Product creation error:", err.message);
    res.status(500).send("❌ Product creation failed.");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
