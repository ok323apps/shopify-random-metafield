const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Descriptive → base color mapping
const colorMap = {
  Sage: "Green", Olive: "Green", Emerald: "Green", Mint: "Green", Forest: "Green",
  Navy: "Blue", Sky: "Blue", Azure: "Blue", Denim: "Blue", Indigo: "Blue",
  Charcoal: "Gray", Silver: "Gray", Ash: "Gray", Slate: "Gray",
  Ivory: "White", Snow: "White", Pearl: "White",
  Sand: "Brown", Mocha: "Brown", Cocoa: "Brown", Caramel: "Brown",
  Rose: "Red", Berry: "Red", Crimson: "Red", Ruby: "Red",
  Coral: "Orange", Peach: "Orange", Tangerine: "Orange", Amber: "Orange",
  Lemon: "Yellow", Gold: "Yellow", Mustard: "Yellow",
  Black: "Black", White: "White", Gray: "Gray", Brown: "Brown",
  Red: "Red", Blue: "Blue", Green: "Green", Orange: "Orange", Yellow: "Yellow"
};

// Get color from Shopify variant options
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

// Fallback to Imagga API if no variant color is detected
const getColorFromImagga = async (imageUrl) => {
  const apiKey = "acc_d8ec2c08e6811bf";
  const apiSecret = "9cd900bcc3dce192f34dfc49db174b16";
  const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  try {
    const response = await axios.get(
      `https://api.imagga.com/v2/colors?image_url=${encodeURIComponent(imageUrl)}`,
      {
        headers: { Authorization: `Basic ${encoded}` }
      }
    );

    const tags = response.data.result.colors.image_colors;
    const firstTag = tags?.[0]?.closest_palette_color_parent;
    return firstTag || "Other";
  } catch (err) {
    console.error("Imagga color detection error:", err.response?.data || err.message);
    return "Other";
  }
};

// Get color name from Airtable based on base color and row #
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

// Main webhook handler
app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;

  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  let colorValue = getColorFromVariantOption(product);
  let baseColor = colorMap[colorValue] || null;

  if (!baseColor && product.images?.[0]?.src) {
    const fallbackColor = await getColorFromImagga(product.images[0].src);
    baseColor = colorMap[fallbackColor] || fallbackColor;
    colorValue = fallbackColor;
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

    res.status(200).send("Metafields updated.");
  } catch (err) {
    console.error("Shopify metafield update error:", err.message);
    res.status(500).send("Failed to update metafields.");
  }
});

app.get('/', (req, res) => {
  res.send('✅ Shopify Color Webhook with Imagga is Live!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
