import React, { useEffect, useRef, useState } from "react";
import SearchableMultiSelect from "./SearchableMultiselect.jsx";
import PropTypes from "prop-types";
import { fetchCsvText, parseCsvRows } from "./api/csvApi";
import useCsvData from "./hooks/useCsvData";
import { formatParameterLabel } from "./parameterMetadata";

/**
 * FiltersPanel
 * - Manages local UI state for filters
 * - Notifies parent via onFiltersChange from user actions
 * - Fetches CSV(s) from Azure and shares parsed data up via onDataLoaded
 */
function FiltersPanel({
  selectedSites = [],
  onFiltersChange = () => {},
  onUpdatePlot1 = () => {},
  onUpdatePlot2 = () => {},
  onDataLoaded = () => {}, // lift data up
  /**
   * Whether the Update Plot buttons should be enabled.  When false
   * the buttons are disabled and a helpful tooltip is shown on hover
   * instructing the user to click Continue on the home panel first.
   */
  updateEnabled = true,
}) {
  // Options loaded from CSV
  const [sites, setSites] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [loadError, setLoadError] = useState(null);

  // Local UI state
  const [filters, setFilters] = useState({
    selectedSites: [],
    parameter: "",
    startYear: null,
    endYear: null,
    chartType: "trend",
  });

  // Guard to ensure CSV-based year initialization runs once
  const didInitYearsRef = useRef(false);

  // Keep latest onDataLoaded without depending on function identity in effects
  const onDataLoadedRef = useRef(onDataLoaded);
  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

  /**
   * Keep local selectedSites in sync with parent prop (no parent updates here).
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
   * Fetch CSV(s) once from Azure, populate options, initialize years, and
   * bubble up the parsed data to App via onDataLoaded.
   */
  const { data: loadedCsvs, error: csvError } = useCsvData(async () => {
    const [dataCsvText, infoCsvText] = await Promise.all([
      fetchCsvText("NWMIWS_Site_Data_testing_varied.csv"),
      fetchCsvText("info.csv").catch(() => ""),
    ]);

    return {
      dataRows: parseCsvRows(dataCsvText),
      infoRows: infoCsvText ? parseCsvRows(infoCsvText) : [],
    };
  }, []);

  useEffect(() => {
    if (!loadedCsvs) {
      return;
    }

    const { dataRows, infoRows } = loadedCsvs;
    const infoMap = {};
    for (const row of infoRows || []) {
      const key = row?.Parameter ? String(row.Parameter).trim() : "";
      if (key) {
        infoMap[key] = row;
      }
    }

    const allSites = dataRows.map((row) => row.Site).filter(Boolean);
    const allParameters = dataRows.map((row) => row.Parameter).filter(Boolean);
    const uniqueSites = [...new Set(allSites)].sort((a, b) => a.localeCompare(b));
    const uniqueParameters = [...new Set(allParameters)].sort((a, b) => a.localeCompare(b));
    const yearsNum = dataRows
      .map((row) => parseInt(row.Year, 10))
      .filter((year) => Number.isFinite(year));
    const uniqueYears = [...new Set(yearsNum)].sort((a, b) => a - b);
    const min = uniqueYears[0];
    const max = uniqueYears[uniqueYears.length - 1];

    setSites(uniqueSites);
    setParameters(uniqueParameters);
    setAvailableYears(uniqueYears);
    setLoadError(null);

    if (!didInitYearsRef.current && uniqueYears.length) {
      didInitYearsRef.current = true;
      setFilters((prev) => ({
        ...prev,
        startYear: prev.startYear ?? min,
        endYear: prev.endYear ?? max,
      }));
      onFiltersChange({ startYear: min, endYear: max });
    }

    onDataLoadedRef.current?.({ rawData: dataRows, infoData: infoMap });
  }, [loadedCsvs, onFiltersChange]);

  useEffect(() => {
    if (!csvError) {
      return;
    }

    setLoadError("Unable to load water quality data right now.");
    onDataLoadedRef.current?.({ rawData: [], infoData: {} });
  }, [csvError]);

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
    const chartType = e.target.value;
    setFilters((prev) => ({ ...prev, chartType }));
    onFiltersChange({ chartType });
  };

  const disabledHint = "Click Continue in the welcome panel to enable plotting.";

  return (
    <div className="filters" style={{ overflowY: "auto" }}>
      {loadError && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 8,
            background: "#fff4e5",
            border: "1px solid #f0b429",
            color: "#8a4b08",
          }}
        >
          {loadError}
        </div>
      )}

      {/* Sites (multi-select) - always visible */}
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

      {/* Render other filter controls only when updateEnabled is true. */}
      {updateEnabled && (
        <>
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

          {/* Parameter */}
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
                    {formatParameterLabel(p)}
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

          {/* Actions — stacked vertically to save horizontal space */}
          <div className="filter-group filter-buttons">
            <button
              type="button"
              className="reset-btn"
              onClick={() => onUpdatePlot1(filters)}
              disabled={!updateEnabled}
              title={!updateEnabled ? disabledHint : "Update the left plot with current filters"}
            >
              Update Plot 1
            </button>

            <button
              type="button"
              className="reset-btn"
              onClick={() => onUpdatePlot2(filters)}
              disabled={!updateEnabled}
              title={!updateEnabled ? disabledHint : "Update the right plot with current filters"}
            >
              Update Plot 2
            </button>
          </div>
        </>
      )}
    </div>
  );
}
FiltersPanel.propTypes = {
  selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  onUpdatePlot1: PropTypes.func.isRequired,
  onUpdatePlot2: PropTypes.func.isRequired,
  onDataLoaded: PropTypes.func, // lifted data
  /** Whether the Update Plot buttons should be enabled */
  updateEnabled: PropTypes.bool,
};

export default FiltersPanel;
