# The fonts

Two typefaces, both subsets, each under a different licence. This file exists
because the repository once said both were under the SIL Open Font License while
shipping the Apache License next to one of them, with the copyright template
still reading `[yyyy] [name of copyright owner]`. Neither licence was satisfied
by that, and it is the first thing a reviewer checks.

## Manrope

- **Copyright 2019 The Manrope Project Authors**, <https://github.com/sharanda/manrope>
- **SIL Open Font License 1.1**, full text in [`Manrope-OFL.txt`](Manrope-OFL.txt)
- No Reserved Font Name is declared, so this subset may keep the name Manrope.

## Roboto Mono

- **Copyright 2015 The Roboto Mono Project Authors**, <https://github.com/googlefonts/robotomono>
- **Apache License 2.0**, full text in [`RobotoMono-LICENSE.txt`](RobotoMono-LICENSE.txt)
- Version 3.000, obtained from Google Fonts, which distributes Roboto Mono under
  Apache 2.0 rather than the OFL. That difference is the whole reason this file
  exists.

## What was done to them

Both files here are subsets, not the originals. Latin, Greek, punctuation and
currency, which is what takes Manrope from 140 KB to 31 KB and Roboto Mono from
170 KB to 48 KB. Greek is the point: a page about what tokenizers do to Greek
cannot fall back to Arial for the Greek half of a headline.

Reproduce them with [`../../tools/subset-fonts.sh`](../../tools/subset-fonts.sh),
which records the exact unicode ranges.

Both binaries carry their own copyright and licence records in the name table,
name IDs 0 and 13. They did not until 2026-09-21: `pyftsubset` drops the name
table unless told to keep it, so the subsets had been shipping with their
attribution stripped out.

Verify that for yourself:

```bash
python -c "from fontTools.ttLib import TTFont; \
  print([str(r) for r in TTFont('manrope-var.woff2')['name'].names if r.nameID in (0,13)])"
```
