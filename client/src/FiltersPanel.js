import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

import SearchableMultiSelect from "./SearchableMultiselect.jsx";
import { fetchCsvText, parseCsvRows } from "./api/csvApi";
import useCsvData from "./hooks/useCsvData";
import { formatParameterLabel } from "./parameterMetadata";

function FiltersPanel({
  filters = {
    selectedSites: [],
    parameter: "",
    startYear: null,
    endYear: null,
    chartType: "trend",
  },
  onFiltersChange = () => {},
  onDataLoaded = () => {},
  updateEnabled = true,
}) {
  const [sites, setSites] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const onDataLoadedRef = useRef(onDataLoaded);

  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

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

    const uniqueSites = [...new Set(dataRows.map((row) => row.Site).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const uniqueParameters = [...new Set(dataRows.map((row) => row.Parameter).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const uniqueYears = [...new Set(
      dataRows
        .map((row) => parseInt(row.Year, 10))
        .filter((year) => Number.isFinite(year))
    )].sort((a, b) => a - b);
    const yearBounds = uniqueYears.length
      ? { min: uniqueYears[0], max: uniqueYears[uniqueYears.length - 1] }
      : null;

    setSites(uniqueSites);
    setParameters(uniqueParameters);
    setAvailableYears(uniqueYears);
    setLoadError(null);

    onDataLoadedRef.current?.({
      rawData: dataRows,
      infoData: infoMap,
      yearBounds,
    });
  }, [loadedCsvs]);

  useEffect(() => {
    if (!csvError) {
      return;
    }

    setLoadError("Unable to load water quality data right now.");
    onDataLoadedRef.current?.({ rawData: [], infoData: {}, yearBounds: null });
  }, [csvError]);

  const handleSitesChange = (selectedSites) => {
    onFiltersChange({ selectedSites });
  };

  const handleStartYearChange = (event) => {
    const newStart = parseInt(event.target.value, 10);
    if (!Number.isFinite(newStart)) {
      return;
    }

    const currentEnd = filters.endYear;
    const nextEnd = currentEnd != null && newStart <= currentEnd ? currentEnd : newStart;
    onFiltersChange({ startYear: newStart, endYear: nextEnd });
  };

  const handleEndYearChange = (event) => {
    const rawEnd = parseInt(event.target.value, 10);
    if (!Number.isFinite(rawEnd)) {
      return;
    }

    const nextEnd = filters.startYear != null ? Math.max(rawEnd, filters.startYear) : rawEnd;
    onFiltersChange({
      startYear: filters.startYear ?? nextEnd,
      endYear: nextEnd,
    });
  };

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

      <div className="filter-group site-group">
        <SearchableMultiSelect
          label="Sites"
          options={sites}
          selected={filters.selectedSites}
          onChange={handleSitesChange}
          placeholder="Search sites..."
          maxPanelHeight={320}
          className="w-full"
        />
      </div>

      {updateEnabled && (
        <>
          <div className="filter-group">
            <div className="filter-dropdown">
              <label className="sms-label" htmlFor="start-year-select">Start Year</label>
              <select
                id="start-year-select"
                value={filters.startYear ?? ""}
                onChange={handleStartYearChange}
                className="year-select"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-dropdown">
              <label className="sms-label" htmlFor="end-year-select">End Year</label>
              <select
                id="end-year-select"
                value={filters.endYear ?? ""}
                onChange={handleEndYearChange}
                className="year-select"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-dropdown">
              <label className="sms-label" htmlFor="parameter-select">Parameter</label>
              <select
                id="parameter-select"
                value={filters.parameter}
                onChange={(event) => onFiltersChange({ parameter: event.target.value })}
                className="year-select"
              >
                <option value="" disabled>
                  Select parameter...
                </option>
                {parameters.map((parameter) => (
                  <option key={parameter} value={parameter}>
                    {formatParameterLabel(parameter)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-dropdown">
              <label className="sms-label" htmlFor="chart-type-select">Chart Type</label>
              <select
                id="chart-type-select"
                value={filters.chartType}
                onChange={(event) => onFiltersChange({ chartType: event.target.value })}
                className="year-select"
              >
                <option value="trend">Trend</option>
                <option value="comparison">Comparison</option>
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

FiltersPanel.propTypes = {
  filters: PropTypes.shape({
    selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
    parameter: PropTypes.string.isRequired,
    startYear: PropTypes.number,
    endYear: PropTypes.number,
    chartType: PropTypes.oneOf(["trend", "comparison"]).isRequired,
  }).isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  onDataLoaded: PropTypes.func,
  updateEnabled: PropTypes.bool,
};

export default FiltersPanel;
