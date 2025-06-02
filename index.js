const express = require('express');
const axios = require('axios');
const ColorThief = require('colorthief');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🎨 Convert RGB to a basic color name
const rgbToColorName = (rgb) => {
  const [r, g, b] = rgb;

  if (r > 200 && g < 100 && b < 100) return "Red";
  if (g > 200 && r < 100 && b < 100) return "Green";
  if (b > 200 && r < 100 && g < 100) return "Blue";
  if (r > 200 && g > 150 && b < 100) return "Orange";
  if (r > 240 && g > 240 && b > 240) return "White";
  if (r < 50 && g < 50 && b < 50) return "Black";
  if (r > 200 && g > 200 && b > 200) return "Gray";

  return "Other";
};

// 🖼️ Get dominant color name from image URL
const getDominantColorName = async (imageUrl) => {
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.buffer();
    const rgb = await ColorThief.getColor(buffer);
    return rgbToColorName(rgb);
  } catch (err) {
    console.error("Color detection failed:", err.message);
    return "Unknown";
  }
};

// 📄 Get eco_fabric value from Airtable
const getAirtableValue = async (tableName, rowNumber) => {
  try {
    const res = await axios.get(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`, {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`
      },
      params: {
        maxRecords: 1,
        filterByFormula: `{Row} = ${rowNumber}`
      }
    });

    return res.data.records[0]?.fields?.eco_fabric || null;
  } catch (err) {
    console.error("Airtable fetch error:", err.response?.data || err.message);
    return null;
  }
};

// 🚀 Shopify Webhook Handler
app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;

  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  const featuredImageUrl = product?.images?.[0]?.src;
  const colorName = featuredImageUrl
    ? await getDominantColorName(featuredImageUrl)
    : "Unknown";

  try {
    // Step 1: Update Shopify with detected product_color
    await axios.post(
      `https://${process.env.SHOPIFY_SHOP}/admin/api/${process.env.API_VERSION}/products/${product.id}/metafields.json`,
      {
        metafield: {
          namespace: "custom",
          key: "product_color",
          type: "single_line_text_field",
          value: colorName
        }
      },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    // Step 2: Get eco_fabric from Airtable based on colorName + random1
    const ecoFabric = await getAirtableValue(colorName, random1);

    // Step 3: Build metafields payload
    const metafields = [
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
      }
    ];

    if (ecoFabric) {
      metafields.push({
        namespace: "custom",
        key: "material_detail",
        type: "single_line_text_field",
        value: ecoFabric
      });
    }

    // Step 4: Post each metafield
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

    res.status(200).send("Metafields updated with color and random values.");
  } catch (err) {
    console.error("Shopify update error:", err.message);
    res.status(500).send("Failed to update Shopify metafields");
  }
});

app.get('/', (req, res) => {
  res.send('🎨 Shopify color + metafield automation is live!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
