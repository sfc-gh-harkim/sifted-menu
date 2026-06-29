# Snowflake x Sifted Bellevue

A small static site that re-arranges the [Sifted](https://eat.sifted.co) menu
for the Snowflake Bellevue office around **days** instead of stations.

Sifted publishes one URL per food station, each containing the whole week.
This site flips that mental model: pick a day, see every station's offering
for that day on a single page laid out like a fancy restaurant menu.

## How it works

1. A scheduled GitHub Action runs `scripts/scrape.mjs`, which fetches the
   public Sifted page for each station, parses the HTML with
   [`cheerio`](https://cheerio.js.org), and writes a normalized
   `data/menu.json` grouped by day.
2. The static site (`index.html` + `styles.css` + `app.js`) loads
   `data/menu.json` and renders the selected day.
3. The Action then publishes the site to GitHub Pages.

The scraper runs on a weekday morning schedule (targeting ~7am PT, accounting
for GitHub Actions queue delays) and on every push to `main`. Run it manually
from the **Actions** tab via _Run workflow_.

## Local development

```bash
npm install
npm run scrape   # writes ./data/menu.json
npm run serve    # http://localhost:8080
```

## Stations

| Station        | Source                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| Pure           | https://eat.sifted.co/meals/659a82e0-6f43-432e-acf9-af733a7e1ef6       |
| Rotating Plate | https://eat.sifted.co/meals/cdc9288e-8e59-43d9-a69d-404b8a936039       |
| Wok N' Tandoor | https://eat.sifted.co/meals/7b143ea2-0e69-4a54-95ff-e07383ee664d       |
| Wrap Culture   | https://eat.sifted.co/meals/15b2a5bb-da9f-43a9-808e-ffeb47ca040a       |
| Sweet Spot     | https://eat.sifted.co/meals/e9699fc9-3bc1-4d04-be64-68ae4865b39a       |

To add or change a station, edit the `STATIONS` array in
[`scripts/scrape.mjs`](./scripts/scrape.mjs).

## One-time setup

In the repo settings, set **Pages → Build and deployment → Source** to
**GitHub Actions**. The first push to `main` will then publish the site.

## Disclaimer

Not affiliated with Sifted. All menu content belongs to Sifted, LLC.
