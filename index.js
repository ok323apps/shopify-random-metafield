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

app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;
  const productId = product.id;
  const variants = product.variants;
  const colorOptionIndex = product.options.findIndex(o => o.name.toLowerCase() === 'color');

  for (const variant of variants) {
    const originalColor = variant[`option${colorOptionIndex + 1}`]?.trim() || '';
    let baseColor = allowedColors.find(c => c.toLowerCase() === originalColor.toLowerCase());

    if (!baseColor) {
      const parts = originalColor.toLowerCase().split(/\s+/);
      for (const color of allowedColors) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(color)}!A:B?key=${GOOGLE_SHEETS_API_KEY}`;
        try {
          const response = await axios.get(url);
          const rows = response.data.values || [];
          const sheetWords = rows.map(r => r[1]?.toLowerCase().trim()).filter(Boolean);
          if (parts.some(part => sheetWords.includes(part))) {
            baseColor = color;
            break;
          }
        } catch (err) {
          console.warn(`❌ Error checking color match for ${color}:`, err.message);
        }
      }
    }

    if (baseColor && baseColor !== originalColor) {
      // Create a new variant with updated color
      const newVariant = {
        variant: {
          option1: colorOptionIndex === 0 ? baseColor : variant.option1,
          option2: colorOptionIndex === 1 ? baseColor : variant.option2,
          option3: colorOptionIndex === 2 ? baseColor : variant.option3,
          price: variant.price,
          sku: variant.sku,
          inventory_management: variant.inventory_management,
          inventory_policy: variant.inventory_policy,
          fulfillment_service: variant.fulfillment_service,
          requires_shipping: variant.requires_shipping,
          taxable: variant.taxable,
          barcode: variant.barcode,
          inventory_quantity: variant.inventory_quantity,
          weight: variant.weight,
          weight_unit: variant.weight_unit
        }
      };

      try {
        const created = await axios.post(
          `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/variants.json`,
          newVariant,
          {
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
              'Content-Type': 'application/json'
            }
          }
        );

        // Delete the old variant
        await axios.delete(
          `https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/variants/${variant.id}.json`,
          {
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN
            }
          }
        );

        console.log(`✅ Replaced variant ${variant.id} with corrected color '${baseColor}'`);
      } catch (err) {
        console.error(`❌ Failed to replace variant ${variant.id}:`, err.response?.data || err.message);
      }
    }
  }

  res.status(200).send('✅ Color normalization complete');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
