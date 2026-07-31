const axios = require('axios');

async function sendAlert(message) {
  try {
    const phone = process.env.WHATSAPP_PHONE;
    const apikey = process.env.WHATSAPP_CALLMEBOT_APIKEY;
    
    if (!phone || !apikey) {
      console.log('CallMeBot config missing. Alert would be:', message);
      return;
    }

    const encodedMsg = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMsg}&apikey=${apikey}`;
    
    await axios.get(url);
    console.log(`Alert sent: ${message}`);
  } catch (error) {
    console.error(`Failed to send alert: ${message}`, error.message);
    // Silent fail
  }
}

module.exports = { sendAlert };
