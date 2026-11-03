# RVU Daily

A small, local-first, installable PWA for GI work RVU tracking. Source lives in **asre1212/rvu**.

## Payment tracker (v1.3.0)

The Payment tracker tab lists one row per date with a saved case or schedule, plus manually added past or future dates. Checking Paid saves the actual check time. Paid rows automatically leave the active list after 30 elapsed days; retained archive records prevent them reappearing from logged dates. Show archived lets you review and uncheck them. Unpaid dates never expire. Manual-only dates can be removed with Undo; duplicate dates are prevented and manual dates never affect productivity averages.

Schema 4 includes date-keyed payment records with manual status, paid timestamp, and last-edit timestamp. JSON backup/import preserves active and archived records; newer payment edits win, including unchecking or removing manual dates. Schemas 1–3 remain importable and do not erase current payment history. Existing entries, schedules, and work-RVU calculations are unchanged.

## Use

Choose a calendar day, select **Colonoscopy**, **EGD**, or **Colon / EGD**, then tap **Forceps bx**, **Snare**, or **EMR** separately for lower and upper procedures. No intervention selected means diagnostic. Save a case, or set the number of identical cases first. Entries can be edited, deleted, and restored with Undo.

The Journal shows daily totals. The Analysis tab divides total RVUs by **unique dates containing saved entries only**. Blank dates, weekends without entries, and holidays without entries are excluded. Deleting the final entry for a date removes that date from the denominator.

## Side-by-side patient and procedure averages (v1.2.4)

Analysis compares scheduled and completed daily averages in one table: patients, total procedures, doubles, colonoscopies and EGDs. A completed double counts as one patient. Scheduled patient averages use saved schedule days; completed patient averages use tracked days with a case or schedule, including zero-completion schedule days. Each available average retains its total-count/day denominator. Scheduled colonoscopy and EGD splits are labeled **Not tracked**, since the schedule records only patient and double counts. Calculations and saved data are unchanged.

## Daily compensation estimates (v1.2.2)

Analysis shows a three-row table at **$60, $65 and $70 per work RVU**. Each daily estimate is the selected period's unrounded average daily work RVUs multiplied by the rate, displayed as USD to the nearest cent. It follows the same selected-month/all-time filters and completed-case-day denominator as the existing work-RVU average, through today. Empty periods show a dash. These are gross estimates before tax or employer adjustments. Saved entries, schedules and work-RVU counting are unchanged.

A second table shows estimated pay per work RVU at a **$3,500 daily rate**: $3,500 divided by the same unrounded average daily work RVUs, displayed to the nearest cent. For example, 50 average daily wRVUs gives $70.00 per wRVU. Zero or unavailable averages show a dash, never infinity.

## Daily schedules and procedure analysis (v1.2.0)

For each date, save **Patients scheduled** and **Doubles scheduled**. A double is one patient having an EGD and colonoscopy. Scheduled procedures = patients + doubles: **4 patients + 2 doubles = 6 procedures**. Doubles cannot exceed patients; counts must be whole numbers. An explicitly saved zero is distinct from a missing schedule. Schedules can be edited or cleared independently of completed cases, with Undo for clearing.

The Analysis tab has selected-month and all-time running averages for scheduled procedures, completed procedures, colonoscopies, completed doubles, EGDs, and scheduled doubles. Completed counts come from saved cases and respect their quantities. A combined case counts as two procedures, one colonoscopy, one EGD and one double. Multiple techniques within a scope do not create extra procedures.

Running averages include dates **through today** in the device's local timezone. Completed procedure averages use dates with a saved case or schedule, including scheduled dates with zero completed cases. Scheduled averages use only dates with a saved schedule; missing historical schedules are not treated as zero. Future schedules appear in the Journal but do not lower running completion averages. Each metric shows its numerator and denominator. The existing work-RVU average continues to divide by dates containing completed cases only.

Schema 3 adds per-date `schedules` and `scheduleTombstones`. Schema 1 and 2 backups remain importable, completed entries are preserved, and importing an older backup does not erase existing schedules. Newer edits and schedule deletions win by timestamp. JSON backup/restore includes schedules; daily CSV includes scheduled and completed procedure counts. The storage key and work-RVU rules stay unchanged.

## Work-RVU calculation model (v1.1.0)

The app tracks the **unadjusted sum of work RVUs for separately reportable codes**. It does not estimate Medicare payment or apply employer-specific credit adjustments.

1. Each completed scope has one diagnostic code only when no intervention is selected. Therapeutic codes already include the diagnostic work.
2. Each separately reportable technique counts once per scope at its full work RVU, irrespective of lesion count. Quantity means identical patient encounters, never the number of biopsies/polyps.
3. Upper and lower codes add in full; no 50% reduction and no diagnostic-base subtraction.
4. Selecting multiple techniques is the user's assertion that they were performed on **separate lesions/sites** and are independently reportable. All selected techniques count automatically; no extra lesion selector or confirmation is shown.
5. For a single lesion, enter only the final technique: snare includes its biopsy; EMR includes its biopsy and snare. Do not select those components again for the same lesion. Documentation and appropriate modifiers remain necessary when reporting separate services.
6. Upper and lower selections are independent, including biopsy in both scopes.
7. Averages divide by distinct dates with entries only. Integer arithmetic retains exact hundredths until display.

| Procedure | Diagnostic | Cold forceps biopsy | Snare | EMR |
|---|---:|---:|---:|---:|
| Colonoscopy | 3.18 (45378) | 3.47 (45380) | 4.46 (45385) | 5.89 (45390) |
| EGD | 2.04 (43235) | 2.33 (43239) | 3.38 (43251) | 4.75 (43254) |

| Example | Work RVUs |
|---|---:|
| EGD biopsy + colon biopsy | 5.80 |
| Colon biopsy + snare, separate lesions | 7.93 |
| Same-lesion biopsy/snare: select snare only | 4.46 |
| Same-lesion EMR with biopsy/snare: select EMR only | 5.89 |
| EGD biopsy + colon snare and separate biopsy | 10.26 |

Scope: completed diagnostic or therapeutic EGD/colonoscopy, cold forceps, hot/cold snare and EMR. This is not a complete claims encoder. Screening HCPCS codes, incomplete procedures/modifiers 52/53, hot biopsy forceps, sedation and interventions not listed above are outside this model. Do not use a diagnostic entry to represent an incomplete examination. Rates are pinned to 2026, rather than silently selecting a different year from the date.

References reviewed November 1, 2026:

- [CMS October 2026 RVU26D](https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26d): work values from the non-QP file, unmodified codes. Cross-checked against the [2026 procedural payment guide](https://www.watchman.com/content/dam/bostonscientific/Reimbursement/Gastroenterology/pdf/GI_Procedural_Reimbursement_Guide.pdf).
- [CMS 2026 NCCI Chapter VI](https://www.cms.gov/files/document/06-chapter6-ncci-medicare-policy-manual-2026-final.pdf): diagnostic bundling, one unit per repeated endoscopic technique, separate lesions.
- [CMS modifier 59 GI guidance](https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleId=53399): biopsy/snare of separate lesions.
- [ASGE EMR report](https://www.asge.org/docs/default-source/education/Technology_Reviews/doc-endoscopic_mucosal_resection_aip.pdf): EMR includes same-lesion biopsy and snare. Used only for component bundling, not historical payment or sedation advice.
- [Noridian payment rules](https://med.noridianmedicare.com/web/jfb/specialties/surgery/minor-surgery-and-endoscopies): payment adjustments are deliberately excluded from this work-RVU sum.

### Existing data and migration

Rule version is `2026-work-rvu-v2`; backup schema is 4, with the storage key unchanged. Version-1, version-2 and version-3 backups remain importable. Parsing preserves IDs, dates, quantities, timestamps and tombstones, and recalculates full work totals. The user's separate-lesion assumption applies to multiple techniques in **existing and new entries**; there is no review queue or extra entry step.

Before first converting on-device version-1 data, the app stores the exact original JSON under `rvu-daily-before-work-rvu-v2`, available via **Export pre-update backup**. If this backup or migration cannot be written, saving is blocked to protect existing data. Importing an older backup does not overwrite newer edits. Old app versions reject schema 3 rather than modifying it with the former rule.

## Storage and backup

Entries stay in localStorage under `rvu-daily-v1`. No patient identifiers, analytics, or server database. Export **JSON** to back up or transfer phones. Import merges by entry ID, keeps the newer edit, and honors deletion tombstones so old backups do not resurrect removed entries. Re-importing the same backup does not duplicate entries. Daily CSV is available for reporting; import uses JSON.

Browser storage belongs to its origin. Back up before clearing website data, changing phones, or switching the app URL. Private browsing may not persist data.

## PWA and automatic updates

On iPhone, open the hosted app in Safari → Share → Add to Home Screen. The service worker precaches the complete static shell for offline use. It checks for new versions on open and when returning to the app. A waiting update activates automatically when no form/import is pending. Unsaved work delays the update and exposes an Update button. Updates only replace shell caches; localStorage entries remain intact.

**Automatic release detection:** `node scripts/release.mjs` hashes the complete app shell and service worker code, then stamps the worker version. The GitHub Pages workflow runs this on every push, so new features are detected even if a developer forgets to bump the version manually. Run it before other deployments too. Keep stable storage keys. The service worker intentionally serves one coherent shell version rather than mixing old and new scripts.

## Development

No dependency installation or build is required. Serve `dist/` over HTTP for local development or HTTPS for PWA installation.

```sh
npm test
npm run check
```

Deploy the contents of `dist/`. All asset paths are relative, so the app also supports a GitHub Pages repository subpath such as `/rvu/`.

The included GitHub Actions workflow tests and publishes every push to `main`. Enable **Settings → Pages → Source: GitHub Actions** once. App updates then deploy automatically.

