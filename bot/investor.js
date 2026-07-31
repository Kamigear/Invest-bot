const axios = require('axios');

async function executeInvest(entry) {
  try {
    const baseUrl = process.env.GAME_API_BASE_URL;
    const token = process.env.GAME_API_TOKEN;

    const response = await axios.post(`${baseUrl}/invest`, {
      amount: entry.amount
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 15000
    });

    return { success: true, data: response.data, error: null };
  } catch (error) {
    let errorMsg = error.message;
    if (error.response) {
      errorMsg = `Status ${error.response.status}: ${JSON.stringify(error.response.data)}`;
    }
    return { success: false, data: null, error: errorMsg };
  }
}

module.exports = { executeInvest };
