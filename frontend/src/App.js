import React, { useState, useCallback } from "react";
import FireMap from "./components/FireMap";
import "./App.css";

function App() {
    const [darkMode, setDarkMode] = useState(true);
    const [stats, setStats] = useState({ total: 0, moderate: 0, high: 0 });

    const onStatsChange = useCallback((s) => setStats(s), []);

    return (
        <div className={`app-container ${darkMode ? "dark" : "light"}`}>
            {/* HEADER */}
            <header className="app-header">

                <h1>
                    <img
                        src="/logo512.png"
                        alt="Wildfire Dashboard logo"
                        className="title-icon"
                    />
                    South Carolina Wildfire Dashboard
                </h1>

                <button
                    className="theme-toggle"
                    onClick={() => setDarkMode(!darkMode)}
                    aria-label="Toggle light and dark theme"
                >
                    {darkMode ? "Light Mode" : "Dark Mode"}
                </button>
            </header>

            {/* MAIN */}
            <main className="app-main" role="main">
                {/* SIDEBAR (stats only) */}
                <aside className="sidebar" aria-label="Sidebar with wildfire quick stats">
                    <section aria-labelledby="stats-heading">
                        <h2 id="stats-heading">Quick Stats</h2>
                        <ul className="stats-list">
                            <li>
                                <strong>Total (FRP ≥ 2):</strong>{" "}
                                <span aria-live="polite">{stats.total}</span>
                            </li>
                            <li>
                                <strong>Moderate (2–14 MW):</strong>{" "}
                                <span aria-live="polite">{stats.moderate}</span>
                            </li>
                            <li>
                                <strong>High (≥ 15 MW):</strong>{" "}
                                <span aria-live="polite">{stats.high}</span>
                            </li>
                        </ul>
                    </section>

                    <section className="data-source" aria-label="Data source">
                        <p>
                            Data:{" "}
                            <a
                                href="https://firms.modaps.eosdis.nasa.gov/"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                NASA FIRMS
                            </a>
                        </p>
                    </section>

                    <section className="update-note" aria-label="Update notice">
                        <p>Check back every 24 <br />hours for new updates!</p>
                    </section>

                </aside>

                {/* MAP */}
                <section
                    className="map-section"
                    aria-label="Interactive wildfire map of South Carolina"
                >
                    <FireMap onStatsChange={onStatsChange} />
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
                        South Carolina Wildfire Dashboard
                    </a>
                </p>
            </footer>
        </div>
    );
}

export default App;





