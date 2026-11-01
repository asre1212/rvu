# RVU Daily

A small, local-first, installable PWA for GI work RVU tracking. Source lives in **asre1212/rvu**.

## Use

Choose a calendar day, select **Colonoscopy**, **EGD**, or **Colon / EGD**, then tap **Forceps bx**, **Snare**, or **EMR** separately for lower and upper procedures. No intervention selected means diagnostic. Save a case, or set the number of identical cases first. Entries can be edited, deleted, and restored with Undo.

The Journal shows daily totals. The Averages tab divides total RVUs by **unique dates containing saved entries only**. Blank dates, weekends without entries, and holidays without entries are excluded. Deleting the final entry for a date removes that date from the denominator.

## Calculation model

This app implements the user's explicitly requested **custom productivity rules**, not a Medicare payment calculation or a guarantee of employer wRVU credit:

1. Within each scope, the highest selected technique is credited at 100%; other selected techniques at 50%.
2. Thus colon snare + forceps = 4.46 + 0.5 × 3.47 = **6.195** wRVUs.
3. For combined colon/EGD, calculate upper and lower independently, then credit the higher subtotal at 100% and the lower at 50%. Upper is not automatically the lower-valued side.
4. Multiple techniques assume distinct lesions. EMR includes biopsy/snare on its own lesion; do not select these again for that same lesion.
5. Diagnostic code values are included in therapeutic values and are not added again.
6. Integer ten-thousandths retain precision, including nested 50% adjustments. UI totals use two decimal places.

| Procedure | Diagnostic | Forceps bx | Snare | EMR |
|---|---:|---:|---:|---:|
| Colonoscopy | 3.18 (45378) | 3.47 (45380) | 4.46 (45385) | 5.89 (45390) |
| EGD | 2.04 (43235) | 2.33 (43239) | 3.38 (43251) | 4.75 (43254) |

Rates verified from the CMS October 2026 RVU26D download, `PPRRVU2026_Oct_nonQPP.csv`, work RVU column, unmodified procedures. Rule version `2026-custom-50-v1` is stored with entries and validated on import. Future rule changes must preserve historical calculation versions or include an explicit migration.

References reviewed November 1, 2026:

- [CMS RVU26D](https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26d)
- [Noridian multiple endoscopy payment rules](https://med.noridianmedicare.com/web/jfb/specialties/surgery/minor-surgery-and-endoscopies)
- [CMS separate-lesion modifier guidance](https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleId=53399)

Medicare same-family endoscopy payment subtracts the diagnostic base from a secondary code; this differs from the requested flat 50% tracking rule. Medicare payment reductions do not themselves establish an employer's productivity-credit policy.

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
