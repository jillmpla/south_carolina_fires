import React from "react";
import FireMap from "./components/FireMap";
import "./App.css";

function App() {
    const currentYear = new Date().getFullYear();

    return (
        <div className="App">
            <h1>South Carolina Wildfire Alert: Moderate to High-Intensity Fires</h1>

            {/* Moved Footer Content Here */}
            <div className="app-footer">
                <span>🔥 Fires with FRP 5 - 15 MW are moderate and 15+ MW are high-intensity. 🔥</span>
                <span>
        🔥 Data Source:{" "}
                    <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">
            NASA FIRMS
        </a> 🔥
    </span>
                <span>🔥 Visit <a href="https://southcarolinafires.com" target="_blank"
                                 rel="noopener noreferrer">southcarolinafires.com</a> daily for more wildfire updates! 🔥</span>
            </div>

            <FireMap/>
        </div>
    );
}

export default App;



