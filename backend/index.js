const express = require('express');
const cors = require('cors');
// const fetch = require('node-fetch'); // npm install node-fetch

const app = express();
app.use(cors()); // Enable CORS for all routes

app.get('/api/news', async (req, res) => {
  try {
    const url = "https://newsapi.org/v2/top-headlines?country=in&category=business&apiKey=YOUR_API_KEY";
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
