# Distinct Authors Dashboard

A static GitHub Pages app that builds a lightweight subreddit activity dashboard from the public Arctic Shift Reddit archive.

## What it shows

- distinct authors who posted or commented in the selected date range
- returning authors (2+ total contributions)
- one-time authors
- total posts, total comments, and total contributions
- contribution frequency over time
- monthly active authors
- top contributors
- monthly aggregate cards
- CSV export of usernames
- JSON export of the dashboard summary

## How it works

The app runs entirely in the browser and queries Arctic Shift's public aggregation endpoints:

- `posts/search/aggregate`
- `comments/search/aggregate`

It uses:

- `aggregate=author` for unique and returning-author calculations
- `aggregate=created_utc` for timeline and aggregate charts

Because large subreddit aggregations may time out, the page retries and can split requests into smaller date ranges.

## Hosting

This repo is designed for GitHub Pages. Publish from the `main` branch, root folder.
