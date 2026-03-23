# Trophic State Index (TSI)

TSI (Trophic State Index) is a standardized scale used to estimate how nutrient-rich and biologically productive a lake is.

This note explains the Carlson Trophic State Index (CTSI) formulas commonly used in TSI calculation worksheets and reviews.

## The Three TSI Components

TSI is calculated from three independent indicators of algal productivity:

1. Total Phosphorus (TP)
2. Secchi Depth (SD)
3. Chlorophyll-a (Chl-a)

| Measurement | What it represents |
| --- | --- |
| Total Phosphorus | Nutrients available for algae growth |
| Chlorophyll-a | Actual algae biomass |
| Secchi Depth | Water clarity affected by algae and turbidity |

## 1. TSI from Total Phosphorus

Phosphorus is often the limiting nutrient that drives algae growth in freshwater lakes.

Formula:

```text
TSI(TP) = 14.42 x ln(TP) + 4.15
```

Where:

- `TP` = total phosphorus concentration, typically in `ug/L`

Interpretation:

Higher phosphorus means more algae growth potential and therefore a higher TSI.

## 2. TSI from Secchi Depth

Secchi depth measures water clarity using a black-and-white disk lowered into the water.

Formula when depth is already in meters:

```text
TSI(SD) = 60 - 14.41 x ln(SD)
```

If a worksheet stores Secchi depth in feet, convert to meters first:

```text
TSI(SD) = 60 - 14.41 x ln(SD_ft x 0.3048)
```

Interpretation:

- clearer water -> deeper Secchi reading -> lower TSI
- murkier water -> shallower Secchi reading -> higher TSI

## 3. TSI from Chlorophyll-a

Chlorophyll-a measures the actual biomass of algae in the water.

Formula:

```text
TSI(Chl) = 9.81 x ln(Chl) + 30.6
```

Where:

- `Chl` = chlorophyll-a concentration, typically in `ug/L`

Interpretation:

More algae means more chlorophyll and therefore a higher TSI.

## Combined TSI Value

A common summary value is the average of the three component scores:

```text
Avg(TSI) = average(TSI(TP), TSI(SD), TSI(Chl))
```

This provides a single indicator of overall lake productivity, but the individual component scores still matter because differences between them can reveal ecological conditions.

## Why Three TSI Calculations Exist

Each measurement reflects a different part of the nutrient -> algae -> clarity chain.

Example interpretations:

| TSI(TP) | TSI(Chl) | TSI(SD) | Interpretation |
| --- | --- | --- | --- |
| 60 | 45 | 40 | Nutrients are present but algae are not fully responding |
| 40 | 60 | 60 | Internal nutrient loading or a bloom event may be occurring |
| 45 | 45 | 60 | Reduced clarity may be driven by sediment or turbidity |
| 50 | 50 | 50 | The system is behaving consistently across indicators |

## Interpreting the TSI Scale

| TSI Range | Lake classification | Typical characteristics |
| --- | --- | --- |
| < 30 | Oligotrophic | Very clear water, low nutrients |
| 30-40 | Oligotrophic | Clear water, limited productivity |
| 40-50 | Mesotrophic | Moderate productivity |
| 50-60 | Eutrophic | High algae levels |
| 60-70 | Very eutrophic | Frequent algal blooms |
| 70+ | Hypereutrophic | Severe blooms and poor water quality |

## Key Takeaway

TSI is not just a combination of values. It is a standardized way to compare multiple water quality indicators on the same scale.

Review both:

- the average TSI
- the differences between the individual TSI components

That combination is what helps explain the drivers of lake productivity and water quality change.
