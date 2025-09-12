# 🌲South Carolina Fire Dashboard🔥

## Overview
The **South Carolina Fire Dashboard** is a real-time dashboard that monitors fire activity across South Carolina using NASA FIRMS data. It visualizes active fire locations, intensity (FRP), and other key details on an interactive map.

🚀 **Live Demo:** [South Carolina Fire Dashboard](https://southcarolinafires.com/)

---

## 🔧 Technologies Used

### **Frontend:**
- **React.js** – For building the interactive UI.
- **React-Leaflet (Leaflet)** – React map components powered by Leaflet.
- **OpenStreetMap tiles** – Base map layer provider.
- **Axios** – For making API requests.

### **Backend:**
- **Node.js & Express.js** – For handling API requests.
- **NASA FIRMS (Fire Information for Resource Management System)** provides satellite-based fire detection data from multiple Earth-observing satellites.  
    - Currently ingests VIIRS (Visible Infrared Imaging Radiometer Suite) data from **Suomi NPP (S-NPP)** and **NOAA-20** satellites.  
    - Each detection includes lat/long, brightness, UTC date/time, satellite & instrument, confidence, FRP, and day/night.
    - Data is spatially filtered to South Carolina, de-duplicated as needed, and kept in a rolling 48-hour window in Postgres (older rows are pruned automatically).

### **Database & Hosting:**
- **Supabase (PostgreSQL)** – Stores fire data, serves it via an API, and automatically prunes rows older than ~72 hours (keeping the latest 48 hours visible with a buffer).
- **Vercel** – Hosts both the backend (API) and frontend, with a daily cron job to fetch new data.

---

## 🌟 Features
- 🛰️ **NASA FIRMS integration** – Fetches satellite-detected fire data.
- 🔥 **Live fire monitoring** – Displays active fires in South Carolina.
- 🗺️ **Interactive Map** – Shows fire locations, intensity, and details.
- 📊 **Quick Stats sidebar** – Shows active fire counts.
- 🌓 **Light/Dark mode** – Accessible, high-contrast palette.
- 📱 **Adaptive layout** – Responsive grid; sidebar auto-sizes.
- ⚡ **Deployed on Vercel** – Ensures fast loading times and seamless updates.
- 🔄 **Daily refresh** - Vercel Cron fetches new detections once per day and prunes old rows.

---

## 🛠️ Getting Started

### **1️⃣ Clone the Repository**
```shell
git clone https://github.com/jillmpla/south_carolina_fires.git
cd south_carolina_fires
```
### **2️⃣ Install Dependencies**
For the backend:
```shell
cd backend
npm install
```
For the frontend:
```shell
cd ../frontend
npm install
```
### **3️⃣ Set Up Environment Variables**
Create a .env file inside the backend directory and add:
```shell
NASA_API_KEY=your_nasa_firms_api_key
DATABASE_URL=your_supabase_postgres_url
CRON_SECRET=your_long_random_secret
```
Create a .env file inside the frontend directory and add:
```shell
REACT_APP_API_URL=your_backend_deployment_url
```
### **4️⃣ Run Locally**
Start the backend:
```shell
cd backend
node server.js
```
Start the frontend:
```shell
cd ../frontend
npm start
```
## 📡 API Usage
The backend API serves fire data at:
```shell
GET /api/fires?hours=48&limit=500
```
Example response:
```shell
{
{
  "fires": [
    {
      "id": 8857,
      "latitude": 33.2795,
      "longitude": -80.4287,
      "brightness": 301.85,
      "confidence": "n",
      "acq_date": "2025-08-26",
      "acq_time": "0756",
      "satellite": "N20",
      "frp": 0.73,
      "daynight": "N",
      "acq_ts": "2025-08-26T07:56:00.000Z"
    }
  ],
  "count": 1,
  "meta": {
    "mode": "latest-available",
    "start_utc": "2025-08-24T07:56:00.000Z",
    "end_utc": "2025-08-26T07:56:00.000Z",
    "lookback_hours": 48
  }
}
```
To manually fetch and update fire data:
```shell
GET /api/update-fires?key=your_long_random_secret
```

## 📜 License
This project is licensed under the MIT License. See the [License](./LICENSE) file for details.

## If you find this project useful, consider giving it a star! ⭐
