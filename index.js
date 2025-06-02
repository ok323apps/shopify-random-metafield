const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const allowedColors = [
  "White", "Green", "Blue", "Purple", "Pink", "Tan", "Gray", "Black", "Red", "Yellow", "Orange", "Brown"
];

const colorNormalizationMap = {
  Oatmeal: "Tan", Beige: "Tan", Taupe: "Tan", Mocha: "Brown", Cocoa: "Brown",
  Blush: "Pink", "Blush Pink": "Pink", Rose: "Pink", Berry: "Pink",
  Crimson: "Red", Ruby: "Red", Burgundy: "Red", Maroon: "Red",
  Sky: "Blue", Azure: "Blue", Navy: "Blue", Denim: "Blue",
  Sage: "Green", Olive: "Green", Mint: "Green", Emerald: "Green",
  Lilac: "Purple", Mauve: "Purple", Lavender: "Purple",
  Ivory: "White", Snow: "White", Pearl: "White", OffWhite: "White", "OFF WHITE": "White",
  Lemon: "Yellow", Gold: "Yellow", Mustard: "Yellow",
  Slate: "Gray", Charcoal: "Gray", Ash: "Gray", Silver: "Gray",
  Jet: "Black", Coal: "Black",
  Coral: "Orange", Apricot: "Orange", Tangerine: "Orange"
};

const normalizeVariantColors = async (product) => {
  const colorOptionIndex = product.options.findIndex(
    o => o.name.toLowerCase() === "color"
  );
  if (colorOptionIndex === -1) return;

  for (const variant of product.variants) {
    const originalColor = variant[`option${colorOptionIndex + 1}`];
    if (!originalColor) continue;

    const normalized = colorNormalizationMap[originalColor.trim()] || 
      Object.keys(colorNormalizationMap).find(key =>
        originalColor.toLowerCase().includes(key.toLowerCase())
      )?.replace(/_/g, ' ') || originalColor;

    const finalColor = allowedColors.includes(normalized) ? normalized : originalColor;

    try {
      await axios.put(
        `https://${process.env.SHOPIFY_SHOP}/admin/api/${process.env.API_VERSION}/variants/${variant.id}.json`,
        {
          variant: {
            id: variant.id,
            [`option${colorOptionIndex + 1}`]: finalColor
          }
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );
      console.log(`✅ Updated variant ${variant.id} to "${finalColor}"`);
    } catch (err) {
      console.error(`❌ Failed to update variant ${variant.id}:`, err.response?.data || err.message);
    }
  }
};

const getColorFromGitHub = async (baseColor, rowNumber) => {
  try {
    const res = await axios.get("https://raw.githubusercontent.com/ok323apps/shopify-metafield-app/main/colors.json");
    const colors = res.data;
    return colors?.[baseColor]?.[rowNumber] || null;
  } catch (err) {
    console.error("GitHub fetch error:", err.message);
    return null;
  }
};

app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;

  await normalizeVariantColors(product);

  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  const colorOptionIndex = product.options.findIndex(o => o.name.toLowerCase() === "color");
  const variant = product.variants[0];
  const rawColor = variant[`option${colorOptionIndex + 1}`];
  let baseColor = allowedColors.find(c =>
    rawColor?.toLowerCase().includes(c.toLowerCase())
  ) || "Other";

  const color1 = await getColorFromGitHub(baseColor, random1);
  const color2 = await getColorFromGitHub(baseColor, random2);
  const combinedNatureWords = [color1, color2].filter(Boolean).join(" ") || "Unknown";

  const metafields = [
    { namespace: "custom", key: "product_color", type: "single_line_text_field", value: baseColor },
    { namespace: "custom", key: "random_number_1", type: "single_line_text_field", value: String(random1) },
    { namespace: "custom", key: "random_number_2", type: "single_line_text_field", value: String(random2) },
    { namespace: "custom", key: "nature_words", type: "single_line_text_field", value: combinedNatureWords }
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
    res.status(200).send("✅ Metafields and variant colors updated.");
  } catch (err) {
    console.error("Shopify metafield update error:", err.message);
    res.status(500).send("Failed to update metafields.");
  }
});

app.get('/', (req, res) => {
  res.send('✅ Shopify Metafield Webhook is Live!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
