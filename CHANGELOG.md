# Changelog

Dated notes on what changed, newest first. Each entry says what a user will notice, what was fixed behind the scenes, and anything left for later.

## 2026-09-23 / 24

### New

- **IECEE: National differences column.** The IECEE Explorer table now shows the countries each certificate's national differences cover (for example `CA JP US`), placed after Standards and on by default; hover for full country names. The search index doesn't carry this field, so the column loads each visible certificate's full record, six at a time (records are edge-cached for 6 hours). Saved column layouts gain the column once. It can also be exported; exporting it loads every certificate's record, so large exports with it switched on are slow.
- **Daily header welcome.** On the first visit of the day, the header logo draws itself, the brand wipes in, and a time-of-day greeting hands over to the page title and tagline. It happens inside the existing header, is skipped for people who prefer reduced motion, and `?welcome` on any explorer URL replays it.

### FCC capture restored

From 2026-09-18 to 2026-09-23 every scheduled FCC capture failed and the site kept showing the 2026-09-17 capture. The FCC refuses Cloudflare (HTTP 403), so the capture Worker reads the FCC through the r.jina.ai reader, and the reader started answering `429 Per IP rate limit exceeded` because Workers share outbound IP addresses. The fccid.io fallback goes through the same reader, so it failed too.

- The Worker retries the reader over about four minutes, runs every two hours at :23 (skipping scopes captured in the last 10 hours), runs scopes in parallel, and accepts an optional `JINA_API_KEY` secret.
- The site no longer depends on the Worker alone: when the capture is over 14 hours old, or a search is outside the captured scopes, the visitor's browser reads the official FCC response through the reader itself. Any FCC ID can now be searched live.
- `POST /refresh` no longer has an unauthenticated `?force=1` bypass.
- Details and troubleshooting: [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md#troubleshooting-the-fcc-capture).

### Fixed (site-wide review)

**FDA Explorer**
- The establishment-role filter matched longer role names too ("Manufacture Medical Device" also returned about 53,000 contract-manufacturer listings); it now matches exactly.
- Record links used only the registration number, which several listings share, so shared links could open the wrong listing. Links now identify the listing; old links still open the first match.
- Back/Forward no longer piles up dead history entries or reopens closed records.
- Next is disabled at openFDA's 25,000-record paging limit instead of failing.
- Enter on a link or button inside a row no longer also opens the row.
- GUDID panel links reproduce the counts they show; each labeler in a group has its own "Open in Devices (UDI)" button.
- Browsing all records (`?browse=1`) survives a reload; per-code counts no longer show the previous search's numbers; export filenames use the local date.

**FDA Monitoring**
- New listings are picked newest-first, so codes with more than 1,000 registrations no longer miss recent listings.
- Capped 510(k), recall and listing counts show a "+".
- Removing every product code clears the old results.
- Date windows use local calendar days ("last 30 days" is today and the 29 days before).

**FCC**
- Records captured from the fallback index keep their grant dates.
- A cancelled search no longer makes the next identical search fail or fall back to old data.
- Reset or "Clear all" during a search no longer leaves the spinner on.
- Date changes reset to page 1; date and purpose filters are kept in shareable links.
- Monitoring drops results for removed scopes; Class II permissive changes are no longer labelled as originals; date windows use local days.

**Health Canada (MDALL)**
- Reset during a search no longer leaves the page loading.
- Monitoring links to ended licences open them (they used to search active licences only).
- The Sonova preset chip can be removed; "Custom scope" really clears the company filter.
- Page numbers are clamped; class, type, dates, sort and view are kept in shareable links; chips and export labels describe the search that actually ran.
- A typed licence number shows the exact licence first.
- After a failed refresh, Monitoring no longer claims to be live; date windows use local days.

**IECEE**
- Pressing Enter twice no longer shows an abort error.
- Standards typed without a space (`IEC60601-1`) now match.
- An unfiltered search (`?all=1`) and links to pages past the end survive a reload.
- Refresh bypasses the 5-minute edge cache, and "Pulled" shows when the data was fetched.
- A national-differences cell that failed to load fills in when the certificate is opened.
- Monitoring labels and exports follow the window that was loaded, not the unapplied selection; "Updated" dates show the local day.

**Everywhere**
- Excel exports with hidden control characters no longer open as "damaged"; very long cells are clipped to Excel's limit; downloads work in Safari.
- Pages no longer go blank when the browser blocks site storage.
- The table scroll shadow works after results load.
- Link previews in Slack and Teams show the image.

### Left for later

- Add a free jina.ai key to the capture Worker (`npx wrangler secret put JINA_API_KEY --config cron/fcc-snapshot/wrangler.toml`) so scheduled captures stop depending on shared-IP limits.
- The Devices (UDI) view can search only one company name at a time, so a group like Sonova opens one labeler at a time.
- The internal site (`fda-device-internaluseonly`) was not redeployed with these changes.
