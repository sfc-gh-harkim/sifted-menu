#!/usr/bin/env node
// CI entry point: optional skip for backup crons, scrape via API, and keep the
// last good same-week menu instead of deploying an empty scrape result.

import { writeMenu, scrapeMenu, isValidMenu, weekLabelForDate } from "./scrape.mjs";

const PAGES_MENU_URL =
  process.env.PAGES_MENU_URL ??
  "https://sfc-gh-harkim.github.io/sifted-menu/data/menu.json";
const CRON_SLOT = process.env.CRON_SLOT ?? "manual";

async function fetchDeployedMenu() {
  const res = await fetch(PAGES_MENU_URL, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; sifted-menu-ci/1.0)",
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Could not load deployed menu (${res.status})`);
  }
  return res.json();
}

function isSameWeek(menu, ref = new Date()) {
  return menu?.weekLabel === weekLabelForDate(ref);
}

function describeMenu(menu) {
  return `${menu.weekLabel} (${menu.days.length} days, generated ${menu.generatedAt})`;
}

async function useMenu(menu, reason) {
  await writeMenu(menu);
  console.log(reason);
  console.log(`Using menu: ${describeMenu(menu)}`);
}

async function main() {
  let deployed = null;
  try {
    deployed = await fetchDeployedMenu();
  } catch (err) {
    console.warn(`No deployed menu available: ${err.message}`);
  }

  const deployedIsFresh =
    isValidMenu(deployed) && isSameWeek(deployed, new Date());

  if (
    (CRON_SLOT === "backup" || CRON_SLOT === "safety") &&
    deployedIsFresh
  ) {
    await useMenu(
      deployed,
      `Skipping scrape for ${CRON_SLOT} cron; same-week menu already deployed.`,
    );
    return;
  }

  let scraped = null;
  try {
    scraped = await scrapeMenu();
  } catch (err) {
    console.error(`Scrape failed: ${err.message}`);
  }

  if (isValidMenu(scraped)) {
    await writeMenu(scraped);
    console.log(`Scraped fresh menu: ${describeMenu(scraped)}`);
    return;
  }

  if (deployedIsFresh) {
    await useMenu(
      deployed,
      "Scrape returned no usable menu; keeping last deployed same-week menu.",
    );
    return;
  }

  throw new Error(
    "No valid menu available to deploy (scrape empty and no same-week fallback).",
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
