# Post-Continue Full Application Transcript

## Purpose

This transcript covers all user-facing functionality after the user clicks `Continue`.

## Transcript

1. Narrator: "After you click `Continue`, the right side switches from the welcome page to two stacked plot panels: `Plot 1` and `Plot 2`."
2. Narrator: "The left side now shows the full filter toolbar above the map."

3. Narrator: "Start with the `Sites` selector. Open it and choose one or more sites."
4. Narrator: "Inside the site picker, type to filter, use `All` to select all matching visible options, or `Clear` to remove all selections."
5. Narrator: "You can also navigate the site picker with keyboard arrows and Enter."

6. Narrator: "Set `Start Year` and `End Year` for your analysis window."
7. Narrator: "If you choose a start year that is later than the current end year, the app automatically moves end year forward to match start year."
8. Narrator: "If you choose an end year earlier than start year, the app clamps end year to start year."

9. Narrator: "Next, choose a `Parameter` from the dropdown."
10. Narrator: "Then choose a `Chart Type`: `Trend` or `Comparison`."

11. Narrator: "Now click `Update Plot 1` to apply your current filters to Plot 1."
12. Narrator: "Click `Update Plot 2` to apply the same or different filter setup to Plot 2."
13. Narrator: "Each plot keeps its own configuration, so Plot 1 and Plot 2 can show different selections at the same time."

14. Narrator: "On the map, marker color shows selection state. Red means not selected. Green means selected."
15. Narrator: "Clicking a marker toggles site selection, and the selected site list updates immediately."
16. Narrator: "Hovering a marker opens a popup with location details and a contact URL."

17. Narrator: "In `Trend` mode, the chart title includes the active site, for example: `Parameter Trend for Site Name`."
18. Narrator: "Trend charts use boxplot statistics by year, and the app draws a connecting line through yearly median values."
19. Narrator: "Hover a trend data point to see a tooltip with min, mean when available, and max."

20. Narrator: "If more than one site was selected when building a trend plot, left and right arrow controls appear beside the plot title."
21. Narrator: "Use these arrows to cycle the trend view through selected sites without rebuilding the full plot config."

22. Narrator: "In `Comparison` mode, the chart title is `Parameter Comparison by Site`."
23. Narrator: "Each bar represents the mean value for that site over the selected year range."
24. Narrator: "Bar labels are wrapped for readability and can appear vertically inside bars when space allows."
25. Narrator: "Hover a bar to view its value in a tooltip."

26. Narrator: "Each plot header includes a download icon."
27. Narrator: "Click the download icon to export the raw rows used for that plot as a CSV file."
28. Narrator: "The file name format is: `parameter_charttype_data.csv`."
29. Narrator: "Download scope is exactly the active plot configuration: parameter, selected site set, and year range."

30. Narrator: "Each plot header also includes a `#` icon."
31. Narrator: "Click this icon to toggle sample counts on or off."
32. Narrator: "When enabled, counts are drawn above trend boxes or above comparison bars."

33. Narrator: "If no plot configuration exists yet, each plot panel prompts you to select sites."
34. Narrator: "If sites are selected but no parameter is selected, the message changes to `Select Parameter`."
35. Narrator: "If sites and parameter are selected but no rows match your filters, the message reads `No Data Available for Site, Year, and Parameter Selections`."

36. Narrator: "If plot data is still loading when you enter this view, the right side shows `Loading data...` until data is ready."

37. Narrator: "At the bottom of the plots view are `Exit` and `Back` buttons."
38. Narrator: "Both buttons return you to the welcome screen and reset filters and plot state."
39. Narrator: "Clicking the header Home link does the same reset."

40. Narrator: "The `Contact` button in the header remains available in this view."

## Practical Walkthrough Script

1. "Select two sites."
2. "Set start and end years."
3. "Choose a parameter."
4. "Set chart type to Trend and click Update Plot 1."
5. "Set chart type to Comparison and click Update Plot 2."
6. "Use Trend arrows to cycle sites in Plot 1."
7. "Toggle counts with the # icon in each plot."
8. "Download both plot datasets."
9. "Click Back to return to welcome."

## Evidence

- Continue gate and plots view switch: `client/src/App.js` lines 171-177, 272-308.
- Filters and update buttons: `client/src/FiltersPanel.js` lines 265-371.
- Year-range guard logic: `client/src/FiltersPanel.js` lines 206-222.
- Site selector search/all/clear/keyboard behavior: `client/src/SearchableMultiselect.jsx` lines 45-63, 99-128, 166-210.
- Marker toggle and popup fields: `client/src/MapPanel.js` lines 143-200.
- Plot config per slot and trend site cycling: `client/src/App.js` lines 207-269 and `client/src/plots/plotConfigs.js` lines 36-58.
- Trend and comparison chart construction: `client/src/plots/chartBuilders.js` lines 109-245.
- Plot panel controls (download, counts, nav arrows): `client/src/plots/ChartPanel.jsx` lines 741-758 and 867-875.
- Empty-state messages: `client/src/utils/plotEmptyState.js` lines 1-14.
- CSV download behavior and file naming: `client/src/plots/download.js` lines 9-47.
- Loading state: `client/src/Plots.js` lines 61-69.
- Reset by Back/Exit/Home: `client/src/App.js` lines 187-193 and 288-305.
