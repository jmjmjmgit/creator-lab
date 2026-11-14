# Plan: Creator Lab for LinkedIn posts

Goal: the same tool you have now (collect a creator's posts, label each script, filter by topic and hook, compare performance, read the scripts, open the originals, replay the analysis), working on a LinkedIn profile instead of an Instagram account.

This plan is written for a local Claude Code session working in this repo. Work through it in order. Each phase ends with something you can run and check, and nothing in a later phase is needed for an earlier one to work.

## The decisions this plan makes

**One app with two platforms, not a copy.** Each run gets a `platform` field (`instagram` or `linkedin`) chosen in the New analysis dialog. The pipeline, classifier, caching, Connections dialog, `.env` and dashboard stay shared, and a small per-platform config decides the scraper, field mapping, labels and wording. Your existing Instagram runs keep working untouched, and every fix lands in both. A forked copy would be faster on day one and double the maintenance after that.

**The written post is the script.** On Instagram the script is speech, so the app transcribes first. On LinkedIn the post text is the script, so text, image, carousel and poll posts go straight to classification with no transcription step. That makes LinkedIn cheaper and faster per post than Reels. Video posts are classified on their written text in version 1. Transcribing LinkedIn video is Phase 6, because LinkedIn video often streams in pieces (HLS), which the current downloader does not handle.

**Reactions replace views.** LinkedIn only shows outsiders reactions, comments and reposts. Views and impressions are private to the author. The Reels dashboard is built around "likes per 1,000 views", so the metric layer is the biggest real change (Phase 3). The LinkedIn dashboard ranks by reactions, with comments per 100 reactions as the response rate and an optional "vs this creator's median" index for comparing posts over time.

**No-login scraper only.** Use an Apify actor that does not ask for your LinkedIn cookie or password, so your own account is never involved. The default is HarvestAPI's LinkedIn Profile Posts Scraper (`harvestapi~linkedin-profile-posts` in API calls, listed at about $1.50 to $2 per 1,000 posts). LinkedIn's User Agreement (section 8.2) bans scraping, so keep this to personal research, don't resell or republish the data, and expect the actor to break occasionally when LinkedIn changes things.

## Phase 0: Get a real sample before writing code (30 minutes, about 5 cents)

The scraper's exact input names and output fields could not be verified from the cloud session, so the field mapping must come from real output, not guesses.

1. In the Apify console, open the HarvestAPI LinkedIn Profile Posts Scraper and run it once on your own profile with a limit of 20 posts.
2. Note the exact input field names it used (profile URL or identifier, post limit, and any options for reposts or comments). Write them at the top of this file.
3. Export the dataset as JSON and save it as `tests/fixtures/linkedin-posts.json`. Strip anything private before committing. Your own public posts are fine.
4. In the sample, find the fields for: post ID or URN, post URL, author identifier and name, full text, posted date, reaction count, comment count, repost count, post type (text, image, video, document, poll, repost), image URLs, document or carousel URL, video URL and thumbnail. Record the field name for each one in a table here. If a field doesn't exist, write "missing". The UI treats missing values as unknown, never zero.
5. Open three of the image and video URLs in a browser to confirm the hostnames (expected: `media.licdn.com` for images, `dms.licdn.com` for video).

Done when: the fixture is saved and the mapping table is filled in.

## Phase 1: Shrink the classification prompt (1 hour, shared with Instagram)

Measured with the current code, a typical 1,000-character post produces about 7,000 input tokens, because every segment gets its own role question with the full list of eight role definitions repeated. LinkedIn posts have many short lines, so this matters more there.

1. In `lib/schema.mjs`, define the roles once in the request and make each `role_sN` question refer to them instead of repeating the criteria. Keep the answer format the same, so `parseResult` still validates every answer against the allowed role IDs.
2. Update `llmMessages` in `lib/providers.mjs` the same way, and put the fixed instructions first and the post text last, so providers that cache repeated prompt prefixes can reuse them.
3. Leave the Jev request shape alone, since Jev expects one question per segment. Apply the trim only to the LLM path, or keep the Jev builder as it is.
4. Bump `VERSION` (for example `script-anatomy-v2`) so old cached labels aren't mixed with new ones.

Done when: `npm test` passes and a 1,000-character post builds a prompt of about 2,500 tokens instead of 7,000. The measurement script approach: build a request from a long sample and divide the character count by about 3.6.

## Phase 2: Platform plumbing (half a day to a day)

1. `lib/platforms.mjs` (new): one config object per platform holding the Apify actor ID, how to build its input from `{creator, limit}`, the normalize function, the allowed media hosts, the handle validation pattern, the schema variant and the UI wording (unit names like "Reel" and "post", metric names, link text such as "Original Reel" and "Original post").
2. `lib/data.mjs`: keep `normalize` for Instagram and add `normalizeLinkedIn(row)` based on the Phase 0 mapping. For LinkedIn posts it returns the same post shape with `transcript` filled from the post text, so they skip transcription: `{text, segments, source:'post'}`, with status `transcribed`. Segments come from line breaks and paragraphs (LinkedIn's natural units), falling back to sentences, with no timestamps. New fields: `reactions`, `reposts`, `format` (text, image, video, document, poll). `likes` is set to reactions so existing code keeps working, and `views` and `plays` stay null.
3. Skip reposts that have no commentary of their own, because that text belongs to someone else. Exclude polls and posts under six words with the existing `excludedReason` mechanism ("Too little written content").
4. `lib/pipeline.mjs`: store `platform` on the job (default `instagram`, so old runs load unchanged). Pick the scraper and normalizer from the platform config. Change the hardcoded "Reels" in event messages to the platform's unit name. Don't require a transcription key for LinkedIn runs unless video transcription is turned on.
5. `lib/providers.mjs`: make `startScrape` take the actor ID and input from the platform config. The existing `maxTotalChargeUsd` cap keeps working for pay-per-result actors. Add the LinkedIn hosts from Phase 0 to the allowlist in `mediaURL`, per platform, rather than widening it for every run.
6. `lib/schema.mjs`: add a LinkedIn variant of the dimensions with the same eight labels and reworded questions. "First spoken sentence" becomes the first line. The hook question asks what makes someone click "see more", and the opening becomes the text above the fold, about the first 200 characters or first three lines (check this against real posts in the fixture). "Spoken CTA" becomes the CTA in the closing lines. Add `career` (jobs, hiring, workplace) and `leadership` (managing people, teams, culture) to the topic list, since those are common on LinkedIn. Use a different schema version, such as `linkedin-script-v1`, so caches never cross platforms.
7. `server.mjs` and the New analysis form in `public/index.html`: add a platform picker. The LinkedIn handle field accepts a profile URL or the identifier after `/in/` (letters, numbers and hyphens, 3 to 100 characters).

Done when: importing the Phase 0 fixture through the existing import path produces a LinkedIn run with classified posts, using the hcnsec classifier, and the tests below pass.

## Phase 3: Dashboard metrics and wording (about a day, the largest piece)

1. `lib/data.mjs` `metrics()` and `public/research.mjs`: make the metric list come from the platform. Instagram keeps views and plays. LinkedIn offers reactions, comments and reposts as the reach-style metric, and comments per 100 reactions as the rate. Add "vs creator median" (post reactions divided by the median for the run) so a run spanning months isn't dominated by follower growth. The graph's x-axis is reactions and the y-axis is comments per 100 reactions.
2. Add Post format as a filter and comparison dimension. It comes free from the scraper, so it needs no model call. "Carousels vs text-only for this creator" is one of the most useful LinkedIn questions.
3. `public/app.js` and `public/index.html`: replace every "Reel", "views", "plays" and "Instagram handle" string with the platform's wording. A search for those words finds them all: about 28 matches in `app.js`, 27 in `index.html` and 6 in the record files. Hide the duration filter and the video preview for non-video posts.
4. `public/record.js` and `record.html`: same wording and metric swap for the replay view.
5. The schema dialog text ("Jev receives the spoken transcript...") should describe whichever classifier is active and say the written post is the script on LinkedIn.

Done when: a LinkedIn run reads naturally with no mention of Reels, views or speech, and an Instagram run looks exactly as it does today.

## Phase 4: Thumbnails and the post wall (half a day)

1. Image posts use their first image and carousels use the document cover, both through the existing `/media/` route, so images are cached locally like Reel thumbnails.
2. Text-only posts have no image. Generate an SVG card showing the first line of the post in the dashboard style. `lib/demo.mjs` already draws SVG art, so reuse that approach.
3. The inspector shows the full post text with the line breaks preserved, the role of each segment, and a link to the original post.

Done when: the thumbnail wall has no broken images on the fixture run.

## Phase 5: Live pilot and cost check (1 hour)

1. Run a real 20-post collection on your own profile with an Apify cap of $1.
2. Check the labels by hand on 10 posts: does the hook label match what makes the first lines work? Adjust the question wording in the LinkedIn schema if a label is consistently off, bump its version, and rerun.
3. Before any larger run, open hcnsec's usage log and read the actual charge per classification request. Your account's earlier history averaged about ¥10.56 per request across 381 requests. Those were probably large coding-assistant calls, but if classification costs anywhere near that, 1,000 posts would use your whole balance. A 2,500-token request should cost a tiny fraction of a yuan. If it doesn't, switch `.env` to DeepSeek's official API, at roughly $1 to $2 per 1,000 posts.

Done when: 20 real posts are labeled sensibly and you know the real cost per post.

## Phase 6: Optional extras, in order of value

1. **Read images and carousels.** Many LinkedIn posts put the main message in a graphic. Add an optional step that sends the image or carousel pages to a vision model and appends the extracted text to the script, marked as `[image text]`. Text-layer PDFs can be read locally for free. Cost is about $0.10 to $1.50 per 1,000 posts depending on the model. hcnsec announced a free multimodal model (step-5-preview), which is worth testing first.
2. **Transcribe video posts.** Reuse the Groq path. ffmpeg can read an HLS playlist URL directly, so add a path that passes the URL to ffmpeg instead of downloading the bytes first. Cost is about 10 cents per 1,000 posts. Video posts then get two scripts (written and spoken), shown as separate tabs in the inspector.
3. **Comments on top posts.** Scrape comments only for each creator's top 10% of posts by reactions, and add a "what people responded to" view. Expect about $2 to $6 per 1,000 posts at that scope. Scraping comments on everything would cost $20 to $60 per 1,000.
4. **Several creators in one comparison.** The app takes one handle per run today. Comparing creators on LinkedIn needs follower counts to be fair, which means an extra profile scrape per creator.

## Tests to add

Run all of these with `npm run check && npm test`. They make no paid calls.

1. `normalizeLinkedIn` on the Phase 0 fixture: IDs, text, counts, formats and dates come through. Missing counts stay null, and reposts without commentary are skipped.
2. Segmenting by line breaks gives no timestamps and caps at 40 segments, and the opening is the above-the-fold text.
3. The LinkedIn schema rejects off-list labels, and its cache keys never match Instagram's for the same text.
4. `metrics()` with reactions, comments per 100 reactions and the creator-median index, including posts with unknown counts.
5. `mediaURL` accepts `media.licdn.com` and `dms.licdn.com` only for LinkedIn runs, and still rejects lookalike hosts such as `licdn.com.evil.com`.
6. Pipeline: import a LinkedIn fixture, classify through a mocked LLM, then confirm no transcription request is ever made for text posts.
7. Old Instagram runs without a `platform` field still load and display.

## Expected running cost

Per 1,000 LinkedIn posts, after the Phase 1 prompt trim: scraping $1.50 to $2, classification about $1 with DeepSeek V4.1 Flash at official prices (unknown on hcnsec until Phase 5), and no transcription. The optional image reading adds $0.10 to $1.50, video transcription about $0.10, and comments on top posts $2 to $6. A 20-post pilot costs a few cents. Tracking 20 creators at 30 posts a month comes to about $2 a month, and Apify's free monthly credit covers most of the scraping.

## Effort

Phases 0 to 5 come to about three to four focused days of work, or several Claude Code sessions. Phase 3 is the biggest and Phase 0 is the one not to skip. Phase 6 items are independent, half a day each.
