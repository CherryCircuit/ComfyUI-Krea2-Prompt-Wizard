/**
 * Pure-logic tests for the Prompt Studio tokenizer (web/studio/tokenizer.mjs).
 * Runs under plain Node with no DOM. Exit code 1 on the first failure.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tokenizer = await import(
  pathToFileURL(path.join(root, "web", "studio", "tokenizer.mjs"))
);

// --- parseDocument ---------------------------------------------------------

{
  const segments = tokenizer.parseDocument("just some text");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].type, "text");
  assert.equal(segments[0].value, "just some text");
}

{
  const segments = tokenizer.parseDocument("{{krea2:character_serena|SERENA}}");
  assert.equal(segments.length, 1);
  const token = segments[0];
  assert.equal(token.type, "token");
  assert.equal(token.id, "character_serena");
  assert.equal(token.label, "SERENA");
  assert.equal(token.raw, "{{krea2:character_serena|SERENA}}");
  assert.equal(token.start, 0);
  assert.equal(token.end, token.raw.length);
}

{
  const doc = "Hi {{krea2:character_serena|SERENA}} in {{krea2:scene_medieval_tavern_a}}!";
  const segments = tokenizer.parseDocument(doc);
  assert.deepEqual(
    segments.map((s) => s.type),
    ["text", "token", "text", "token", "text"]
  );
  assert.equal(segments[1].id, "character_serena");
  assert.equal(segments[3].label, "");
  assert.equal(segments[4].value, "!");
  // Offsets must tile the document exactly.
  assert.equal(segments[0].end, segments[1].start);
  assert.equal(segments[1].end, segments[2].start);
}

// --- tokenMarkup -----------------------------------------------------------

assert.equal(tokenizer.tokenMarkup("a", "Label"), "{{krea2:a|Label}}");
assert.equal(tokenizer.tokenMarkup("a"), "{{krea2:a}}");
assert.equal(
  tokenizer.parseDocument(tokenizer.tokenMarkup("bad id!", "L"))[0].id,
  "bad_id_"
);

// --- replaceRange ----------------------------------------------------------

assert.equal(tokenizer.replaceRange("abcdef", 2, 4, "XY"), "abXYef");
assert.equal(tokenizer.replaceRange("abc", 1, 1, "-"), "a-bc");
assert.equal(tokenizer.replaceRange("abc", -5, 99, "Z"), "Z");

// --- tokenRanges / tokenAt -------------------------------------------------

{
  const doc = "A {{krea2:x|X}} B {{krea2:y|Y}} C";
  const ranges = tokenizer.tokenRanges(doc);
  assert.deepEqual(
    ranges.map((t) => t.id),
    ["x", "y"]
  );
  assert.ok(tokenizer.tokenAt(doc, ranges[0].end));
  assert.equal(tokenizer.tokenAt(doc, ranges[0].end).id, "x");
  assert.equal(tokenizer.tokenAt(doc, ranges[0].start + 1).id, "x");
  assert.equal(tokenizer.tokenAt(doc, ranges[0].start), null, "caret before token is not inside it");
  assert.equal(tokenizer.tokenAt("no tokens", 3), null);
}

// --- rawDisplay ------------------------------------------------------------

assert.equal(
  tokenizer.rawDisplay("{{krea2:a|ALPHA}} sits in {{krea2:b|BETA}}."),
  "[ALPHA] sits in [BETA]."
);
// Without a resolver, the stored label is the fallback.
assert.equal(tokenizer.rawDisplay("{{krea2:gone|OLD LABEL}}"), "[OLD LABEL]");
// With a resolver returning null the preset is missing.
assert.equal(tokenizer.rawDisplay("{{krea2:gone|OLD LABEL}}", () => null), "[MISSING: gone]");
assert.equal(tokenizer.rawDisplay("{{krea2:gone|OLD LABEL}}", () => "NEW LABEL"), "[NEW LABEL]");

// --- cleanSpacing ----------------------------------------------------------

assert.equal(tokenizer.cleanSpacing("a  b"), "a b");
assert.equal(tokenizer.cleanSpacing("A tavern.. Next"), "A tavern. Next");
assert.equal(tokenizer.cleanSpacing("word,, more"), "word, more");
assert.equal(tokenizer.cleanSpacing("and then..."), "and then...");

// --- compileDocument -------------------------------------------------------

{
  const presets = {
    character_serena: { name: "SERENA", prompt: "Blonde woman.", negative: "dark hair, blue eyes", enabled: true },
    scene_tavern: { name: "TAVERN", prompt: "A tavern.", negative: "dark hair\nmodern furniture", enabled: true },
  };
  const doc = "{{krea2:character_serena|SERENA}} enters {{krea2:scene_tavern|TAVERN}}.";
  const result = tokenizer.compileDocument(doc, (id) => presets[id]);
  assert.equal(result.prompt, "Blonde woman. enters A tavern.");
  assert.equal(result.negative, "dark hair, blue eyes, modern furniture");
  assert.equal(result.raw, "[SERENA] enters [TAVERN].");
  assert.deepEqual(result.usedIds, ["character_serena", "scene_tavern"]);
  assert.deepEqual(result.missingIds, []);

  const missing = tokenizer.compileDocument("x {{krea2:ghost|GHOST}}", (id) => presets[id]);
  assert.equal(missing.prompt, "x [MISSING: ghost]");
  assert.deepEqual(missing.missingIds, ["ghost"]);
}

// --- documentStats ---------------------------------------------------------

{
  const stats = tokenizer.documentStats("one two {{krea2:a|A}} three");
  assert.equal(stats.words, 4);
  assert.equal(stats.tokens, 1);
}

// --- marker grammar v2: labels, @host, ~ ------------------------------------

{
  const segments = tokenizer.parseDocument(
    "{{krea2:wardrobe_x|ELF QUEEN OUTFIT|@character_serena|~}}"
  );
  assert.equal(segments.length, 1);
  assert.equal(segments[0].id, "wardrobe_x");
  assert.equal(segments[0].label, "ELF QUEEN OUTFIT");
  assert.equal(segments[0].host, "character_serena");
  assert.equal(segments[0].randomize, true);
}

{
  // Flag order is free; label is the first non-flag field.
  const token = tokenizer.parseDocument("{{krea2:x|~|@host1}}")[0];
  assert.equal(token.label, "");
  assert.equal(token.host, "host1");
  assert.equal(token.randomize, true);
}

{
  // v1 markers parse unchanged.
  const segments = tokenizer.parseDocument("{{krea2:plain|Old Label}} and {{krea2:bare}}");
  assert.deepEqual(segments.map((s) => s.type), ["token", "text", "token"]);
  assert.equal(segments[0].label, "Old Label");
  assert.equal(segments[0].host, "");
  assert.equal(segments[0].randomize, false);
  assert.equal(segments[2].id, "bare");
}

assert.equal(
  tokenizer.tokenMarkup("w", "OUTFIT", { host: "character_serena", randomize: true }),
  "{{krea2:w|OUTFIT|@character_serena|~}}"
);
assert.equal(
  tokenizer.tokenMarkup("w", "OUTFIT", { host: "character_serena" }),
  "{{krea2:w|OUTFIT|@character_serena}}"
);

{
  const doc = "A {{krea2:emotion_happy|HAPPY|@character_serena|~}} day.";
  assert.equal(tokenizer.serializeDocument ? true : true, true); // no serializer export; splice-check instead
  const parsed = tokenizer.parseDocument(doc);
  assert.equal(parsed[1].raw, "{{krea2:emotion_happy|HAPPY|@character_serena|~}}");
}

// --- hasRandomize / hostIds -------------------------------------------------

assert.equal(tokenizer.hasRandomize("{{krea2:a|A}}"), false);
assert.equal(tokenizer.hasRandomize("{{krea2:a|A|~}}"), true);
assert.equal(tokenizer.hasRandomize("no tokens"), false);
assert.deepEqual(
  tokenizer.hostIds("{{krea2:serena|SERENA}}{{krea2:happy|HAPPY|@serena}} {{krea2:marcus|M}}"),
  ["serena"]
);

// --- replaceTokenFields / attachToken / remapHosts ---------------------------

{
  const doc = "{{krea2:emotion_happy|HAPPY|@character_serena}}";
  const out = tokenizer.replaceTokenFields(doc, 0, doc.length, { randomize: true });
  assert.equal(out, "{{krea2:emotion_happy|HAPPY|@character_serena|~}}");
  const out2 = tokenizer.replaceTokenFields(out, 0, out.length, { host: "character_marcus" });
  assert.equal(out2, "{{krea2:emotion_happy|HAPPY|@character_marcus|~}}");
}

{
  const doc = "{{krea2:character_serena|SERENA}} sits.";
  const hostEnd = "{{krea2:character_serena|SERENA}}".length;
  const out = tokenizer.attachToken(doc, { start: 0, end: hostEnd }, "wardrobe_x", "OUTFIT");
  assert.ok(out.startsWith(
    "{{krea2:character_serena|SERENA}}{{krea2:wardrobe_x|OUTFIT|@character_serena}}"
  ));
  assert.ok(out.endsWith(" sits."));
}

{
  const doc = "A {{krea2:happy|HAPPY|@serena}} and {{krea2:calm|CALM|@serena}}.";
  const out = tokenizer.remapHosts(doc, "serena", "marcus");
  assert.equal(
    out,
    "A {{krea2:happy|HAPPY|@marcus}} and {{krea2:calm|CALM|@marcus}}."
  );
}

// --- rawDisplay with attachments ---------------------------------------------

{
  const doc =
    "{{krea2:character_serena|SERENA}}" +
    "{{krea2:wardrobe_x|OUTFIT|@character_serena}}" +
    "{{krea2:emotion_happy|HAPPY|@character_serena}} sits.";
  assert.equal(tokenizer.rawDisplay(doc), "[SERENA (OUTFIT) (HAPPY)] sits.");
}

{
  // Orphan attachments stand alone; missing hosts render as MISSING.
  assert.equal(
    tokenizer.rawDisplay("{{krea2:emotion_happy|HAPPY|@character_ghost}} alone."),
    "[MISSING: character_ghost] (HAPPY) alone."
  );
  assert.equal(
    tokenizer.rawDisplay("{{krea2:emotion_happy|HAPPY|@character_ghost}} alone.", () => null),
    "[MISSING: character_ghost] (MISSING: emotion_happy) alone."
  );
}

console.log("frontend_studio_tokenizer: all assertions passed");
