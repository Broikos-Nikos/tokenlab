# The audits

Commit messages in this repository cite identifiers like `DR-F1` and `HE-F2`.
This is what they refer to.

Each audit was run by a separate agent against one assigned perspective, with
no write access to the project: it produced a findings file and a list, and the
fixes were separate work afterwards. Nobody audited their own code twenty
minutes after writing it, which is the only reason any of this was found.

As of 2026-09-21: **102 findings, 49 closed, 53 open**, across 7 perspectives of nine defined.

The full audit files are not in this repository. They are working documents of
the workspace this project was built in, and they quote intermediate states of
files that no longer exist. What follows is the list itself, which is the part
a commit message needs to resolve.

## `HS`, hostile stranger

The hostile stranger: empty input, a megabyte of it, emoji, RTL, a phone sized window, keyboard only.

16 findings, 7 closed.

| id | severity | status | finding |
|---|---|---|---|
| `HS-F1` | high | fixed, tick 4 | The headline number is a placeholder on every fresh load |
| `HS-F2` | high | fixed, tick 4 | One pasted U+FFFD swallows the rest of the text into a single chip, because isReadable cannot tell a decoder failure from a real replacement character |
| `HS-F3` | high | fixed, tick 4 | The encoding buttons lie while a vocabulary loads and can end up lying permanently |
| `HS-F10` | medium | fixed, tick 4 | Nothing the page computes is ever announced |
| `HS-F11` | medium | open | Right to left text is laid out in reverse reading order |
| `HS-F4` | medium | open | Typing kills the language toggle and deletes the comparison |
| `HS-F5` | medium | open | Every keystroke re-tokenizes everything, so a large paste drops the page to about 3 fps |
| `HS-F6` | medium | open | The token counter stutters backwards on every keystroke |
| `HS-F7` | medium | fixed, tick 4 | Anything typed before the vocabulary arrives is silently thrown away |
| `HS-F8` | medium | fixed, tick 4 | With JavaScript off the built page is a styled skeleton with no explanation |
| `HS-F9` | medium | open | The findings table is cut off on a phone and unreachable by keyboard |
| `HS-F12` | low | fixed, tick 4 | 1 pieces of this text cost more than one token each |
| `HS-F13` | low | open | Number formatting is inconsistent inside one view |
| `HS-F14` | low | open | The truncation message is dressed as a whitespace token |
| `HS-F15` | low | open | Tabs, newlines and double newlines are indistinguishable, and .tok--newline is dead |
| `HS-F16` | low | open | The only explanation of a red chip is a mouse only tooltip, and its wording is wrong |

## `ME`, measurement

The measurement auditor: is every number reproducible, is the sample size stated, is any comparison unfair.

20 findings, 11 closed.

| id | severity | status | finding |
|---|---|---|---|
| `ME-F1` | high | fixed, tick 4 | Both token counts in the README alt text are hand typed and wrong: 37 and 82, not 26 and 70, which falsifies the repo claim that no number is typed by hand |
| `ME-F2` | high | fixed, tick 4 | The per register claim is mostly a sentence length artefact: tokens per Greek word is flat at 2.46 in four of five registers, and understate by a third is really 9 percent |
| `ME-F3` | high | fixed, tick 4 | The page prints a dollar figure for a named model using an encoding that model does not use, up to 165 percent inflation. pricing.json already carries the encoding field and main.ts never reads it |
| `ME-F4` | high | fixed, tick 4 | The headline ratio is never length controlled. Greek is 2.015x the UTF-8 bytes of English, so on o200k the tokenizer contributes only 3.6 percent. On cl100k it genuinely contributes 2.55x. The README presents both as the same kind of finding |
| `ME-F10` | medium | open | The corpus has no digits and one Latin word, so the technical register does not describe technical Greek |
| `ME-F11` | medium | open | The measurement silently assumes NFC input, and NFD Greek costs 39 percent more |
| `ME-F12` | medium | open | davinci-002 attributed to the wrong encoding, and the GPT-5.x and GPT-6 attributions are unsourced |
| `ME-F13` | medium | open | The tokens per word column invites a division that exceeds the headline, because word is not the same unit in the two languages |
| `ME-F5` | medium | open | The measured ratio is restated on the page and in the README in two forms that do not mean what was measured |
| `ME-F6` | medium | fixed, tick 4 | p50k and r50k are one measurement presented as two, with no note saying so |
| `ME-F7` | medium | fixed, tick 17 | Per register ratios quoted to two decimals with no interval and no n, against the README own rule |
| `ME-F8` | medium | fixed, tick 17 | The last printed digit of every interval is Monte Carlo noise |
| `ME-F9` | medium | fixed, tick 7 | Two of the eight formal pairs are the Universal Declaration of Human Rights, contradicting the stated corpus method |
| `ME-F14` | low | fixed, tick 5 | No number in this repository is typed by hand is false on at least four counts |
| `ME-F15` | low | fixed, tick 5 | findings.json is the only thing the page reads is false |
| `ME-F16` | low | open | Three small correctness issues in the measurement code |
| `ME-F17` | low | open | 2 MB o200k vocabulary is the size on disk, not the size that arrives |
| `ME-F18` | low | open | Four numbers are produced, never read and never explained |
| `ME-F19` | low | fixed, tick 15 | npm run measure produces a diff every day even when nothing changed |
| `ME-F20` | low | open | The word counting regex is duplicated verbatim, so word has two definitions |

## `PA`, performance access

Performance and access: bytes on first paint, main thread cost, contrast, focus, screen readers.

18 findings, 7 closed.

| id | severity | status | finding |
|---|---|---|---|
| `PA-F1` | high | fixed, tick 4 | Clicking an encoding while the first vocabulary loads leaves the wrong encoder behind a pressed button, no generation guard |
| `PA-F2` | high | fixed, tick 4 | Text typed before the vocabulary arrives is silently discarded when boot seeds the textarea |
| `PA-F3` | high | fixed, tick 4 | Every chip is rebuilt every frame and the 540ms stagger makes chips past index 60 permanently invisible while typing |
| `PA-F4` | high | fixed, tick 4 | --text-faint is 3.47:1 on ink and 3.22:1 on ink-lift, failing AA in 10 places including the interval column |
| `PA-F5` | high | fixed, tick 4 | textarea:focus outline:none beats the :where() focus-visible rule on specificity, so the main control has no visible focus |
| `PA-F6` | high | fixed, tick 4 | No live region at all: nothing the page computes is ever announced, and live-summary is a plain p |
| `PA-F10` | medium | open | Control boundaries effectively invisible, the select does not read as a control |
| `PA-F11` | medium | open | tickTo starts an uncancelled animation loop on every render |
| `PA-F12` | medium | open | Full viewport grain overlay forces a blend of the whole viewport on every repaint |
| `PA-F13` | medium | open | The README contradicts itself about network at runtime |
| `PA-F7` | medium | open | MAX_CHIPS caps the cheap half of the work and leaves tokenize and segment uncapped |
| `PA-F8` | medium | open | The token list is a wall of noise for a screen reader with no way past it |
| `PA-F9` | medium | fixed, tick 6 | The 2MB chunk is two round trips deep with no loading state |
| `PA-F14` | low | open | Whitespace marker and table rules fall below every non text contrast threshold |
| `PA-F15` | low | open | @font-face uses the removed woff2-variations format keyword with no fallback source |
| `PA-F16` | low | open | Truncation chip styled as a whitespace token, and MAX_CHIPS caps segments not tokens |
| `PA-F17` | low | open | prefers-reduced-motion read once and never re-read |
| `PA-F18` | low | open | Small first paint wins left on the table |

## `DE`, design eye

The design eye: type, spacing, rhythm, colour, motion, and whether it reads as designed or as a template.

13 findings, 4 closed.

| id | severity | status | finding |
|---|---|---|---|
| `DE-F1` | high | fixed, tick 4 | Headline ratio is missing on first paint, boot never calls setEncoding |
| `DE-F2` | high | fixed, tick 4 | Four different kinds of number share one typographic costume, so no number reads as the claim |
| `DE-F3` | high | fixed, tick 4 | Page opens on o200k, the one encoding that does not shatter, so the finding is absent at second zero |
| `DE-F4` | high | fixed, tick 4 | Entrance stagger restarts on every keystroke and the chip you just typed is the slowest to appear |
| `DE-F10` | medium | open | Seven durations, two near identical easings, one rolling figure among four static ones |
| `DE-F11` | medium | open | Compare card is permanently alarm red whatever its value, so the red means nothing |
| `DE-F5` | medium | open | Type scale: a 34px hole in the middle, ten steps piled into a 6px band at the bottom |
| `DE-F6` | medium | open | Spacing and radii are nineteen ad hoc values, not a scale |
| `DE-F7` | medium | open | Four encoding hues are a rainbow over an ordinal series, and the oldest sits nearest the alarm |
| `DE-F8` | medium | open | Token box pinned at its 7rem minimum and the hero column ends 127px short of the rail |
| `DE-F9` | medium | open | Right rail is three identical cards, the dashboard template shape |
| `DE-F12` | low | open | Headline ratio takes the encoding hue, so the worst number can turn calm teal |
| `DE-F13` | low | open | The two best small decisions are under committed to the point of invisibility |

## `DR`, deep reviewer

The deep reviewer: correctness, read as code rather than as comments.

13 findings, 9 closed.

| id | severity | status | finding |
|---|---|---|---|
| `DR-F1` | high | fixed, tick 9 | segment() decodes growing prefixes, but gpt-tokenizer decode() is stateful: a shared TextDecoder with stream:true and no flush. Residue from one call corrupts the next, so polytonic Greek, Coptic, Linear B, Korean and some emoji are drawn as characters nobody typed, with cost badges on capped runs |
| `DR-F2` | high | fixed, tick 11 | A vocabulary that fails to load leaves the page permanently dead, no message and no way back |
| `DR-F3` | high | fixed, tick 11 | Clicking an encoding while the first vocabulary is loading is silently undone 1.8 seconds later by the heal timer |
| `DR-F4` | high | fixed, tick 10 | check-claims matches a flattened whole document, so a claim can pass off a different row. The entire r50k table line can be deleted and all 30 claims still pass |
| `DR-F5` | high | fixed, tick 10 | The corpus size is hand typed at both ends of the check: Forty sentence pairs is a literal in the checker and f.corpus.pairs is never read |
| `DR-F10` | medium | open | ?pair=N accepts nonsense and clamps in silence, so a pinned link goes stale without looking stale |
| `DR-F6` | medium | fixed, tick 14 | The page still tells the story the README says is wrong, the raw ratio with no length control |
| `DR-F7` | medium | fixed, tick 10 | identically, to the token is asserted by comparing two rounded aggregates |
| `DR-F8` | medium | open | Nothing ties the recording pinned pair to the sentence whose counts the README quotes |
| `DR-F9` | medium | open | capture.mjs leaves Chromium running, loses the recording, and can truncate the committed GIF |
| `DR-F11` | low | open | worstPair compares an unrounded candidate against a rounded incumbent |
| `DR-F12` | low | fixed, tick 9 | Segment.start is computed, documented and never read |
| `DR-F13` | low | fixed, tick 15 | The page reports a measurement date that predates the corpus it measured |

## `RC`, recruiter

The recruiter, ten seconds, not technical: does anything here stop the scroll.

13 findings, 7 closed.

| id | severity | status | finding |
|---|---|---|---|
| `RC-F1` | high | open | There is nowhere to click to see it working: one URL in the README and it is localhost, two thirds of the way down |
| `RC-F2` | high | fixed, tick 12b | A permanent empty red error bar on every load: display:flex on .load-error beats the hidden attribute. Regression introduced in tick 11 |
| `RC-F3` | high | fixed, tick 13 | The first two sentences assume the reader knows what a tokenizer is and why Greek matters |
| `RC-F4` | high | fixed, tick 13 | No repository description and no topics, so on a profile listing it is one word |
| `RC-F10` | medium | fixed, tick 13 | The two pictures meant to be compared are captioned in two different units |
| `RC-F11` | medium | open | Forwarding the link produces a blank card, and the tab has no icon |
| `RC-F5` | medium | open | The moving picture is a scroll and 2.5 MB away, and the lighter webm is gitignored |
| `RC-F6` | medium | open | The loop spends two thirds of a second on the answer and a second and a half frozen on the problem |
| `RC-F7` | medium | fixed, tick 14 | Five different ratios in twenty seconds and no way to tell which one is the claim |
| `RC-F8` | medium | open | The one box a non technical reader can read instantly says n/a on arrival |
| `RC-F9` | medium | fixed, tick 13 | The second paragraph of the README is about the README |
| `RC-F12` | low | fixed, tick 14 | The columns of the main table are labelled in terms a non technical reader cannot use |
| `RC-F13` | low | open | The project name is the smallest text on its own page |

## `HE`, hiring engineer

The hiring engineer, three minutes: does this person ship and measure, and would you open a second repository.

9 findings, 4 closed.

| id | severity | status | finding |
|---|---|---|---|
| `HE-F1` | high | fixed, tick 17 | The vocabulary penalty, the figure the project calls the one worth publishing, is the only number with no interval, and bootstrapped with the repo own sampler o200k is -2.0% to +7.6%, straddling zero. The README own rule says a ratio is never quoted without its interval |
| `HE-F2` | high | fixed, tick 18 | check:loading is the one gate that would have caught the one defect that reached a reader, and it is the one gate nothing runs automatically |
| `HE-F3` | medium | fixed, tick 18 | npm run capture, the stated provenance for the picture at the top, does not run from a clean clone |
| `HE-F4` | medium | open | Removed describes a swap, and the paragraph does not say who wrote the replacements |
| `HE-F5` | medium | open | The sample size is not next to the number in either place the number leads |
| `HE-F6` | medium | open | The one limitation the repository could measure in ten lines, NFD Greek, is answered with an adjective |
| `HE-F7` | medium | open | The commit log cites DECISIONS.md, DEVLOG.md and a finding ID scheme that are not in this repository |
| `HE-F8` | low | open | npm run measure prints an interval in a form the README does not use |
| `HE-F9` | low | fixed, tick 18 | CI never runs on a pull request, so the gates only fire after main has moved |

## One note on the log itself

The commit `a8631e1`, "Close every high finding from the four audits", is the
one message in this history that says what was typed rather than what was
wrong, and it is the batch commit a reader reaches first when reading upward.
It stays as it is: rewriting it would be tidying the evidence after the fact,
and the audit that pointed it out is in the table above.
