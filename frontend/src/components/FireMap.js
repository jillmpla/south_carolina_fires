import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from "react-leaflet";
import L from "leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";
import fireHighIconSrc from "./fire-high.svg";

const API_URL = process.env.REACT_APP_API_URL;

const southCarolinaBounds = [
    [31.5, -84], //Southwest
    [35.8, -78]  //Northeast
];

//Fire Icon (FRP > 5)
const highRiskFireIcon = new L.Icon({
    iconUrl: fireHighIconSrc,
    iconSize: [30, 30]
});

const FireMap = () => {
    const [fires, setFires] = useState([]);
    const [borderData, setBorderData] = useState(null);

    useEffect(() => {
        //Fetch fire data from the deployed API
        axios.get(`${API_URL}/api/fires`.replace(/([^:]\/)\/+/g, "$1"))
            .then(response => {
                //Filter fires where FRP > 10
                const highRiskFires = response.data.fires.filter(fire => fire.frp > 10);
                setFires(highRiskFires);
            })
            .catch(error => console.error("🚨 Error fetching fire data:", error));

        //Fetch South Carolina border GeoJSON
        fetch("/southCarolinaBorder.geojson")
            .then(response => response.json())
            .then(data => setBorderData(data))
            .catch(error => console.error("🚨 Error fetching border data:", error));
    }, []);

    return (
        <MapContainer
            center={[33.8361, -81.1637]}
            zoom={7}
            minZoom={6}
            maxZoom={15}
            style={{ height: "100vh", width: "100%" }}
            maxBounds={southCarolinaBounds}
            maxBoundsViscosity={0.8}
        >
            {/* Base Map */}
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            {/* South Carolina Border Outline */}
            {borderData && (
                <GeoJSON
                    data={borderData}
                    style={() => ({
                        color: "#000000",
                        weight: 3,
                        fillOpacity: 0
                    })}
                />
            )}

            {/*Moderate to High-Risk Fire Markers */}
            {fires.map((fire, index) => (
                <Marker
                    key={index}
                    position={[fire.latitude, fire.longitude]}
                    icon={highRiskFireIcon}
                >
                    <Popup>
                        <strong style={{ fontSize: "1.2em" }}>🔥 <span style={{ color: "#994C00" }}>Moderate</span> to<span style={{color: "#600000"}}> High-Risk</span> Fire</strong><br/>
                        <strong style={{color: "#b22222"}}>Fire Radiative Power (FRP):</strong> {fire.frp ? `${fire.frp} MW` : "Unknown"}<br/>
                        <strong>Latitude:</strong> {fire.latitude} <br/>
                        <strong>Longitude:</strong> {fire.longitude} <br/>
                        <strong>Brightness Temperature:</strong> {fire.brightness} Kelvin (K)<br/>
                        <strong>Detection Certainty:</strong> {fire.confidence === "h" ? "High" : fire.confidence === "n" ? "Nominal" : fire.confidence === "l" ? "Low" : "Unknown"}<br/>
                        <strong>Detection Date:</strong> {fire.acq_date}{" "}<br/>
                        <strong>Detection Time:</strong> {(() => {
                        const utcTime = fire.acq_time.padStart(4, '0');
                        const hours = parseInt(utcTime.substring(0, 2), 10);
                        const minutes = utcTime.substring(2);
                        const date = new Date(`${fire.acq_date}T${hours}:${minutes}:00Z`);
                        const options = {
                            timeZone: "America/New_York",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true
                        };
                        return new Intl.DateTimeFormat("en-US", options).format(date);
                    })()} ET<br/>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
};

export default FireMap;



