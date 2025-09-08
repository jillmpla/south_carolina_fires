/* /backend/server.js */
const app = require("./api/fires");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Backend running locally on http://localhost:${PORT}`);
});
