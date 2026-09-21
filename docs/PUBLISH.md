# Publishing this

Everything here is written out so publishing is a paste rather than a writing
job. The loop does not do any of it, because pushing a repository and putting a
page on the internet are outward facing and are the owner's call.

## 1. The repository

Create it as `tokenlab`, public, and push. Then set the About box, because a
repository with no description is one word on a profile listing and a recruiter
reads the listing before they read anything else.

**Description**, paste exactly:

```
An interactive page that shows what tokenizers do to Greek text, and what it costs. Type Greek, watch it shatter into tokens, watch the price update.
```

It deliberately contains no numbers. A description lives on GitHub where
`npm run check` cannot reach it, so anything in it would eventually go stale
without anything noticing.

**Topics**, paste as a list:

```
greek  tokenizer  bpe  tiktoken  typescript  data-visualization  llm  nlp  open-data  reproducible-research
```

## 2. Pages

`.github/workflows/pages.yml` is already in the repository. It builds on every
push to `main` and publishes `dist/`. It needs one setting turned on once:

- Settings, Pages, Build and deployment, Source: **GitHub Actions**.

The build runs `npm run build`, which runs both gates, so a push that breaks a
number in the README or draws text that was never typed does not publish.

## 3. The line that matters most

The recruiter audit put it plainly: the whole pitch is "open the page and watch
it happen", and until there is a URL there is nowhere to click. Once Pages is
live, add this as the first line under the title in `README.md`, above the
opening paragraph:

```markdown
**[Open it](https://USERNAME.github.io/tokenlab/)** and type Greek into it.
```

and set the same URL as the repository Website so it shows in the About box.

Then add `"homepage": "https://USERNAME.github.io/tokenlab/"` to `package.json`.

## 4. What is deliberately not automated

The recording, `docs/shatter.gif`, is committed rather than built in CI. It
needs a real browser and ffmpeg, and a 2.5 MB binary regenerated on every push
would bloat the history for no gain. Re-record it with `npm run capture` when
the page changes in a way the picture should show, and commit the result.
