#!/usr/bin/env node
// Scrapes the public Sifted menu pages for each Snowflake Bellevue station and
// writes a single normalized menu.json for the static site to consume.
//
// The static site flips Sifted's mental model: instead of one URL per station
// covering a whole week, we group every station under a single day so a diner
// can see all options for *today* at a glance.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const STATIONS = [
  { id: "pure", name: "Pure", url: "https://eat.sifted.co/meals/659a82e0-6f43-432e-acf9-af733a7e1ef6", tagline: "Clean, vibrant, plant-forward" },
  { id: "rotating-plate", name: "Rotating Plate", url: "https://eat.sifted.co/meals/cdc9288e-8e59-43d9-a69d-404b8a936039", tagline: "A new chef's special every day" },
  { id: "wok-n-tandoor", name: "Wok N' Tandoor", url: "https://eat.sifted.co/meals/7b143ea2-0e69-4a54-95ff-e07383ee664d", tagline: "Asian wok and Indian tandoor classics" },
  { id: "hot-hands", name: "Hot Hands", url: "https://eat.sifted.co/meals/b507148b-aead-4e34-9542-828494b6bbc3", tagline: "Sandwiches, pizzas, and other handhelds" },
  { id: "wrap-culture", name: "Wrap Culture", url: "https://eat.sifted.co/meals/15b2a5bb-da9f-43a9-808e-ffeb47ca040a", tagline: "Hand-rolled wraps from around the globe" },
  { id: "sweet-spot", name: "Sweet Spot", url: "https://eat.sifted.co/meals/e9699fc9-3bc1-4d04-be64-68ae4865b39a", tagline: "A little something sweet to finish" },
];

const BELLEVUE_MARKET_URL = "https://snowflake.sifted.co/api/markets/snowflake/bellevue";
const BELLEVUE_MEALS_URL = "https://snowflake.sifted.co/api/markets/meals";
const BREAKFAST_SOURCE_URL = "https://snowflake.sifted.co/bellevue/meals";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) sifted-menu-scraper/1.0",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) sifted-menu-scraper/1.0",
      accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function parseMenuDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function getBellevueMarketId() {
  const { data } = await fetchJson(BELLEVUE_MARKET_URL);
  if (!data?.id) throw new Error("Bellevue market id missing from API response");
  return data.id;
}

function emptyBreakfast() {
  return {
    inService: false,
    name: "Hot Hands",
    tagline: "Breakfast",
    hero: "",
    dishes: [],
    sourceUrl: BREAKFAST_SOURCE_URL,
  };
}

async function fetchHotHandsBreakfast(marketId, isoDate) {
  const url = `${BELLEVUE_MEALS_URL}?id=${encodeURIComponent(marketId)}&date=${encodeURIComponent(isoDate)}`;
  const { data } = await fetchJson(url);

  for (const item of data ?? []) {
    if (item.serviceLine?.name?.toLowerCase() !== "breakfast") continue;
    for (const menu of item.menus ?? []) {
      if (menu.brand?.name !== "Hot Hands") continue;

      const dishes = (menu.scheduledElements ?? [])
        .map((el) => ({
          title: (el.name ?? "").trim(),
          description: (el.ingredients ?? "").trim(),
          allergens: [...new Set((el.allergens ?? []).filter(Boolean))],
        }))
        .filter((d) => d.title);

      return {
        inService: true,
        name: "Hot Hands",
        tagline: "Breakfast",
        hero: (menu.name ?? "").trim(),
        dishes,
        sourceUrl: BREAKFAST_SOURCE_URL,
      };
    }
  }

  return emptyBreakfast();
}

function parseStation(html, station) {
  const $ = cheerio.load(html);

  const weekLabel = $("nav .bold").first().text().trim();

  const days = [];
  $("#menu-list > div").each((_, dayEl) => {
    const $day = $(dayEl);
    const dayHeader = $day.find("[id]").first();
    const dayName = dayHeader.find("p").eq(0).text().trim();
    const dayDate = dayHeader.find("p").eq(1).text().trim();
    if (!dayName) return;

    const $menu = $day.find(".menu");
    const heroTitle = $menu.find("h2").first().text().trim();

    // Top-level allergens (the ones rendered next to the hero h2, not inside details).
    const heroAllergens = [];
    $menu
      .find("> .flex.gap-x-3 + div img, > div > img.w-9")
      .each((_, img) => {
        const a = $(img).attr("alt");
        if (a && !heroAllergens.includes(a)) heroAllergens.push(a);
      });

    const dishes = [];
    $menu.find("details > div > div.px, details > div > div").each((_, dishEl) => {
      const $dish = $(dishEl);
      const $h3 = $dish.find("h3").first();
      if (!$h3.length) return;
      const title = $h3.text().trim();
      const description = $dish.find("p").first().text().trim();
      const allergens = [];
      $dish.find("img").each((_, img) => {
        const a = $(img).attr("alt");
        if (a && !allergens.includes(a)) allergens.push(a);
      });
      if (title) dishes.push({ title, description, allergens });
    });

    if (!heroTitle && dishes.length === 0) return;

    days.push({
      day: dayName,
      date: dayDate,
      hero: heroTitle,
      heroAllergens,
      dishes,
    });
  });

  return {
    id: station.id,
    name: station.name,
    tagline: station.tagline,
    sourceUrl: station.url,
    weekLabel,
    days,
  };
}

async function main() {
  const stations = [];
  for (const station of STATIONS) {
    process.stderr.write(`Fetching ${station.name}...\n`);
    const html = await fetchHtml(station.url);
    stations.push(parseStation(html, station));
  }

  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const byDay = new Map();
  for (const station of stations) {
    for (const day of station.days) {
      if (!byDay.has(day.day)) {
        byDay.set(day.day, { day: day.day, date: day.date, stations: [] });
      }
      byDay.get(day.day).stations.push({
        id: station.id,
        name: station.name,
        tagline: station.tagline,
        hero: day.hero,
        heroAllergens: day.heroAllergens,
        dishes: day.dishes,
        inService: true,
      });
    }
  }

  // Make sure every station appears on every day, marking the ones the
  // source page didn't list as "not in service" so they still render.
  for (const d of byDay.values()) {
    const present = new Set(d.stations.map((s) => s.id));
    for (const meta of STATIONS) {
      if (present.has(meta.id)) continue;
      d.stations.push({
        id: meta.id,
        name: meta.name,
        tagline: meta.tagline,
        hero: "",
        heroAllergens: [],
        dishes: [],
        inService: false,
      });
    }
  }

  const days = Array.from(byDay.values()).sort(
    (a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day),
  );

  const stationOrder = STATIONS.map((s) => s.id);
  for (const d of days) {
    d.stations.sort(
      (a, b) => stationOrder.indexOf(a.id) - stationOrder.indexOf(b.id),
    );
  }

  process.stderr.write("Fetching Hot Hands breakfast from Bellevue portal...\n");
  let marketId;
  try {
    marketId = await getBellevueMarketId();
  } catch (err) {
    process.stderr.write(`Warning: could not load Bellevue market (${err.message})\n`);
  }

  for (const d of days) {
    if (!marketId) {
      d.breakfast = emptyBreakfast();
      continue;
    }
    const isoDate = parseMenuDate(d.date);
    if (!isoDate) {
      d.breakfast = emptyBreakfast();
      continue;
    }
    try {
      d.breakfast = await fetchHotHandsBreakfast(marketId, isoDate);
    } catch (err) {
      process.stderr.write(`Warning: breakfast scrape failed for ${d.day} (${err.message})\n`);
      d.breakfast = emptyBreakfast();
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    weekLabel: stations[0]?.weekLabel ?? "",
    surveyUrl:
      "https://cxmresponse.omnixm.com/#/response?q=%26%25$%2Fsid232974%26%25$%2F%3D6399%3DRestaurant%3Dfalse%3D0%3D0%3D0%3DWebLink%3D0",
    sources: [
      {
        id: "breakfast",
        name: "Hot Hands Breakfast",
        url: BREAKFAST_SOURCE_URL,
      },
      ...STATIONS.map(({ id, name, url }) => ({ id, name, url })),
    ],
    days,
  };

  await mkdir(resolve(ROOT, "data"), { recursive: true });
  const outPath = resolve(ROOT, "data", "menu.json");
  await writeFile(outPath, JSON.stringify(out, null, 2) + "\n");
  process.stderr.write(
    `Wrote ${outPath} – ${days.length} days, ${stations.length} stations.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
