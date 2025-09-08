import React, { useState, useCallback, useEffect, useMemo } from "react";
import FireMap from "./components/FireMap";
import "./App.css";

function App() {
    const initialTheme = useMemo(() => {
        const saved = localStorage.getItem("theme");
        if (saved === "dark" || saved === "light") return saved === "dark";
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
            return true;
        }
        return true;
    }, []);

    const [darkMode, setDarkMode] = useState(initialTheme);
    const [stats, setStats] = useState({ total: 0, moderate: 0, high: 0 });

    useEffect(() => {
        localStorage.setItem("theme", darkMode ? "dark" : "light");
    }, [darkMode]);

    const onStatsChange = useCallback((s) => setStats(s), []);

    return (
        <div className={`app-container ${darkMode ? "dark" : "light"}`}>
            {/* SKIP LINK */}
            <a href="#map" className="sr-only sr-only-focusable">Skip to map</a>

            {/* HEADER */}
            <header className="app-header">
                <h1>
                    <img
                        src="/logo512.png"
                        alt="Fire Dashboard logo"
                        className="title-icon"
                    />
                    South Carolina Fire Dashboard
                </h1>

                <button
                    className="theme-toggle"
                    onClick={() => setDarkMode(!darkMode)}
                    aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
                >
                    {darkMode ? "Light Mode" : "Dark Mode"}
                </button>
            </header>

            {/* MAIN */}
            <main className="app-main" role="main">
                {/* SIDEBAR */}
                <aside className="sidebar" aria-label="Sidebar with fire quick stats">

                    <section aria-labelledby="stats-heading">
                        <h3 id="stats-heading" className="sidebar-subhead">QUICK STATS</h3>

                        <details className="inline-help" aria-labelledby="frp-what">
                            <summary id="frp-what">What is FRP?</summary>
                            <div id="frp-def" className="help-body">
                                <p>
                                    <strong>
                                        <abbr title="Fire Radiative Power">FRP</abbr>
                                    </strong>{" "}
                                    is the amount of heat energy a fire gives off when a satellite detects it, measured in megawatts (MW, or millions of watts).
                                    Higher FRP means a more intense burn, but it does <em>not</em> indicate the fire's size or total area.
                                </p>
                            </div>
                        </details>

                        {/* STATS */}
                        <dl className="stats-dl" aria-describedby="frp-def">
                            <div className="stat">
                                <dt>Total (FRP ≥ 2&nbsp;MW)</dt>
                                <dd><span aria-live="polite">{stats.total}</span></dd>
                            </div>
                            <div className="stat">
                                <dt>
                                    <span className="badge badge--moderate" aria-hidden="true">Moderate</span>
                                    <span className="sr-only">Moderate</span> (2–14&nbsp;MW)
                                </dt>
                                <dd><span aria-live="polite">{stats.moderate}</span></dd>
                            </div>
                            <div className="stat">
                                <dt>
                                    <span className="badge badge--high" aria-hidden="true">High</span>
                                    <span className="sr-only">High</span> (≥ 15&nbsp;MW)
                                </dt>
                                <dd><span aria-live="polite">{stats.high}</span></dd>
                            </div>
                        </dl>
                    </section>

                    {/* GLOSSARY */}
                    <section aria-labelledby="glossary-heading">
                        <h3 id="glossary-heading" className="sidebar-subhead">ABOUT THESE STATS</h3>
                        <details className="inline-help">
                            <summary>Glossary</summary>
                            <ul className="glossary-list">
                                <li>
                                    <strong><abbr title="Fire Radiative Power">FRP</abbr>:</strong> Point-in-time fire intensity (MW) at detection.
                                </li>
                                <li>
                                    <strong>Brightness (K):</strong> Satellite thermal brightness temperature in Kelvin.
                                </li>
                                <li>
                                    <strong>Detected (UTC):</strong> Timestamp in Coordinated Universal Time.
                                </li>
                                <li>
                                    <strong>Lat/Lon:</strong> Location of the satellite pixel flagged as a thermal anomaly.
                                </li>
                            </ul>
                        </details>
                    </section>

                    <section className="data-source" aria-label="Data source">
                        <p>
                            Data Source:{" "}
                            <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">
                                NASA FIRMS
                            </a>
                        </p>
                    </section>

                    <section className="update-note" aria-label="Update notice">
                        <p>Updates daily around 3 PM ET</p>
                    </section>
                </aside>

                {/* MAP */}
                <section
                    id="map"
                    className="map-section"
                    aria-label="Interactive fire map of South Carolina"
                >
                    <FireMap onStatsChange={onStatsChange} darkMode={darkMode} />
                </section>
            </main>

            {/* FOOTER */}
            <footer className="app-footer">
                <p>
                    © {new Date().getFullYear()}{" "}
                    <a
                        href="https://southcarolinafires.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        South Carolina Fire Dashboard
                    </a>{" "}
                    <span style={{ margin: "0 0.5rem", fontWeight: "bold" }}>•</span>{" "}
                    <a href="/about.html">About</a>{" "}
                    <span style={{ margin: "0 0.5rem", fontWeight: "bold" }}>•</span>{" "}
                    <a href="/privacy.html">Privacy</a>
                </p>
            </footer>
        </div>
    );
}

export default App;

