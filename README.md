# heurastudios.com

The Heura Studios marketing site: home page, Tools page, Datasets page, blog, legal pages and the old `/waitlist/` page. It's a
static site that GitHub Pages builds with Jekyll 3.10, plus a small Google Apps Script that saves form sign-ups to a
Google Sheet.

## Quick start

```sh
gem install 'jekyll:3.10.0' kramdown-parser-gfm webrick   # once
npm install && npx playwright install chromium            # once, for the tests

npm run serve    # http://localhost:4000, rebuilds on save
npm test         # backend + page tests
```

Pushing to `main` deploys (GitHub Pages, about a minute). CI runs `npm test` on every push and pull request.

## Where things are

| Path | What it is |
| --- | --- |
| `_layouts/default.html` | The page shell every page uses: `<head>`, header, page content, footer |
| `_includes/head.html` | Everything in `<head>`: meta and link-preview tags, the theme script, fonts, CSS and JS |
| `_includes/header.html`, `footer.html`, `logo.html` | The shared header (the sections, then Log in and Sign up, the app's), footer and logo |
| `_layouts/blog.html`, `post.html` | Blog wrapper and a single post |
| `index.html` + `home.css` + `home.js` | Home page: hero, screen recording, specs, the inquiry form |
| `tools/index.html` + `tools.css` + `tools.js` | Tools page: every Studio tool, what it takes and gives, and its recording |
| `_data/tools.yml` | The tools on the Tools page, in the Studio's groups and order (edit copy here, not in the HTML) |
| `datasets/index.html` + `datasets.css` + `datasets.js` | Datasets page: the app's 100 ready-made datasets by topic, search and the topic filter, and each set's preview (three rows with their credits, its source and license) |
| `_data/datasets.json` | The sets on the Datasets page, made from the app's library by `_tools/make-datasets.py` (don't edit by hand) |
| `_data/datasets_page.yml` | The Datasets page's featured row and each topic's icon |
| `recording.js` | Plays a screen recording while it's on screen, in the files for the current appearance (home and Tools) |
| `privacy/`, `terms/` + `legal.css` | Privacy Policy and Terms of Service |
| `waitlist/` | The old waitlist page (kept for old links) |
| `blog/index.html`, `_posts/`, `blog.css` | Blog list and posts (Markdown) |
| `site.css`, `site.js` | Shared by every page: color tokens, base styles, header, footer, the Appearance switch, the canvas in the side margins and the sheet under the column (screens 1360px and wider) |
| `form.js` | Shared form logic for both forms, the inquiry form and the waitlist (validation, posting, error and success messages) |
| `_backend/` | The Apps Script behind the forms: `core.js` (logic, tested in Node) and `Code.gs` (Google wiring) |
| `_tests/` | Playwright page tests (run against the Jekyll build) |
| `_tools/` | Python scripts that make the screen recordings, the logo/icon files and the Datasets page's data |
| `img/`, `reports/` | Images, recordings, report PDFs |
| `_config.yml` | Site config, including `app_url` (the app, where Log in and Sign up go) and `form_endpoint` (the Apps Script URL) |

Folders starting with `_` are never published.

## Common changes

- **A page's title, description or link preview:** the front matter at the top of the page (`title`,
  `description`, and optionally `og_title` / `og_description`). `_includes/head.html` lists every option.
- **Header, footer or logo:** edit the file in `_includes/` once. Every page picks it up.
- **A new page:** create `something/index.html` with front matter (`layout: default`, `title`, `description`, and
  `css:` / `js:` for any page-specific files), then write the page's `<main>…</main>`.
- **A tool on the Tools page:** edit `_data/tools.yml`. A new tool also needs its recording (`clip:`, see below).
- **The Datasets page's sets:** they're the app's library (`studio/dataset_library/` in pooo000/heurastudios-app). After it
  changes, run `python3 _tools/make-datasets.py <app checkout>` on a checkout of the app's `live` and commit
  `_data/datasets.json`. The tool stops, saying why, when a set's samples, credits, licenses or topics don't fit the page
  (a new topic needs an icon in `_data/datasets_page.yml` first). The featured row is `featured:` there. The page shows
  each set's preview only: downloads stay in the app, behind log-in.
- **The forms' endpoint:** `form_endpoint` in `_config.yml`.
- **Colors:** tokens at the top of `site.css`. Every color has a light, dark and high-contrast value. The site is
  black and white only.

## Forms and the sheet

Sign-up is open to anyone (since Nov 18, 2026): the header's Log in and Sign up go to the app (`app_url`), and the
home page's form is for inquiries, questions sent to the founders without emailing them.

Both forms post to one Apps Script web app (`form_endpoint`). The home page's inquiry form sends `kind=inquiry`
(name, email, company, role, message); the waitlist page sends an email and a company. With JS, `form.js` posts with
`js=1` and shows the JSON result in place. Without JS, the browser posts the form and the script answers with a plain
page.

The sheet ("Heura waitlist") and its bound Apps Script project of the same name are in ryan@heurastudios.com's
Google Drive, since Nov 8, 2026; they run as that account. Every inquiry is emailed to ryan@, william@, tsun@ and
ethan@heurastudios.com (`FOUNDERS` in `_backend/core.js`), with the person who asked as the reply-to, however many
times the same email writes; so is each new request for access from the old form (`kind=request`, still taken). A
waitlist join, a bot and a refused or turned-away post send no email.

Inquiries go on the sheet's **Inquiries** tab, one row each: Sent at, Email, Name, Company, Role, Question, Came from
(`setup()` makes the tab; the first inquiry makes it too if setup hasn't run). The first tab keeps one row per email
for the waitlist and the old requests for access: Joined at, Email, Company, Came from, Name, Role, What they will
specialize. Signing up again doesn't add a row. "Came from" is the page's utm query, the page on this site that linked
them, or the other website that did. A visit to the `/exec` address answers `{"ok":true,"service":"Heura waitlist",
"inquiries":true}` once the version that takes inquiries is deployed.

Spam protection: a hidden honeypot field, a limit of 60 new rows a minute, and a leading `'` on any cell that would
start a spreadsheet formula.

**Deploying a backend change:** paste `core.js` (as a script file named `core`) and `Code.gs` into the Apps Script
project. Run `setup()` once (it adds any missing header cell, and the Inquiries tab), then Deploy > Manage deployments >
Edit > Version: New version. The `/exec` URL stays the same.

## Writing a blog post

1. On GitHub, open `_posts` and choose **Add file > Create new file**.
2. Name it `YYYY-MM-DD-short-name.md` (lowercase, dashes). It will be at heurastudios.com/blog/short-name/.
3. Start with these lines. Leave out `report` if there's no PDF. Then write the post in Markdown below them.

   ```
   ---
   title: "What we learned from Arche 0.22"
   description: "One or two sentences. The blog list, search results and link previews show it."
   author: Ryan
   report: /reports/heura-eval-005.pdf
   ---
   ```

4. **Commit changes.** The site updates in about a minute.
5. For a report, upload the PDF to `reports/` with the name from the `report` line. For a picture, upload it to
   `img/blog/` and use `![What the picture shows](/img/blog/name.png)`.

If the front matter is broken (a missing `---`, or a title containing a colon but no quotes), GitHub emails the
error and the site keeps its last good version. Fix the file and commit again.

## Media and icons

- **Screen recording** (`img/notebook-run*`): a sample model written in its notebook's script.md, then Train v1 and
  its first run, in the real Studio, signed in as William Wu, in desktop and phone sizes, light and dark, as `.mp4`
  (H.264, for iPhones) and `.webm`, each with a `.webp` poster. 60 frames a second, at the screen's density: 2880 x
  1800 on a computer (the page at 1280 x 800), 1170 x 1800 on a phone (390 x 600). Frames that big come slower than
  that here, so the tool plays the scene slowed down (5x on a computer, 3x on a phone) and speeds the frames' times
  back up. The pointer is the tool's own, an iris arrowhead that glides and sends out a ring on a click (a fingertip
  on a phone). To re-record: `python3 _tools/record-notebook.py <app checkout> img` with `--dark`, `--phone` and
  `--phone --dark` (about 5 minutes each). Needs ffmpeg and Playwright for Python. The Studio runs with stand-ins for
  Heura Arche (it answers as its brief says) and its trainer (seconds a run, and a LoRA a real one's size); the
  caption says they're simulated. Last recorded Nov 18, 2026, from the app's `live` (48e2b71): Rosé Pine Dawn in
  light, Rosé Pine in dark.
- **Tool recordings** (`img/tools/<clip>*`): one short clip per tool on the Tools page, a close-up of its panel in the
  real Studio at 640 x 480, light and dark (`<clip>-dark.*`), in the same three files. To re-record:
  `python3 _tools/record-tools.py <app checkout> img/tools`, then again with `--dark`; `--only fine-tune,serving`
  re-records some. It runs the Studio with stand-in engines (no GPU, no real OpenAI), with sample data for a
  made-up store, Fernbrook. Each tool's steps are a function in the script, named for its `clip:`. Last recorded
  Oct 29, 2026, from the app at f6764a9.
- **Side margins and the sheet:** on screens 1360px and wider, the Studio's canvas (its grey and dot grid) fills the
  margins and stays still while the page scrolls (`body::before` in `site.css`, fixed), and the column is a sheet
  on it, the page's color with an edge (`main::before`). The header covers only the column, as the sheet's top
  (`.ov-top::before`), so beside it the canvas runs up to the top of the screen.
- **Pipeline wires** (`_includes/wires.html`): decoration that makes a box a node on a pipeline, wires running in
  from the screen's left edge and out past its right edge, beside each legal page's title (from 1100px, `legal.css`).
- **The footer is a pipeline** (`_includes/footer.html`, styled in `site.css`): its sections are Studio nodes on
  the Studio's dark canvas, wired in order and across. Wires that pass a node run under or over it (`.ov-lane`);
  the nodes sit at fixed heights, so moving one means moving its wires' ends too. On a phone the nodes stack.
  `_tests/margins.test.js` checks all of this.
- **Logo and icons** (`favicon.*`, `icon-512.png`, `apple-touch-icon.png`, `og-image.png`): all drawn from one
  drawing in `_tools/make-logo.py`. Run `python3 _tools/make-logo.py` (add `--card` to also update the link-preview
  card). If the drawing changes, update the inline SVG in `_includes/logo.html` to match. The tests check that.
