# Trophic State Index (TSI)

**TSI (Trophic State Index)** is a standardized scale used to estimate how nutrient-rich and biologically productive a lake is.  
It converts several different water quality measurements into a **single comparable index**, typically ranging from **0 to 100+**.

The formulas in the spreadsheet follow the **Carlson Trophic State Index (CTSI)** approach.

---

# The Three TSI Components

TSI is calculated using **three independent indicators of algal productivity**:

1. **Total Phosphorus (TP)**
2. **Secchi Depth (SD)**
3. **Chlorophyll-a (Chl-a)**

Each one measures a different part of the same ecological process.

| Measurement | What it Represents |
|---|---|
| Total Phosphorus | Nutrients available for algae growth |
| Chlorophyll-a | Actual algae biomass |
| Secchi Depth | Water clarity (impacted by algae and turbidity) |

---

# 1. TSI from Total Phosphorus

Phosphorus is often the **limiting nutrient** that drives algae growth in freshwater lakes.

Formula used in the spreadsheet:

TSI(TP) = 14.42 × ln(TP) + 4.15

Where:
- **TP** = Total phosphorus concentration (typically µg/L)

Interpretation:

Higher phosphorus → more algae growth potential → **higher TSI**

---

# 2. TSI from Secchi Depth

Secchi depth measures **water clarity** using a black-and-white disk lowered into the water.

Formula:

TSI(SD) = 60 − 14.41 × ln(SD)

In the spreadsheet the Secchi value is converted from **feet to meters**:

TSI(SD) = 60 − 14.41 × ln(SD_ft × 0.3048)

Interpretation:

- Clear water → deeper Secchi reading → **lower TSI**
- Murky water → shallow Secchi reading → **higher TSI**

---

# 3. TSI from Chlorophyll-a

Chlorophyll-a measures the **actual biomass of algae** in the water.

Formula:

TSI(Chl) = 9.81 × ln(Chl) + 30.6

Where:
- **Chl** = Chlorophyll-a concentration (µg/L)

Interpretation:

More algae → more chlorophyll → **higher TSI**

---

# Final TSI Value in the Spreadsheet

The spreadsheet calculates a **combined index** by averaging the three TSI values:

Avg(TSI) = average(TSI(TP), TSI(SD), TSI(Chl))

This provides a single indicator of overall lake productivity.

However, **the individual values are also important**, because differences between them reveal ecological conditions.

---

# Why Three TSI Calculations Exist

Each measurement represents a different stage of the nutrient → algae → clarity chain.

Nutrients → Algae Growth → Water Clarity

Comparing the TSI values helps diagnose what is happening in the lake.

Example interpretations:

| TSI(TP) | TSI(Chl) | TSI(Secchi) | Interpretation |
|---|---|---|---|
60 | 45 | 40 | Nutrients present but algae not fully responding |
40 | 60 | 60 | Internal nutrient loading or bloom event |
45 | 45 | 60 | Reduced clarity due to sediment or turbidity |
50 | 50 | 50 | Balanced system behaving normally |

---

# Interpreting the TSI Scale

| TSI Range | Lake Classification | Typical Characteristics |
|---|---|---|
< 30 | Oligotrophic | Very clear water, low nutrients |
30–40 | Oligotrophic | Clear water, limited productivity |
40–50 | Mesotrophic | Moderate productivity |
50–60 | Eutrophic | High algae levels |
60–70 | Very Eutrophic | Frequent algal blooms |
70+ | Hypereutrophic | Severe blooms and poor water quality |

---

# Key Takeaway

TSI is **not just a combination of values**, but a **standardized way to compare multiple water quality indicators on the same scale**.

By examining both:
- the **average TSI**, and
- the **differences between individual TSI components**

scientists can diagnose the drivers of lake productivity and water quality changes.