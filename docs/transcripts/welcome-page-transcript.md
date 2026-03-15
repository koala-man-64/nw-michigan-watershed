# Welcome Page Transcript

## Purpose

This transcript is a plain-language script for walking a user through the main welcome page before they click `Continue`.

## Transcript

1. Narrator: "You are now on the NW Michigan Water Quality Database home screen. At the top is the header with the project logo and title."
2. Narrator: "The title in the header works like a Home button. If you click it at any time, the app returns to this welcome state."
3. Narrator: "In the top navigation, click `Contact` to open contact details. The dialog shows the project contact, organization, phone number, and email."
4. Narrator: "You can close the contact dialog by clicking the close button, pressing Escape, or clicking outside the dialog."
5. Narrator: "In this current build, there is no audio instructions button in the header."
6. Narrator: "The screen is split into two main areas. On the left, you can already browse sites and use the map. On the right, you see the welcome instructions."
7. Narrator: "At the top of the left panel is the `Sites` selector. Open it to search sites, choose one or many, select all visible matches, or clear your selection."
8. Narrator: "As you select sites, the selector summary updates. It shows one site name or the first site plus a count of additional selected sites."
9. Narrator: "Below the selector is the map. Unselected sites appear with red markers. Selected sites appear with green markers."
10. Narrator: "Clicking any marker toggles that site on or off in your selected site list."
11. Narrator: "Hover over a marker to open a popup with site details, including size, max depth, average depth, description, and contact information."
12. Narrator: "Back on the right side, the welcome panel explains what the database does: retrieve, display, and download water quality data for northern Michigan lakes and streams."
13. Narrator: "It also explains the two chart modes: `Trend`, which shows change over time, and `Comparison`, which compares overall values across selected sites."
14. Narrator: "At the bottom right of the welcome panel, click `Continue`."
15. Narrator: "When you click `Continue`, the welcome panel is replaced by the full plots interface, and the rest of the filter controls become available."

## Notes For Presenter

- Before `Continue`, only site selection is visible in the filters panel.
- Start year, end year, parameter, chart type, and `Update Plot` buttons are hidden until `Continue` is clicked.
- If your audience asks about audio controls, clarify that the current UI does not include them.

## Evidence

- Welcome panel content and `Continue` behavior: `client/src/App.js` lines 78-143 and 272-279.
- Header, Home link, and Contact modal: `client/src/Header.js` lines 28-97.
- No audio action in current header tests: `client/src/Header.test.js` lines 42-51.
- Site selector interactions: `client/src/SearchableMultiselect.jsx` lines 45-63, 143-154, 166-210.
- Map marker toggle and popup details: `client/src/MapPanel.js` lines 142-200.
- Filters hidden before continue: `client/src/FiltersPanel.js` lines 265-371.
