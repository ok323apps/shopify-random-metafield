const express = require('express');
const axios = require('axios');
const ColorThief = require('colorthief');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

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

const getColorFromAirtable = async (tableName, rowNumber) => {
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

    return res.data.records[0]?.fields?.Color || null;
  } catch (err) {
    console.error(`Airtable fetch error for ${rowNumber}:`, err.response?.data || err.message);
    return null;
  }
};

app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;
  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  const featuredImageUrl = product?.images?.[0]?.src;
  const colorName = featuredImageUrl
    ? await getDominantColorName(featuredImageUrl)
    : "Unknown";

  const color1 = await getColorFromAirtable(colorName, random1);
  const color2 = await getColorFromAirtable(colorName, random2);

  const combinedNatureWords = [color1, color2].filter(Boolean).join(" ");

  try {
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

    res.status(200).send("Metafields updated with random colors and values.");
  } catch (err) {
    console.error("Shopify update error:", err.message);
    res.status(500).send("Failed to update Shopify metafields");
  }
});

app.get('/', (req, res) => {
  res.send('🎨 Shopify webhook with random color pairing is live!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
