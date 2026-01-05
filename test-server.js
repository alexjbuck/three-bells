// Simple test server for local development
require("dotenv").config();
const app = require("./api/index.js");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
