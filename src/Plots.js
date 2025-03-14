import React, { useEffect, useState } from "react";
import { Line, Bar } from "react-chartjs-2";
import { Chart, registerables } from "chart.js";
import Papa from "papaparse";

// Register Chart.js components
Chart.register(...registerables);

// Default color palette: professional grey and blue tones.
const defaultColors = ["#37474F", "#5BC0DE", "#6C757D", "#ADB5BD", "#007BFF"];

// Chart Configuration
const chartConfig = {
  "Total Phosphorous": {
    type: "line",
    title: "Total Phosphorus Trend Chart",
    yLabel: "Total P (mg/m3)"
  },
  "Secchi": {
    type: "bar",
    title: "Secchi Comparison Chart",
    yLabel: "Secchi (feet)"
  }
};

function Plots({ selectedParameters, selectedSites, startDate, endDate }) {
  const [chartData, setChartData] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedParameters.length === 0 || selectedSites.length === 0) {
      setChartData({}); // Clear chart data if no selections
      return;
    }

    setLoading(true);
    console.log("Fetching water quality data...");

    // Moved processData inside the effect to avoid dependency issues.
    const processData = (data) => {
      const formattedData = {};

      selectedParameters.forEach((parameter) => {
        const config = chartConfig[parameter];
        if (!config) return;

        // Filter rows based on selected sites and date range
        let filteredData = data.filter(row =>
          row.Parameter === parameter &&
          selectedSites.includes(row.Location) &&
          parseInt(row.Year) >= startDate.getFullYear() &&
          parseInt(row.Year) <= endDate.getFullYear()
        );

        filteredData.sort((a, b) => parseInt(a.Year) - parseInt(b.Year)); // Sort by year

        if (filteredData.length === 0) {
          formattedData[parameter] = { labels: [], datasets: [] };
        } else if (config.type === "line") {
          formattedData[parameter] = {
            labels: [...new Set(filteredData.map(row => row.Year))],
            datasets: selectedSites
              .map((site, idx) => {
                const siteData = filteredData.filter(row => row.Location === site);
                return {
                  label: site,
                  data: siteData.map(row => parseFloat(row.Value)),
                  borderColor: defaultColors[idx % defaultColors.length],
                  backgroundColor: defaultColors[idx % defaultColors.length],
                  fill: false,
                  tension: 0.1
                };
              })
              .filter(dataset => dataset.data.length > 0)
          };
        } else if (config.type === "bar") {
          const uniqueLocations = [...new Set(filteredData.map(row => row.Location))];
          formattedData[parameter] = {
            labels: uniqueLocations,
            datasets: [
              {
                label: parameter,
                data: filteredData.map(row => parseFloat(row.Value)),
                backgroundColor: uniqueLocations.map((_, idx) => defaultColors[idx % defaultColors.length])
              }
            ]
          };
        }
      });

      console.log("Formatted Chart Data:", formattedData);
      setChartData(formattedData);
      setLoading(false);
    };

    fetch("/water_quality_data.csv")
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            console.log("CSV Data Parsed:", result.data);
            processData(result.data);
          }
        });
      })
      .catch(error => {
        console.error("Error fetching CSV:", error);
        setLoading(false);
      });
  }, [selectedParameters, selectedSites, startDate, endDate]);

  return (
    <div className="plots-container">
      {selectedParameters.length === 0 ? (
        <p className="no-plot-message">Select a parameter to display plots.</p>
      ) : (
        selectedParameters.map((param, index) => (
          <div key={index} className="plot-panel">
            <h4>{chartConfig[param]?.title || param}</h4>
            <div className="plot-content">
              {loading ? (
                <p>Loading data...</p>
              ) : chartData[param] && chartData[param].labels.length > 0 ? (
                chartConfig[param]?.type === "line" ? (
                  <Line
                    data={chartData[param]}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false, // Always disable to prevent stretching
                      scales: {
                        y: {
                          title: { display: true, text: chartConfig[param]?.yLabel }
                        }
                      }
                    }}
                  />
                ) : chartConfig[param]?.type === "bar" ? (
                  <Bar
                    data={chartData[param]}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false, // Always disable to prevent stretching
                      scales: {
                        y: {
                          title: { display: true, text: chartConfig[param]?.yLabel }
                        }
                      }
                    }}
                  />
                ) : (
                  <p>No chart available</p>
                )
              ) : (
                <p>No Data Available</p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default Plots;
