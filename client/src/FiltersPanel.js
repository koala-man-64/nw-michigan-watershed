import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import SearchableMultiSelect from "./SearchableMultiselect.jsx";
import PropTypes from "prop-types";

/**
 * Azure Blob Storage constants
 */
const STORAGE_ACCOUNT = "nwmiwsstorageaccount";
const CONTAINER_NAME = "nwmiws";
const SAS_TOKEN =
  "sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2055-03-28T11:52:57Z&st=2025-03-28T03:52:57Z&spr=https&sig=3%2Fe9jY4M%2F0yFHftpJmTsuVvlPwpn7B4zQ9ey0bwnQ2w%3D";

/**
 * FiltersPanel
 * - Manages local UI state for filters
 * - Notifies parent via onFiltersChange ONLY from user actions
 *   and a one-time CSV initialization (after parse completes)
 */
function FiltersPanel({
  selectedSites = [],
  onFiltersChange = () => {},
  onUpdatePlot1 = () => {},
  onUpdatePlot2 = () => {},
}) {
  // Options loaded from CSV
  const [sites, setSites] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);

  // Local UI state
  const [filters, setFilters] = useState({
    selectedSites: [],
    parameter: "",
    startYear: null,
    endYear: null,
    chartType: "trend", // 'trend' | 'comparison'
  });

  // Guard to ensure CSV-based year initialization runs once
  const didInitYearsRef = useRef(false);

  /**
   * Keep local selectedSites in sync with parent prop (no parent updates here).
   * Avoid unnecessary updates to prevent re-render churn.
   */
  useEffect(() => {
    if (!Array.isArray(selectedSites)) return;
    setFilters((prev) => {
      const sameLength = prev.selectedSites.length === selectedSites.length;
      const sameOrder =
        sameLength && prev.selectedSites.every((v, i) => v === selectedSites[i]);
      return sameOrder ? prev : { ...prev, selectedSites };
    });
  }, [selectedSites]);

  /**
   * Fetch CSV once, populate options, and initialize years once.
   * Parent update is called outside of any setState updater to avoid warnings.
   */
  useEffect(() => {
    const waterQualityFileUrl = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}/NWMIWS_Site_Data_testing.csv?${SAS_TOKEN}`;

    const processYearData = (rows) => {
      const yearsNum = rows
        .map((row) => parseInt(row.Year, 10))
        .filter((y) => Number.isFinite(y));
      if (!yearsNum.length) return;

      const uniqueYears = [...new Set(yearsNum)].sort((a, b) => a - b);
      const min = uniqueYears[0];
      const max = uniqueYears[uniqueYears.length - 1];

      setAvailableYears(uniqueYears);

      // Initialize local + parent once
      if (!didInitYearsRef.current) {
        didInitYearsRef.current = true;
        setFilters((prev) => ({
          ...prev,
          startYear: prev.startYear ?? min,
          endYear: prev.endYear ?? max,
        }));
        onFiltersChange({ startYear: min, endYear: max });
      }
    };

    fetch(waterQualityFileUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} while fetching CSV`);
        return res.text();
      })
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            const allSites = result.data.map((r) => r.Site).filter(Boolean);
            const allParameters = result.data.map((r) => r.Parameter).filter(Boolean);

            const uniqueSites = [...new Set(allSites)].sort((a, b) => a.localeCompare(b));
            const uniqueParameters = [...new Set(allParameters)].sort((a, b) =>
              a.localeCompare(b)
            );

            setSites(uniqueSites);
            setParameters(uniqueParameters);
            processYearData(result.data);
          },
        });
      })
      .catch((err) => console.error("Error loading locations CSV:", err));
  }, [onFiltersChange]);

  // ---------------- Handlers (user-initiated; safe to notify parent) ----------------

  const handleSitesChange = (updated) => {
    setFilters((prev) => ({ ...prev, selectedSites: updated }));
    onFiltersChange({ selectedSites: updated });
  };

  const handleStartYearChange = (e) => {
    const newStart = parseInt(e.target.value, 10);
    if (!Number.isFinite(newStart)) return;

    const currentEnd = filters.endYear;
    const nextEnd = currentEnd != null && newStart <= currentEnd ? currentEnd : newStart;

    setFilters((prev) => ({ ...prev, startYear: newStart, endYear: nextEnd }));
    onFiltersChange({ startYear: newStart, endYear: nextEnd });
  };

  const handleEndYearChange = (e) => {
    const rawEnd = parseInt(e.target.value, 10);
    if (!Number.isFinite(rawEnd)) return;

    const start = filters.startYear;
    const nextEnd = start != null ? Math.max(rawEnd, start) : rawEnd;

    setFilters((prev) => ({ ...prev, endYear: nextEnd }));
    onFiltersChange({ startYear: start ?? nextEnd, endYear: nextEnd });
  };

  const handleParameterChange = (e) => {
    const parameter = e.target.value;
    setFilters((prev) => ({ ...prev, parameter }));
    onFiltersChange({ parameter });
  };

  const handleChartTypeChange = (e) => {
    const chartType = e.target.value; // 'trend' | 'comparison'
    setFilters((prev) => ({ ...prev, chartType }));
    onFiltersChange({ chartType });
  };

  return (
    <div className="filters" style={{ overflowY: "auto" }}>
      {/* Sites (multi-select) */}
      <div className="filter-group site-group">
        <SearchableMultiSelect
          label="Sites"
          options={sites}
          selected={filters.selectedSites}
          onChange={handleSitesChange}
          placeholder="Search sites…"
          maxPanelHeight={320}
          className="w-full"
        />
      </div>

      {/* Start Year */}
      <div className="filter-group">
        <div className="filter-dropdown">
          <label className="sms-label">Start Year</label>
          <select
            value={filters.startYear ?? ""}
            onChange={handleStartYearChange}
            className="year-select"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* End Year */}
      <div className="filter-group">
        <div className="filter-dropdown">
          <label className="sms-label">End Year</label>
          <select
            value={filters.endYear ?? ""}
            onChange={handleEndYearChange}
            className="year-select"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Parameter (single-select) */}
      <div className="filter-group">
        <div className="filter-dropdown">
          <label className="sms-label">Parameter</label>
          <select
            value={filters.parameter}
            onChange={handleParameterChange}
            className="year-select"
          >
            <option value="" disabled>
              Select parameter…
            </option>
            {parameters.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart Type */}
      <div className="filter-group">
        <div className="filter-dropdown">
          <label className="sms-label">Chart Type</label>
          <select
            value={filters.chartType}
            onChange={handleChartTypeChange}
            className="year-select"
          >
            <option value="trend">Trend</option>
            <option value="comparison">Comparison</option>
          </select>
        </div>
      </div>

      {/* Optional “apply” buttons */}
      <div className="filter-group filter-buttons">
        <button
          className="reset-btn"
          onClick={() => onUpdatePlot1(filters)}   // pass the current local filters
        >
          Update Plot 1
        </button>
      </div>

      <div className="filter-group filter-buttons">
        <button
          className="reset-btn"
          onClick={() => onUpdatePlot2(filters)}   // pass the current local filters
        >
          Update Plot 2
        </button>
      </div>
    </div>
  );
}
FiltersPanel.propTypes = {
  selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  onUpdatePlot1: PropTypes.func.isRequired,
  onUpdatePlot2: PropTypes.func.isRequired,
};

export default FiltersPanel;
