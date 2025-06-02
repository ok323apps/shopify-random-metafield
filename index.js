const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const getAirtableValue = async (rowNumber) => {
  try {
    const res = await axios.get(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_NAME}`, {
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

app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;
  const randomNumber = Math.floor(Math.random() * 100) + 1;
  const ecoFabric = await getAirtableValue(randomNumber);

  try {
    // Save the random number first
    await axios.post(
      `https://${process.env.SHOPIFY_SHOP}/admin/api/${process.env.API_VERSION}/products/${product.id}/metafields.json`,
      {
        metafield: {
          namespace: "custom",
          key: "random_number",
          type: "number_integer",
          value: randomNumber
        }
      },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    // Then save the Airtable-based metafield
    if (ecoFabric) {
      await axios.post(
        `https://${process.env.SHOPIFY_SHOP}/admin/api/${process.env.API_VERSION}/products/${product.id}/metafields.json`,
        {
          metafield: {
            namespace: "custom",
            key: "material_detail",
            type: "single_line_text_field",
            value: ecoFabric
          }
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );
    }

    res.status(200).send("Metafields updated");
  } catch (err) {
    console.error("Shopify metafield error:", err.response?.data || err.message);
    res.status(500).send("Error updating metafields");
  }
});

app.get('/', (req, res) => {
  res.send('Shopify metafield updater is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
