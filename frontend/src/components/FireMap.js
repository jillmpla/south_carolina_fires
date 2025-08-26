import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from "react-leaflet";
import L from "leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";
import fireHighIconSrc from "./fire-high.svg";

//.env base; we still gracefully fall back to relative /api
const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/+$/, "");

const southCarolinaBounds = [
  [31.5, -84], //SW
  [35.8, -78], //NE
];

const fireIcon = new L.Icon({
  iconUrl: fireHighIconSrc,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -24],
  className: "fire-icon",
});

const FireMap = ({ onStatsChange }) => {
  const [fires, setFires] = useState([]);
  const [borderData, setBorderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;

    const fetchFires = async () => {
      try {
        setLoading(true);
        setErr("");

        //24h cache gate
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const lastFetch = Number(localStorage.getItem("lastFireDataFetch") || 0);
        const cachedRaw = localStorage.getItem("cachedFireData_all");
        const cached = cachedRaw ? JSON.parse(cachedRaw) : null;

        //refetch if: no last fetch, cache expired, cache missing/empty
        const shouldRefetch =
          !lastFetch ||
          now - lastFetch > dayMs ||
          !Array.isArray(cached) ||
          cached.length === 0;

        //build URL safely: use env base if present, else relative /api
        const url = (API_BASE ? `${API_BASE}` : "") + "/api/fires";

        if (shouldRefetch) {
          const resp = await axios.get(url);
          const raw = resp.data?.fires || [];
          if (mounted) setFires(raw);
          localStorage.setItem("cachedFireData_all", JSON.stringify(raw));
          localStorage.setItem("lastFireDataFetch", String(now));
        } else {
          if (mounted) setFires(cached);
        }
      } catch (e) {
        console.error("Error fetching fire data:", e);
        setErr("Unable to fetch fire data right now.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const fetchBorder = async () => {
      try {
        const res = await fetch("/southCarolinaBorder.geojson");
        const data = await res.json();
        if (mounted) setBorderData(data);
      } catch (e) {
        console.error("Error fetching border data:", e);
      }
    };

    fetchFires();
    fetchBorder();
    return () => {
      mounted = false;
    };
  }, []);

  //---- Formatting helpers ----
  const formatFrp = (v) => (v || v === 0 ? `${Number(v).toFixed(1)} MW` : "Unknown");
  const formatBrightness = (v) => (v ? `${Number(v).toFixed(0)} K` : "Unknown");
  const pad4 = (t) => String(t).padStart(4, "0"); 
  const toHHMM = (t) => `${pad4(t).slice(0, 2)}:${pad4(t).slice(2, 4)}`;
  const formatDate = (dateStr, timeStr) => {
    if (!dateStr && !timeStr) return "Unknown";
    if (dateStr && timeStr) return `${dateStr} ${toHHMM(timeStr)} UTC`;
    if (dateStr) return dateStr;
    return toHHMM(timeStr) + " UTC";
  };
  const formatCoord = (v) => (v || v === 0 ? Number(v).toFixed(2) : "—");

  //---- Base filter + stats (UI shows FRP >= 2 only) ----
  const { filteredFires, stats } = useMemo(() => {
    const base = (fires || []).filter((f) => Number(f.frp) >= 2);
    const moderate = base.filter((f) => Number(f.frp) >= 2 && Number(f.frp) < 15).length;
    const high = base.filter((f) => Number(f.frp) >= 15).length;
    const total = base.length;
    return { filteredFires: base, stats: { total, moderate, high } };
  }, [fires]);

  //report stats (sidebar)
  useEffect(() => {
    onStatsChange?.(stats);
  }, [stats, onStatsChange]);

  return (
    <MapContainer
      center={[33.8361, -81.1637]}
      zoom={7}
      minZoom={6}
      maxZoom={15}
      style={{ height: "100%", width: "100%" }}
      maxBounds={southCarolinaBounds}
      maxBoundsViscosity={0.8}
      aria-label="Leaflet map showing active wildfire detections"
      role="region"
    >
      {/* Base Map */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
      />

      {/* South Carolina Border */}
      {borderData && (
        <GeoJSON
          data={borderData}
          style={() => ({
            color: "#000",
            weight: 3,
            fillOpacity: 0,
          })}
        />
      )}

      {/* Legend */}
      <div className="map-legend" role="note" aria-label="Legend">
        <strong>Legend</strong>
        <div>🔥 FRP ≥ 2 MW shown</div>
      </div>

      {/* Screen-reader announcements */}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}
        >
          Loading fire data…
        </div>
      )}
      {err && (
        <div
          role="alert"
          aria-live="assertive"
          style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}
        >
          {err}
        </div>
      )}

      {/* Fire markers */}
      {filteredFires.map((fire, idx) => (
        <Marker
          key={`${fire.id || idx}-${fire.latitude}-${fire.longitude}`}
          position={[fire.latitude, fire.longitude]}
          icon={fireIcon}
          keyboard={true}
          alt={`Fire at ${fire.latitude?.toFixed?.(2)}, ${fire.longitude?.toFixed?.(2)} with FRP ${fire.frp ?? "unknown"}`}
        >
          <Popup>
            <div role="dialog" aria-label="Fire details" className="popup-content">
              <div className="popup-title">
                <img src="/logo512.png" alt="" aria-hidden="true" className="popup-icon" />
                <strong>Fire Detection</strong>
              </div>

              <ul className="popup-list">
                <li>
                  <strong>FRP:</strong> {formatFrp(fire.frp)}
                </li>
                <li>
                  <strong>Brightness:</strong> {formatBrightness(fire.brightness)}
                </li>
                <li>
                  <strong>Detected:</strong> {formatDate(fire.acq_date, fire.acq_time)}
                </li>
                <li>
                  <strong>Lat/Lon:</strong> {formatCoord(fire.latitude)}, {formatCoord(fire.longitude)}
                </li>
              </ul>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default FireMap;






