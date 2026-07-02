const express = require('express');
const path = require('path');
const app = express();

// Serve assets relatively
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Fallback for all other requests (SPA router support)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`Mockup Mirror running on http://localhost:${PORT}`);
});
