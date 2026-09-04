# Distinct Authors

A mobile-friendly GitHub Pages site that counts distinct Reddit usernames who posted or commented in a subreddit during a chosen date range.

It uses the public Arctic Shift Reddit archive and does not require a Reddit login or API key.

## Default

The page defaults to `r/TheTowerGame` and the preceding six calendar months.

## Method

The browser calls Arctic Shift's post and comment author aggregation endpoints, splits large date ranges into smaller chunks, unions all usernames, and reports:

- distinct post authors
- distinct comment authors
- overlap between the two
- raw union
- final distinct count (with optional exclusion of `[deleted]` and `AutoModerator`)

Large queries are automatically subdivided if the API times out.

## GitHub Pages

Publish the repository from the `main` branch, root folder (`/`).
