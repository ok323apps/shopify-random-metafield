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

    // Update variant option value if needed
    if (originalColor.toLowerCase() !== baseColor.toLowerCase()) {
      try {
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
      } catch (err) {
        console.warn(`⚠️ Could not update variant color to '${baseColor}':`, err.response?.data || err.message);
      }

      try {
        const variantsRes = await axios.get(
          `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/variants.json`,
          {
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN
            }
          }
        );

        const allOptionValues = {};
        product.options.forEach(opt => {
          allOptionValues[opt.name] = new Set();
        });

        variantsRes.data.variants.forEach(v => {
          product.options.forEach((opt, index) => {
            const val = v[`option${index + 1}`];
            if (val) allOptionValues[opt.name].add(val);
          });
        });

        const cleanedOptions = product.options.map((opt, index) => {
          if (index === colorOptionIndex) {
            return {
              name: opt.name,
              position: index + 1,
              values: Array.from(allOptionValues[opt.name])
            };
          } else {
            return opt;
          }
        });

        await axios.put(
          `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}.json`,
          {
            product: {
              id: productId,
              options: cleanedOptions
            }
          },
          {
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (err) {
        console.warn("⚠️ Could not clean up color options:", err.response?.data || err.message);
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
