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

const updateProductTitleAndHandle = async (productId, values) => {
  const title = `${values.nature_words} ${values.gender} ${values.material_multi} ${values.style}`.trim().replace(/\s+/g, ' ');
  const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  console.log(`📝 Generated Title: "${title}"`);
  console.log(`🔗 Generated Handle: "${handle}"`);

  try {
    await axios.put(
      `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}.json`,
      {
        product: {
          id: productId,
          title,
          handle
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Product title and handle updated`);
  } catch (err) {
    console.error("❌ Failed to update product title/handle:", err.response?.data || err.message);
  }
};

app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;
  const productId = product.id;

  const colorOptionIndex = product.options.findIndex(o => o.name.toLowerCase() === 'color');
  const variant = product.variants[0];
  const originalColor = variant[`option${colorOptionIndex + 1}`]?.toLowerCase() || '';

  let baseColor = 'Other';

  for (const color of allowedColors) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(color)}!A:B?key=${GOOGLE_SHEETS_API_KEY}`;
    try {
      const response = await axios.get(url);
      const rows = response.data.values || [];
      const match = rows.some(r => r[1]?.toLowerCase() === originalColor);
      if (match) {
        baseColor = color;
        break;
      }
    } catch (err) {
      console.warn(`❌ Error checking color match for ${color}:`, err.message);
    }
  }

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

  const gender = product.metafields?.custom?.gender?.value || '';
  const materialMulti = product.metafields?.custom?.material_multi?.value || '';
  const style = product.metafields?.custom?.style?.value || '';

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

    await updateProductTitleAndHandle(productId, {
      nature_words: combinedNatureWords,
      gender,
      material_multi: materialMulti,
      style
    });

    res.status(200).send("✅ Product creation flow completed.");
  } catch (err) {
    console.error("❌ Product creation error:", err.message);
    res.status(500).send("❌ Product creation failed.");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
