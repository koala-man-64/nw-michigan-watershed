import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import SearchableMultiSelect from "./SearchableMultiselect.jsx";
import { fetchMeasurements, fetchParameters } from "./api/platformApi";
import { trackEvent } from "./utils/telemetry";
import { useRuntimeConfig } from "./runtime/runtimeConfigContext";

function toPortalMeasurementRows(measurements = []) {
  return measurements.map((row) => ({
    Site: row.site,
    SiteType: row.siteType,
    Year: String(row.year),
    Parameter: row.parameter,
    Max: String(row.max),
    Min: String(row.min),
    Avg: String(row.avg),
    Count: String(row.count),
  }));
}

function toParameterInfoMap(parameters = []) {
  return Object.fromEntries(
    parameters.map((row) => [
      row.parameter,
      {
        Parameter: row.parameter,
        ContactInfo: row.contactInfo,
        AssociationInfo: row.associationInfo,
        ParameterInfo: row.parameterInfo,
      },
    ])
  );
}

function FiltersPanel({
  selectedSites = [],
  onFiltersChange = () => {},
  onUpdatePlot1 = () => {},
  onUpdatePlot2 = () => {},
  onDataLoaded = () => {},
  resetSignal = 0,
  updateEnabled = true,
}) {
  const { endpoints } = useRuntimeConfig();
  const [sites, setSites] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [filters, setFilters] = useState({
    selectedSites: [],
    parameter: "",
    startYear: null,
    endYear: null,
    chartType: "trend",
  });

  const didInitYearsRef = useRef(false);
  const lastResetSignalRef = useRef(resetSignal);
  const onDataLoadedRef = useRef(onDataLoaded);
  const onFiltersChangeRef = useRef(onFiltersChange);

  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
  }, [onFiltersChange]);

  useEffect(() => {
    if (!Array.isArray(selectedSites)) {
      return;
    }

    setFilters((prev) => {
      const sameLength = prev.selectedSites.length === selectedSites.length;
      const sameOrder =
        sameLength && prev.selectedSites.every((value, index) => value === selectedSites[index]);
      return sameOrder ? prev : { ...prev, selectedSites };
    });
  }, [selectedSites]);

  useEffect(() => {
    if (lastResetSignalRef.current === resetSignal) {
      return;
    }

    lastResetSignalRef.current = resetSignal;

    const minYear = availableYears[0] ?? null;
    const maxYear = availableYears[availableYears.length - 1] ?? null;
    const nextFilters = {
      selectedSites: [],
      parameter: "",
      startYear: minYear,
      endYear: maxYear,
      chartType: "trend",
    };

    setFilters(nextFilters);
    onFiltersChange(nextFilters);
  }, [availableYears, onFiltersChange, resetSignal]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchMeasurements(endpoints.measurements),
      fetchParameters(endpoints.parameters),
    ])
      .then(([measurementRows, parameterRows]) => {
        if (cancelled) {
          return;
        }

        const rawData = toPortalMeasurementRows(measurementRows);
        const infoMap = toParameterInfoMap(parameterRows);
        const uniqueSites = [...new Set(measurementRows.map((row) => row.site).filter(Boolean))].sort(
          (left, right) => left.localeCompare(right)
        );
        const uniqueParameters = [
          ...new Set(measurementRows.map((row) => row.parameter).filter(Boolean)),
        ].sort((left, right) => left.localeCompare(right));
        const uniqueYears = [
          ...new Set(
            measurementRows.map((row) => row.year).filter((value) => Number.isFinite(value))
          ),
        ].sort((left, right) => left - right);

        setSites(uniqueSites);
        setParameters(uniqueParameters);
        setAvailableYears(uniqueYears);

        if (!didInitYearsRef.current && uniqueYears.length) {
          didInitYearsRef.current = true;
          const minYear = uniqueYears[0];
          const maxYear = uniqueYears[uniqueYears.length - 1];
          setFilters((prev) => ({
            ...prev,
            startYear: prev.startYear ?? minYear,
            endYear: prev.endYear ?? maxYear,
          }));
          onFiltersChangeRef.current({ startYear: minYear, endYear: maxYear });
        }

        onDataLoadedRef.current?.({ rawData, infoData: infoMap });
      })
      .catch((error) => {
        console.error("Error loading portal datasets:", error);
        if (!cancelled) {
          onDataLoadedRef.current?.({ rawData: [], infoData: {} });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [endpoints.measurements, endpoints.parameters]);

  const handleSitesChange = (updated) => {
    setFilters((prev) => ({ ...prev, selectedSites: updated }));
    onFiltersChange({ selectedSites: updated });
    trackEvent("site_selected", {
      selectedSiteCount: updated.length,
      chartType: filters.chartType,
      parameter: filters.parameter || "unselected",
    });
  };

  const handleStartYearChange = (event) => {
    const newStart = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(newStart)) {
      return;
    }

    const currentEnd = filters.endYear;
    const nextEnd = currentEnd != null && newStart <= currentEnd ? currentEnd : newStart;
    setFilters((prev) => ({ ...prev, startYear: newStart, endYear: nextEnd }));
    onFiltersChange({ startYear: newStart, endYear: nextEnd });
  };

  const handleEndYearChange = (event) => {
    const rawEnd = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(rawEnd)) {
      return;
    }

    const start = filters.startYear;
    const nextEnd = start != null ? Math.max(rawEnd, start) : rawEnd;
    setFilters((prev) => ({ ...prev, endYear: nextEnd }));
    onFiltersChange({ startYear: start ?? nextEnd, endYear: nextEnd });
  };

  const handleParameterChange = (event) => {
    const parameter = event.target.value;
    setFilters((prev) => ({ ...prev, parameter }));
    onFiltersChange({ parameter });
  };

  const handleChartTypeChange = (event) => {
    const chartType = event.target.value;
    setFilters((prev) => ({ ...prev, chartType }));
    onFiltersChange({ chartType });
  };

  const trackPlotUpdate = (slot) => {
    trackEvent("plot_updated", {
      slot,
      chartType: filters.chartType,
      parameter: filters.parameter || "unselected",
      selectedSiteCount: filters.selectedSites.length,
      startYear: filters.startYear,
      endYear: filters.endYear,
    });
  };

  return (
    <div className="filters" style={{ overflowY: "auto" }}>
      <div className="filters-controls">
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

        {updateEnabled ? (
          <>
            <div className="filter-group">
              <div className="filter-dropdown filter-dropdown-centered">
                <label className="sms-label">Start Year</label>
                <select
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
              <div className="filter-dropdown filter-dropdown-centered">
                <label className="sms-label">End Year</label>
                <select
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
              <div className="filter-dropdown filter-dropdown-centered">
                <label className="sms-label">Parameter</label>
                <select
                  value={filters.parameter}
                  onChange={handleParameterChange}
                  className="year-select"
                >
                  <option value="" disabled>
                    Select parameter...
                  </option>
                  {parameters.map((parameter) => (
                    <option key={parameter} value={parameter}>
                      {parameter}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-dropdown filter-dropdown-centered">
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
          </>
        ) : null}
      </div>

      {updateEnabled ? (
        <div className="filter-group filter-buttons">
          <button
            type="button"
            className="reset-btn"
            onClick={() => {
              trackPlotUpdate("plot1");
              onUpdatePlot1(filters);
            }}
            title="Update the left plot with current filters"
          >
            Update Plot 1
          </button>

          <button
            type="button"
            className="reset-btn"
            onClick={() => {
              trackPlotUpdate("plot2");
              onUpdatePlot2(filters);
            }}
            title="Update the right plot with current filters"
          >
            Update Plot 2
          </button>
        </div>
      ) : null}
    </div>
  );
}

FiltersPanel.propTypes = {
  selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  onUpdatePlot1: PropTypes.func.isRequired,
  onUpdatePlot2: PropTypes.func.isRequired,
  onDataLoaded: PropTypes.func,
  resetSignal: PropTypes.number,
  updateEnabled: PropTypes.bool,
};

export default FiltersPanel;
