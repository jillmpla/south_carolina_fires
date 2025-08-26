# 🌲South Carolina Wildfire Dashboard🔥

## Overview
The **South Carolina Wildfire Dashboard** is a real-time web application that monitors wildfire activity across South Carolina. It fetches and displays fire data using **NASA FIRMS** (Fire Information for Resource Management System), allowing users to visualize fire locations, intensity, and other key details on an interactive map.

🚀 **Live Demo:** [South Carolina Wildfire Dashboard](https://southcarolinafires.com/)

---

## 🔧 Technologies Used

### **Frontend:**
- **React.js** – For building the interactive UI.
- **Leaflet.js** – For rendering fire markers on the map.
- **Axios** – For making API requests.

### **Backend:**
- **Node.js & Express.js** – For handling API requests.
- **NASA FIRMS (Fire Information for Resource Management System)** provides satellite-based fire detection data from multiple Earth-observing satellites.  
    - Currently ingests VIIRS (Visible Infrared Imaging Radiometer Suite) data from **Suomi NPP (S-NPP)** and **NOAA-20** satellites.  
    - Each detection includes coordinates, brightness temperature, confidence level, acquisition date/time, satellite source, Fire Radiative Power (FRP), and day/night flag.  
    - Data is spatially filtered to **South Carolina**, de-duplicated across satellites, and stored historically in a Postgres database.

### **Database & Hosting:**
- **Supabase (PostgreSQL)** – Stores fire data and serves it via an API.
- **Vercel** – Hosts both the backend (API) and frontend.
- **UptimeRobot** – Ensures the backend fetches fresh fire data every 24 hours.

---

## 🌟 Features
🔥 **Live wildfire monitoring** – Displays active fires in South Carolina.  
🛰️ **NASA FIRMS integration** – Fetches satellite-detected fire data.  
🗺️ **Interactive Map** – Shows fire locations, intensity, and details.  
🔄 **Automated Backend Updates** – Fetches new data daily and updates Supabase.  
⚡ **Deployed on Vercel** – Ensures fast loading times and seamless updates.

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
cd frontend
npm install
```
### **3️⃣ Set Up Environment Variables**
Create a .env file inside the backend directory and add:
```shell
NASA_API_KEY=your_nasa_firms_api_key
DATABASE_URL=your_supabase_postgres_url
```
Create a .env file inside the frontend directory and add:
```shell
REACT_APP_API_URL=your_backend_deployment_url
```
### **4️⃣ Run Locally**
Start the backend:
```shell
cd backend
node api/fires.js
```
Start the frontend:
```shell
cd frontend
npm start
```
## 📡 API Usage
The backend API serves fire data at:
```shell
GET /api/fires
```
Example response:
```shell
{
  "fires": [
    {
      "id": 2718,
      "latitude": 34.7839,
      "longitude": -83.1262,
      "brightness": 307.43,
      "confidence": "n",
      "acq_date": "2025-03-04",
      "acq_time": "711",
      "satellite": "N",
      "frp": 1.41,
      "daynight": "Nighttime"
    }
  ]
}
```
To manually fetch and update fire data, visit:
```shell
GET /api/update-fires
```

## 📜 License
This project is licensed under the MIT License. See the [License](./LICENSE) file for details.

## If you find this project useful, consider giving it a star! ⭐
