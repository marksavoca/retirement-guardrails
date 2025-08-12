// components/Header.tsx

import React from "react";

const Header: React.FC = () => (
    <div className="card">
        <div className="row spread">
            <div>
                <h1 className="h1">Retirement Guardrails Monitor</h1>
                <p className="help">
                    Track plan vs actuals with guardrails. Upload a Planner Summary CSV, tune thresholds, and
                    keep everything stored in MariaDB or fully local in your browser.
                </p>
            </div>
        </div>
    </div>
);

export default Header;