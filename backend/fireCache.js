const fs = require("fs");
const path = require("path");

const FIRE_CACHE_PATH = path.join(__dirname, "fireCache.json");

function saveFireDataToFile(data) {
    fs.writeFileSync(FIRE_CACHE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function loadFireDataFromFile() {
    try {
        if (!fs.existsSync(FIRE_CACHE_PATH)) {
            return null;
        }

        const fileContent = fs.readFileSync(FIRE_CACHE_PATH, "utf8").trim();
        if (!fileContent) {
            return null;
        }

        return JSON.parse(fileContent);
    } catch (error) {
        console.error("❌ Error reading fire cache:", error.message);
        return null;
    }
}

module.exports = { saveFireDataToFile, loadFireDataFromFile };
