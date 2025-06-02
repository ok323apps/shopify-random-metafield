const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🔧 Get value from Airtable row based on dynamic table
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

// 📦 Webhook route for Shopify product creation
app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;

  const random1 = Math.floor(Math.random() * 100) + 1;
  const random2 = Math.floor(Math.random() * 100) + 1;

  let tableName;

  try {
    // STEP 1: Read metafields to get color_family
    const metafieldsRes = await axios.get(
      `https://${process.env.SHOPIFY_SHOP}/admin/api/${process.env.API_VERSION}/products/${product.id}/metafields.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN
        }
      }
    );

    const colorMetafield = metafieldsRes.data.metafields.find(
      mf => mf.namespace === 'custom' && mf.key === 'color_family'
    );

    if (!colorMetafield) {
      throw new Error("Missing metafield: custom.color_family");
    }

    tableName = colorMetafield.value.trim();
  } catch (err) {
    console.error("Error fetching color_family metafield:", err.message);
    return res.status(400).send("Missing or invalid color_family metafield");
  }

  try {
    // STEP 2: Write both random numbers to Shopify metafields
    const metafieldPayloads = [
      {
        namespace: "custom",
        key: "random_number_1",
        type: "number_integer",
        value: random1
      },
      {
        namespace: "custom",
        key: "random_number_2",
        type: "number_integer",
        value: random2
      }
    ];

    for (const metafield of metafieldPayloads) {
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

    res.status(200).send("Random number metafields added");
  } catch (err) {
    console.error("Shopify metafield error:", err.message);
    res.status(500).send("Failed to update metafields");
  }
});

// ✅ Simple homepage route
app.get('/', (req, res) => {
  res.send('✅ Shopify random number metafield updater is running.');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
