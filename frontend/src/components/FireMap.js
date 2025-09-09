/* /frontend/src/components/FireMap.js */
import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from "react-leaflet";
import L from "leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/+$/, "");

//South Carolina bounds
const southCarolinaBounds = [
    [31.5, -84], //SW
    [35.8, -78], //NE
];

//COLORS (shared across markers + legend)
const FLAME_PRIMARY_MOD  = "#F59E0B";
const FLAME_INNER_MOD    = "#B45309";

const FLAME_PRIMARY_HIGH = "#DC2626";
const FLAME_INNER_HIGH   = "#7F1D1D";

const makeFlameSVG = (fill = FLAME_PRIMARY_HIGH, inner = FLAME_INNER_HIGH) => `
  <svg width="28" height="28" viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <g>
      <path d="M75.941 55.957c0-10.63-13.147-19.561-8.177-36.877c-5.257 2.69-9.951 6.127-12.185 12.827C56.77 18.035 51.779 7.653 41.951 0c2.612 11.542 2.922 22.509-6.894 30.944c-3.471-6.74-9.443-10.004-16.194-12.185c5.619 15.586-4.804 25.928-4.804 37.198h-.028c0 10.684 5.41 20.103 13.64 25.67c-2.478-3.479-3.95-7.723-3.95-12.319l.019 0c0-7.304 9.034-13.44 5.619-25.338c3.612 1.848 6.837 4.21 8.373 8.813c-.818-9.531 10.556-14.534 9.364-21.923c5.393 7.389-2.007 15.466 4.737 21.262c2.385-4.631 6.488-6.874 11.127-8.373c-3.861 10.709 3.301 17.815 3.301 25.559h.019c0 4.596-1.472 8.84-3.95 12.319c8.23-5.567 13.64-14.986 13.64-25.67L75.941 55.957z"
            fill="${fill}" />
      <path d="M45 61.12c-7.975 0-14.44 6.465-14.44 14.44S37.025 90 45 90s14.44-6.465 14.44-14.44S52.975 61.12 45 61.12zM47.351 84.401h-4.703v-3.867h4.703V84.401zM47.351 77.294h-4.703V66.539h4.703V77.294z"
            fill="${inner}" />
    </g>
  </svg>
`;

const makeDivIcon = (fill, inner) =>
    L.divIcon({
        html: makeFlameSVG(fill, inner),
        className: "fire-icon-div",
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -24],
    });

const iconForFrp = (frp) => {
    const v = Number(frp);
    if (Number.isFinite(v) && v >= 15) return makeDivIcon(FLAME_PRIMARY_HIGH, FLAME_INNER_HIGH); //high
    if (Number.isFinite(v) && v >= 2)  return makeDivIcon(FLAME_PRIMARY_MOD,  FLAME_INNER_MOD);  //moderate
    //filter out <2 MW
    return makeDivIcon("#9CA3AF", "#6B7280");
};

//legend icon as a React component
const FlameIcon = ({ fill, inner, size = 16, title }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 90 90"
        aria-hidden={title ? "false" : "true"}
        role={title ? "img" : "presentation"}
    >
        {title ? <title>{title}</title> : null}
        <g>
            <path
                d="M75.941 55.957c0-10.63-13.147-19.561-8.177-36.877c-5.257 2.69-9.951 6.127-12.185 12.827C56.77 18.035 51.779 7.653 41.951 0c2.612 11.542 2.922 22.509-6.894 30.944c-3.471-6.74-9.443-10.004-16.194-12.185c5.619 15.586-4.804 25.928-4.804 37.198h-.028c0 10.684 5.41 20.103 13.64 25.67c-2.478-3.479-3.95-7.723-3.95-12.319l.019 0c0-7.304 9.034-13.44 5.619-25.338c3.612 1.848 6.837 4.21 8.373 8.813c-.818-9.531 10.556-14.534 9.364-21.923c5.393 7.389-2.007 15.466 4.737 21.262c2.385-4.631 6.488-6.874 11.127-8.373c-3.861 10.709 3.301 17.815 3.301 25.559h.019c0 4.596-1.472 8.84-3.95 12.319c8.23-5.567 13.64-14.986 13.64-25.67L75.941 55.957z"
                fill={fill}
            />
            <path
                d="M45 61.12c-7.975 0-14.44 6.465-14.44 14.44S37.025 90 45 90s14.44-6.465 14.44-14.44S52.975 61.12 45 61.12zM47.351 84.401h-4.703v-3.867h4.703V84.401zM47.351 77.294h-4.703V66.539h4.703V77.294z"
                fill={inner}
            />
        </g>
    </svg>
);

/** ------------------------------------------------------------------------
 *  Tiles & utility
 *  ------------------------------------------------------------------------ */
const LIGHT_TILES = {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
};

const DARK_TILES = {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attr: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
};

function next1900UTC(from = new Date()) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 19, 0, 0, 0));
    if (from >= d) d.setUTCDate(d.getUTCDate() + 1);
    return d;
}

const CACHE_DATA_KEY = "cachedFireData_all";
const CACHE_EXP_KEY = "cachedFireData_exp";

/** ------------------------------------------------------------------------
 *  Component
 *  ------------------------------------------------------------------------ */
const FireMap = ({ onStatsChange, darkMode = false }) => {
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

                const now = Date.now();
                const cachedRaw = localStorage.getItem(CACHE_DATA_KEY);
                const cachedExp = Number(localStorage.getItem(CACHE_EXP_KEY) || 0);

                if (cachedRaw && cachedExp && now < cachedExp) {
                    const cached = JSON.parse(cachedRaw);
                    if (mounted) setFires(Array.isArray(cached) ? cached : []);
                } else {
                    const url = (API_BASE ? `${API_BASE}` : "") + "/api/fires";

                    const resp = await axios.get(url, {
                        validateStatus: (s) => s >= 200 && s < 500,
                    });

                    if (resp.status >= 400) {
                        throw new Error(`HTTP ${resp.status}`);
                    }

                    const raw = resp.data?.fires || [];
                    if (mounted) setFires(raw);

                    const expiresHeader = resp.headers?.["expires"];
                    const expMs = expiresHeader ? Date.parse(expiresHeader) : next1900UTC().getTime();

                    localStorage.setItem(CACHE_DATA_KEY, JSON.stringify(raw));
                    localStorage.setItem(CACHE_EXP_KEY, String(expMs));
                }
            } catch (e) {
                console.error("Error fetching fire data:", e);
                setErr("Unable to fetch fire data right now.");

                const stale = localStorage.getItem(CACHE_DATA_KEY);
                if (stale && mounted) {
                    try {
                        const parsed = JSON.parse(stale);
                        if (Array.isArray(parsed)) setFires(parsed);
                    } catch {}
                }
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

    const formatFrp = (v) => (v || v === 0 ? `${Number(v).toFixed(1)} MW` : "Unknown");
    const formatBrightness = (v) => (v ? `${Number(v).toFixed(0)} K` : "Unknown");
    const pad4 = (t) => String(t).padStart(4, "0");
    const toHHMM = (t) => `${pad4(t).slice(0, 2)}:${pad4(t).slice(2, 4)}`;

    const formatDate = (dateStr, timeStr) => {
        if (!dateStr && !timeStr) return "Unknown";

        const yyyy = dateStr?.slice(0, 4);
        const mm   = dateStr?.slice(5, 7);
        const dd   = dateStr?.slice(8, 10);

        const date = new Date(Date.UTC(
            yyyy,
            mm - 1,
            dd,
            Number(timeStr?.slice(0, 2) || 0),
            Number(timeStr?.slice(2, 4) || 0)
        ));

        const d = date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC"
        });

        const t = date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "UTC"
        });

        return `${d}, ${t} UTC`;
    };

    const formatCoord = (v) => (v || v === 0 ? Number(v).toFixed(2) : "—");

    const { filteredFires, stats } = useMemo(() => {
        const base = (fires || []).filter((f) => Number(f.frp) >= 2);
        const moderate = base.filter((f) => Number(f.frp) >= 2 && Number(f.frp) < 15).length;
        const high = base.filter((f) => Number(f.frp) >= 15).length;
        const total = base.length;
        return { filteredFires: base, stats: { total, moderate, high } };
    }, [fires]);

    useEffect(() => {
        onStatsChange?.(stats);
    }, [stats, onStatsChange]);

    const tiles = darkMode ? DARK_TILES : LIGHT_TILES;

    const borderStyle = useMemo(
        () => ({
            color: darkMode ? "#fff" : "#000",
            opacity: darkMode ? 0.8 : 1,
            weight: 2.5,
            fillOpacity: 0,
        }),
        [darkMode]
    );

    return (
        <MapContainer
            center={[33.8361, -81.1637]}
            zoom={7}
            minZoom={6}
            maxZoom={15}
            style={{ height: "100%", width: "100%" }}
            maxBounds={southCarolinaBounds}
            maxBoundsViscosity={0.8}
            aria-label="Leaflet map showing active fire detections"
            role="region"
            preferCanvas={true}
        >
            {/* Base Map */}
            <TileLayer url={tiles.url} attribution={tiles.attr} />

            {/* South Carolina Border */}
            {borderData && <GeoJSON data={borderData} style={() => borderStyle} />}

            {/* Legend */}
            <div className="map-legend" role="note" aria-label="Legend">
                <strong>Legend</strong>
                <div style={{ display: "grid", gap: "0.25rem", marginTop: "0.35rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                        <FlameIcon
                            fill={FLAME_PRIMARY_MOD}
                            inner={FLAME_INNER_MOD}
                            size={16}
                            title="Moderate intensity"
                        />
                        <span>Moderate (FRP 2-14&nbsp;MW)</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                        <FlameIcon
                            fill={FLAME_PRIMARY_HIGH}
                            inner={FLAME_INNER_HIGH}
                            size={16}
                            title="High intensity"
                        />
                        <span>High (FRP ≥ 15&nbsp;MW)</span>
                    </div>
                    <div style={{ marginTop: ".15rem", opacity: 0.85, fontSize: ".9em" }}>
                        <em>Only detections with FRP ≥ 2&nbsp;MW are shown.</em>
                    </div>
                </div>
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
                    icon={iconForFrp(fire.frp)}
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

