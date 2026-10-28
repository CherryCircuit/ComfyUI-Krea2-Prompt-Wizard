/* Krea2 Prompt Wizard widget
 *
 * The main frontend component. It renders the visual builder inside
 * the wizard node's DOM widget and exposes a controlled-state API.
 *
 * The widget is resilient: if the wizard extension fails to load, the
 * node still works through the wizard_state_json STRING input.
 */
(function () {
  "use strict";

  const K = window.KREA2;
  const lightingScene = K.lightingScene;
  const {
    el,
    debounce,
    icon,
    emptyState,
    coerceState,
    uniqueRowId,
    compilePreview,
    fetchCompiledPreview,
    fetchLibrary,
    fetchMasterPresets,
    fetchSavedPresets,
    fetchLoras,
    fetchConflicts,
    saveSavedPresets,
    showToast,
    groupForCategory,
    paletteNearestName,
    hexToHsv,
    hsvToHex,
    sortedOptions,
  } = K.helpers;
  const fetchConceptColors = K.helpers.fetchConceptColors || function () { return Promise.resolve({}); };
  const saveConceptColors = K.helpers.saveConceptColors || function () { return Promise.resolve(); };
  const {
    GROUPS,
    GROUP_LABELS,
    GROUP_CATEGORIES,
    RANDOM_GROUP_CATEGORIES,
    CATEGORIES,
    CATEGORY_LABELS,
    PALETTE_COLORS,
    HAIR_PALETTE,
    ETHNICITY_SKIN,
    LIGHT_PALETTE,
  } = K.constants;
  const { render: renderPresetRow, makeStepper: makePresetStepper } = K.presetRow;
  const { show: showSearchableSelector } = K.searchableSelector;
  const { open: openLibraryEditor } = K.libraryEditor;
  const { materialize: materializeToNodes, createSubgraph: createSubgraphFromWizard } = K.materialize;
  const { render: renderShowWork } = K.inspectorView;

  /* Per-character appearance fields, grouped into display columns. Each
   * field is a combobox: preset options plus free typing. */
  const CHARACTER_APPEARANCE = [
    { group: "basics", key: "sex", label: "Sex", options: ["male", "female", "unspecified"] },
    { group: "basics", key: "age", label: "Age", options: ["child", "teenager", "young adult", "adult", "middle aged", "elderly"] },
    { group: "basics", key: "ethnicity", label: "Ethnicity", options: [
      "East Asian", "Chinese", "Japanese", "Korean", "Southeast Asian", "Vietnamese", "Filipino", "Thai",
      "South Asian", "Indian", "Pakistani", "Bangladeshi", "Sri Lankan",
      "Middle Eastern", "Arab", "Persian", "Turkish", "Israeli",
      "Mediterranean", "Greek", "Italian", "Spanish", "Portuguese",
      "Northern European", "Scandinavian", "British", "Irish", "French", "German",
      "Slavic", "Russian", "Polish", "Ukrainian", "Eastern European",
      "Central Asian", "Kazakh", "Mongolian",
      "Black / African", "African American", "Afro-Caribbean", "Afro-Latino",
      "Indigenous American", "Native American", "First Nations", "Inuit",
      "Pacific Islander", "Polynesian", "Hawaiian", "Maori", "Aboriginal Australian",
      "Latin American", "Mexican", "Brazilian", "Colombian", "Puerto Rican", "Cuban",
      "Multiracial", "Ambiguous",
      "Vulcan", "Romulan", "Klingon", "Ferengi", "Bajoran", "Cardassian", "Trill", "Betazoid", "Andorian",
      "Twi'lek", "Togruta", "Zabrak", "Mirialan", "Chiss", "Pantoran", "Miraluka", "Rodian", "Wookiee",
      "Asari", "Turian", "Salarian", "Krogan", "Quarian", "Drell", "Protoss",
      "Na'vi", "Martian", "Xenomorph", "Yautja", "Sontaran", "Ood", "Silurian", "Time Lord",
    ] },
    { group: "hair", key: "hair_style", label: "Hair style", options: [
      "straight", "wavy", "curly", "coily", "kinky", "afro", "braided", "cornrows", "dreadlocks",
      "ponytail", "high ponytail", "low ponytail", "pigtails", "twin tails", "bun", "top knot",
      "man bun", "space buns", "half-up half-down", "bob", "pixie cut", "undercut", "buzz cut",
      "shaved", "mohawk", "faux hawk", "mullet", "side part", "middle part", "slicked back",
      "pompadour", "quiff", "bangs", "curtain bangs", "messy layered", "loose waves",
      "French braid", "Dutch braid", "fishtail braid", "braided crown", "perm",
    ] },
    { group: "hair", key: "hair_length", label: "Hair length", options: [
      "shaved", "buzz cut", "short", "ear-length", "chin-length", "neck-length",
      "shoulder-length", "mid-back length", "waist-length", "hip-length", "floor-length",
    ] },
    { group: "hair", key: "hair_color", label: "Hair colour", options: [
      "black", "jet black", "dark brown", "chestnut brown", "auburn", "copper", "red",
      "ginger", "strawberry blonde", "blonde", "honey blonde", "platinum blonde", "ash blonde",
      "silver", "white", "grey", "blue", "teal", "purple", "pink", "green", "rainbow",
      "ombre", "balayage", "highlights", "lowlights", "two-tone",
    ] },
    { group: "hair", key: "makeup", label: "Makeup", options: [
      "no makeup", "natural makeup", "no-makeup makeup", "subtle makeup", "soft glam makeup",
      "full glam makeup", "dramatic smoky eyes", "smokey eye", "winged eyeliner", "cat eye",
      "bold red lip", "glossy lip", "nude lip", "editorial makeup", "avant-garde makeup",
      "gothic makeup", "vintage pin-up makeup", "bridal makeup", "festival glitter makeup",
      "minimal makeup", "dewy skin makeup",
    ] },
    { group: "face", key: "eyes", label: "Eyes", options: [
      "large round eyes", "almond-shaped eyes", "hooded eyes", "deep-set eyes", "upturned eyes",
      "downturned eyes", "monolid eyes", "close-set eyes", "wide-set eyes", "bright blue eyes",
      "icy blue eyes", "green eyes", "hazel eyes", "brown eyes", "dark brown eyes", "black eyes",
      "grey eyes", "amber eyes", "violet eyes", "heterochromatic eyes",
    ] },
    { group: "face", key: "nose", label: "Nose", options: [
      "straight nose", "button nose", "aquiline nose", "broad nose", "flat nose", "upturned nose",
      "pointed nose", "wide nose", "thin nose", "snub nose", "Roman nose", "hawk-like nose",
      "defined nose", "soft nose",
    ] },
    { group: "face", key: "mouth", label: "Mouth", options: [
      "full lips", "thin lips", "wide mouth", "small mouth", "defined cupid's bow",
      "heart-shaped lips", "pouty lips", "downturned mouth", "upturned mouth", "smile lines",
    ] },
    { group: "face", key: "chin", label: "Chin", options: [
      "rounded chin", "pointed chin", "strong chin", "cleft chin", "soft chin", "square chin",
      "receding chin", "prominent chin", "dimpled chin",
    ] },
    { group: "face", key: "face_shape", label: "Face shape", options: [
      "oval face", "round face", "square face", "heart-shaped face", "diamond-shaped face",
      "long face", "rectangular face", "triangular face", "pear-shaped face", "angular face",
      "soft face",
    ] },
    { group: "body", key: "body_type", label: "Body type", options: [
      "slim build", "average build", "athletic build", "muscular build", "stocky build",
      "curvy build", "plus-size build", "petite build", "tall build", "lithe build",
      "willowy build", "broad build",
    ] },
    { group: "body", key: "fitness", label: "Fitness", options: [
      "soft physique", "lightly toned", "fit", "athletic physique", "highly athletic",
      "powerful physique", "lean physique", "muscular physique", "toned physique",
    ] },
    { group: "body", key: "proportions", label: "Proportions", options: [
      "natural proportions", "tall proportions", "petite proportions", "broad shoulders",
      "long legs", "short legs", "balanced hourglass proportions", "athletic proportions",
      "elongated proportions",
    ] },
    { group: "clothing", key: "ensemble", label: "Ensemble (full costume)", options: [
      "western cowboy outfit", "western cowgirl outfit", "medieval knight plate armour",
      "fantasy leather armour", "fantasy ranger leathers", "medieval bard outfit",
      "royal mage robes", "wizard robes", "sci-fi flight suit", "sci-fi crew uniform",
      "spacesuit", "cyberpunk streetwear", "noir trench coat and fedora", "1940s zoot suit",
      "1920s flapper dress", "Victorian gown", "Edwardian three-piece suit", "Tudor noble attire",
      "samurai armour", "ninja outfit", "Viking warrior garb", "Roman centurion armour",
      "Greek hoplite armour", "Egyptian pharaoh attire", "steampunk aviator outfit",
      "dieselpunk pilot gear", "post-apocalyptic scavenger gear", "superhero costume",
      "royal ballgown", "gothic lolita dress", "business suit", "power suit", "cocktail dress",
      "evening gown", "trench coat and scarf", "bomber jacket and jeans", "leather biker outfit",
      "denim-on-denim look", "hazmat suit", "lab coat and goggles", "chef whites",
      "surgeon scrubs", "firefighter turnout gear", "police uniform", "military fatigues",
      "tuxedo", "wedding dress", "kimono", "hanbok", "cheongsam", "sari", "dashiki",
      "poncho and serape", "fur coat and hat", "parka and snow boots", "preppy cardigan look",
      "gym wear", "swimwear", "traditional kilt", "lederhosen",
    ] },
    { group: "clothing", key: "clothing_top", label: "Top", options: [
      "plain t-shirt", "graphic t-shirt", "tank top", "button-up shirt", "flannel shirt",
      "polo shirt", "knit sweater", "turtleneck sweater", "hoodie", "cardigan", "blouse",
      "crop top", "camisole", "halter top", "off-shoulder top", "corset top", "leather jacket",
      "denim jacket", "bomber jacket", "blazer", "suit jacket", "trench coat", "peacoat",
      "parka", "puffer jacket", "vest", "waistcoat", "chainmail shirt", "chestplate armour",
      "tunic", "robes", "sports jersey", "lab coat", "work shirt", "henley shirt",
    ] },
    { group: "clothing", key: "clothing_bottom", label: "Bottom", options: [
      "skinny jeans", "straight-leg jeans", "wide-leg trousers", "dress trousers",
      "cargo pants", "chinos", "shorts", "cargo shorts", "athletic shorts", "mini skirt",
      "midi skirt", "maxi skirt", "pleated skirt", "A-line skirt", "leather pants",
      "leggings", "joggers", "sweatpants", "overalls", "dungarees", "armoured greaves",
      "chainmail leggings", "puffy harem pants", "palazzo pants", "capri pants", "kilt",
      "military trousers", "cargo leggings", "formal culottes", "biker shorts",
    ] },
  ];

  const CHARACTER_COLUMN_LAYOUT = [
    ["Identity & hair", ["basics", "hair"]],
    ["Face & body", ["face", "body"]],
    ["Clothing", ["clothing"]],
  ];

  /* Per-character direction categories. A cast member owns these so two
   * characters in one scene never share the same emotion or body language. */
  const EMOTION_CATEGORIES = ["emotion", "emotion_trigger"];
  const FACE_CATEGORIES = ["face", "gaze", "mouth"];
  const BODY_CATEGORIES = ["body"];
  const POSITION_CATEGORIES = ["position"];
  const LORA_CATEGORIES = ["lora_trigger"];
  const DIRECTION_CATEGORIES = EMOTION_CATEGORIES.concat(
    FACE_CATEGORIES, BODY_CATEGORIES, POSITION_CATEGORIES, LORA_CATEGORIES,
  );
  /* Character concept picker excludes LoRA trigger words (handled by the
   * per-character LoRA rows instead). */
  const CHARACTER_PICKER_CATEGORIES = DIRECTION_CATEGORIES.filter(function (category) {
    return category !== "lora_trigger";
  });

  /* The Concepts Applied block splits subject & expression into three
   * side-by-side groups, each with its own dice and each-job shuffle. */
  const CHARACTER_CONCEPT_GROUPS = [
    { id: "emotion", icon: "sparkle", label: "Emotion", categories: ["emotion", "emotion_trigger"], emptyHint: "No emotion set." },
    { id: "expression", icon: "eye", label: "Face", categories: ["face", "gaze", "mouth"], emptyHint: "No facial action set." },
    { id: "pose", icon: "users", label: "Body", categories: ["body"], emptyHint: "No body language set." },
  ];

  /* TV/movie-style multi-concept direction presets shown as chips on each
   * cast member. Each chip applies several related concepts at once. */
  const QUICK_DIRECTIONS = [
    { label: "Triumphant", presets: [["emotion.elation", 1.5], ["mouth.broad_smile", 1.3], ["body.shoulders_pulled_back", 1.2], ["gaze.looking_upward", 1.1]] },
    { label: "Playful", presets: [["emotion.amusement", 1.4], ["mouth.smirk", 1.2], ["gaze.side_glance", 1.1], ["body.leaning_forward", 1.1]] },
    { label: "Flirtatious", presets: [["emotion.affection", 1.3], ["mouth.smirk", 1.3], ["gaze.looking_toward_another_subject", 1.2], ["body.leaning_forward", 1.2]] },
    { label: "Calm", presets: [["emotion.serenity", 1.4], ["mouth.gentle_smile", 1.2], ["body.relaxed_posture", 1.2], ["gaze.looking_directly_into_the_camera", 1.0]] },
    { label: "Focused", presets: [["emotion.determination", 1.4], ["gaze.fixed_intense_stare", 1.3], ["body.confident_stance", 1.2]] },
  ];

  /* Build indicator shown in the top bar so it is obvious which wizard
   * build is running. Bump when you ship a new build. */
  const WIZARD_VERSION = "V1 · 1.10.0";

  const TABS = [
    ["cast", "Cast", "users"],
    ["scene", "Scene", "clapper"],
  ];
  const CONCEPTS_TAB = ["concepts", "Concepts", "sparkle"];

  /* Fresh-node seed: the first character on a brand-new node starts with
   * three visible concept rows so the layout is obvious without clicking.
   * All ids must exist in presets/default_library.json and belong to the
   * three character concept groups (pose / emotion / face). */
  const SEED_ROWS = [
    ["emotion.joy", 1.5],
    ["emotion_trigger.radiant_joy", 1.0],
    ["body.open_posture", 1.5],
  ];

  /* Fallback labels/phrases used before the library fetch resolves (the
   * seed must render on the very first frame, not after a network round
   * trip). Enriched from the library once it loads. */
  const SEED_ROW_FALLBACKS = {
    "emotion.joy": { category: "emotion", label: "Joy", phrase: "joy" },
    "emotion_trigger.radiant_joy": { category: "emotion_trigger", label: "Radiant joy", phrase: "a radiant glow of joy" },
    "body.open_posture": { category: "body", label: "Open posture", phrase: "open posture" },
  };

  /* Conflict-aware cascading (v1 scope: emotion, framing, angle).
   * Curated pairs are merged with pairs derived from presets/conflicts.json
   * id tokens (e.g. "shot_size.extreme_close_up_vs_establishing"). */
  const CONFLICT_CATEGORIES = ["emotion", "framing", "angle"];
  const CURATED_CONFLICTS = [
    ["framing.close_up", "framing.wide_establishing_shot"],
    ["framing.extreme_close_up", "framing.wide_establishing_shot"],
    ["framing.macro_close_up", "framing.wide_establishing_shot"],
    ["framing.medium_close_up", "framing.wide_establishing_shot"],
    ["framing.extreme_wide_shot", "framing.extreme_close_up"],
    ["angle.low_angle", "angle.high_angle"],
    ["angle.extreme_low_angle", "angle.extreme_high_angle"],
    ["angle.top_down", "angle.low_angle"],
    ["emotion.joy", "emotion.grief"],
    ["emotion.happiness", "emotion.sadness"],
    ["emotion.elation", "emotion.despair"],
    ["emotion.anger", "emotion.serenity"],
    ["emotion.rage", "emotion.contentment"],
    ["emotion.terror", "emotion.relief"],
    ["emotion.fear", "emotion.relief"],
  ];

  /* Scene chips: one pill per option, single-select per category row. */
  const SCENE_CHIPS = {
    framing: [
      ["framing.close_up", "Close-up"],
      ["framing.medium_shot", "Medium"],
      ["framing.wide_shot", "Wide"],
      ["framing.wide_establishing_shot", "Establishing"],
    ],
    angle: [
      ["angle.eye_level", "Eye level"],
      ["angle.low_angle", "Low"],
      ["angle.high_angle", "High"],
      ["angle.top_down", "Top-down"],
    ],
    aperture: [
      ["aperture.f14", "f/1.4"],
      ["aperture.f28", "f/2.8"],
      ["aperture.f4", "f/4"],
      ["aperture.f8", "f/8"],
      ["aperture.f16", "f/16"],
    ],
    lighting_setup: [
      ["lighting_setup.soft_diffused_lighting", "Soft"],
      ["lighting_setup.hard_directional_lighting", "Hard"],
      ["lighting_setup.three_point_lighting", "Three-point"],
      ["lighting_setup.rembrandt_lighting", "Rembrandt"],
    ],
    atmosphere: [
      ["atmosphere.clear_air", "Clear air"],
      ["atmosphere.light_haze", "Light haze"],
      ["atmosphere.dense_haze", "Dense haze"],
      ["atmosphere.mist", "Mist"],
      ["atmosphere.fog", "Fog"],
      ["atmosphere.dense_cinematic_fog", "Dense fog"],
      ["atmosphere.ground_fog", "Ground fog"],
      ["atmosphere.smoke", "Smoke"],
      ["atmosphere.dust", "Dust"],
      ["atmosphere.embers", "Embers"],
      ["atmosphere.ash", "Ash"],
      ["atmosphere.light_rain", "Light rain"],
      ["atmosphere.heavy_rain", "Heavy rain"],
      ["atmosphere.storm", "Storm"],
      ["atmosphere.snowfall", "Snowfall"],
      ["atmosphere.heavy_snowfall", "Heavy snowfall"],
      ["atmosphere.wind", "Wind"],
      ["atmosphere.strong_wind", "Strong wind"],
      ["atmosphere.heat_shimmer", "Heat shimmer"],
      ["atmosphere.humid_atmosphere", "Humid atmosphere"],
    ],
    style: [
      ["style.natural_photographic_realism", "Photorealistic"],
      ["style.cinematic_film_still", "Cinematic"],
      ["style.fashion_editorial", "Editorial"],
      ["style.documentary_photography", "Documentary"],
    ],
  };

  /* Lighting setups that drive the multi-light plane: layouts replaced by
   * the rich LIGHTING_PRESETS catalog (see the lighting panel section). */
  const LIGHT_SETUP_LAYOUTS = {
    "lighting_setup.three_point_lighting": [
      { angle: Math.PI / 4, distance: 0.85 },
      { angle: (3 * Math.PI) / 4, distance: 0.85 },
      { angle: -Math.PI / 2, distance: 0.8 },
    ],
    "lighting_setup.rembrandt_lighting": [
      { angle: Math.PI / 4, distance: 0.85 },
    ],
    "lighting_setup.soft_diffused_lighting": [
      { angle: Math.PI / 2, distance: 0.9 },
    ],
    "lighting_setup.hard_directional_lighting": [
      { angle: Math.PI / 2, distance: 0.8 },
    ],
  };

  const SETTING_PRESETS = [
    ["Game show", "a bright television game-show stage with contestant podiums, LED walls, studio cameras, and a cheering audience"],
    ["Urban apartment — living room", "a contemporary urban apartment living room with city-window views and practical interior lighting"],
    ["Urban apartment — bedroom", "a lived-in urban apartment bedroom with layered personal details and window light"],
    ["Suburban house — kitchen", "a warm suburban family kitchen with an island, cupboards, and natural daylight"],
    ["Suburban house — living room", "a comfortable suburban living room with stairs, family furniture, and soft practical lighting"],
    ["Spaceship bridge", "a professional cinematic spaceship bridge with command stations, panoramic windows, and readable control lighting"],
    ["Space shuttle", "a compact working space-shuttle cabin with strapped seats, panels, and weightless equipment"],
    ["Back alley", "a narrow cinematic back alley with service doors, fire escapes, wet pavement, and motivated practical lights"],
    ["Carnival rides", "a lively night carnival with illuminated rides, midway booths, crowds, and colourful reflected light"],
    ["Laser-tag arena", "a multi-level laser-tag arena with cover, ramps, haze, UV markings, and neon team lighting"],
    ["Airplane cabin", "a realistic passenger airplane cabin with overhead bins, aisle lighting, and window views"],
    ["Train carriage", "a detailed passenger train carriage with paired seats, aisle, luggage racks, and moving exterior scenery"],
    ["Car interior", "a cinematic car interior with dashboard detail, believable seating, and exterior road context"],
    ["Van interior", "a practical passenger van interior with sliding door, bench seating, and equipment storage"],
    ["Bus interior", "a realistic city bus interior with handrails, rows of seats, windows, and route lighting"],
    ["Medieval castle", "a lived-in medieval stone castle with a great hall, banners, torches, and period furnishings"],
    ["School classroom", "a contemporary school classroom with desks, whiteboard, learning materials, and daylight"],
    ["Desert", "a vast cinematic desert with layered dunes, heat haze, wind-shaped sand, and distant terrain"],
    ["Concert stage", "a performer on a large stage before a dense crowd with professional concert lighting and atmospheric haze"],
    ["Film studio soundstage", "a professional film soundstage with practical set walls, rigging, flags, cables, and crew-ready space"],
    ["Hospital corridor", "a clean modern hospital corridor with patient rooms, equipment bays, and clinical practical lighting"],
    ["Luxury hotel lobby", "a spacious luxury hotel lobby with concierge desk, lounge seating, architectural lighting, and guests"],
    ["Rooftop at sunset", "a high city rooftop at sunset with safety rails, vents, layered skyline silhouettes, and warm edge light"],
    ["Rainy downtown street", "a rain-soaked downtown street at night with traffic, storefront reflections, umbrellas, and glowing signs"],
    ["Small-town main street", "a welcoming small-town main street with local shops, parked cars, trees, and everyday pedestrian life"],
    ["Busy subway platform", "a crowded underground subway platform with tiled walls, signage, arriving trains, and practical fluorescent light"],
    ["Grand central station", "a monumental railway concourse with a vaulted ceiling, departure boards, streams of travellers, and shafts of daylight"],
    ["Cozy coffee shop", "an intimate independent coffee shop with wood tables, pastry counter, warm lamps, plants, and street-facing windows"],
    ["Fine-dining restaurant", "an elegant fine-dining restaurant with dressed tables, sculptural lighting, attentive service, and refined architectural detail"],
    ["Rundown diner", "a weathered roadside diner with vinyl booths, chrome trim, a glowing jukebox, and late-night fluorescent ambience"],
    ["Grocery store aisle", "a realistic grocery-store aisle with fully stocked shelves, product variety, shopping carts, and even retail lighting"],
    ["Shopping mall atrium", "a large multi-level shopping mall atrium with escalators, storefronts, skylights, plants, and circulating crowds"],
    ["Modern office", "a contemporary open-plan office with desks, meeting rooms, monitors, acoustic panels, and broad window light"],
    ["Corporate boardroom", "a formal corporate boardroom with a long table, presentation wall, city views, and restrained professional lighting"],
    ["Artist studio", "a working artist studio with canvases, paints, tools, drop cloths, reference objects, and directional north light"],
    ["Photography studio", "a professional photography studio with seamless paper, strobes, softboxes, flags, stands, and a tethered workstation"],
    ["Music recording studio", "a professional recording studio with acoustic treatment, mixing console, microphones, instruments, and moody task lighting"],
    ["Backstage dressing room", "a busy backstage dressing room with mirror bulbs, costumes, makeup stations, garment racks, and production clutter"],
    ["Boxing gym", "a gritty working boxing gym with a ring, heavy bags, worn mats, lockers, and high industrial windows"],
    ["Basketball court", "a regulation indoor basketball court with polished wood, bleachers, scoreboards, and bright arena lighting"],
    ["Olympic swimming pool", "a competition swimming venue with marked lanes, starting blocks, spectator seating, and reflective aquatic light"],
    ["Forest clearing", "a secluded forest clearing surrounded by layered trees, moss, ferns, fallen branches, and broken natural light"],
    ["Mountain overlook", "a dramatic mountain overlook with rocky foreground, deep valleys, distant peaks, and changing alpine weather"],
    ["Tropical beach", "a broad tropical beach with pale sand, clear water, palms, scattered rocks, and humid coastal light"],
    ["Rocky coastline", "a rugged ocean coastline with dark rocks, breaking surf, sea spray, cliffs, and windswept vegetation"],
    ["Frozen lake", "a vast frozen lake with textured ice, snow drifts, distant forest, and crisp low winter sunlight"],
    ["Autumn park", "a mature city park in autumn with winding paths, benches, fallen leaves, and warm filtered daylight"],
    ["Wildflower meadow", "an open wildflower meadow with tall grasses, varied blooms, distant hills, and a gentle moving breeze"],
    ["Ancient temple", "a monumental ancient temple with carved stone, weathered columns, ritual objects, and shafts of dusty light"],
    ["Fantasy throne room", "an immense fantasy throne room with a raised dais, banners, ceremonial guards, towering windows, and dramatic torchlight"],
    ["Wizard workshop", "a dense wizard workshop with books, alchemical glassware, maps, strange instruments, and layered magical practical light"],
    ["Medieval village market", "a lively medieval village market with timber stalls, canvas awnings, baskets, animals, townspeople, and muddy lanes"],
    ["Pirate ship deck", "the working deck of a wooden sailing ship with rigging, cannon, weathered planks, ocean horizon, and wind-filled sails"],
    ["Underwater research lab", "a pressurized underwater research station with reinforced windows, instrument panels, divers, and deep-ocean views"],
    ["Mars habitat", "a practical Mars surface habitat with airlocks, equipment racks, pressure suits, red terrain views, and filtered utility light"],
    ["Orbital space station", "a modular orbital station interior with handrails, floating equipment, observation windows, and Earth visible below"],
    ["Cyberpunk night market", "a dense futuristic night market with food stalls, tangled signage, steam, crowds, cables, and wet neon reflections"],
    ["Post-apocalyptic highway", "an abandoned overgrown highway with damaged vehicles, cracked asphalt, improvised shelters, and a vast unsettled sky"],
    ["Secret laboratory", "a high-security research laboratory with glass partitions, experimental machinery, containment equipment, and precise cold lighting"],
    ["Museum gallery", "a quiet contemporary museum gallery with large artworks, polished floors, benches, visitors, and controlled exhibition lighting"],
    ["Public library", "a spacious public library with long shelving, reading tables, study lamps, windows, and a calm lived-in atmosphere"],
    ["University lecture hall", "a tiered university lecture hall with desks, projection screens, teaching podium, students, and practical ceiling light"],
    ["Courtroom", "a formal courtroom with judge's bench, witness stand, counsel tables, gallery seating, and dignified institutional detail"],
    ["Airport terminal", "a busy international airport terminal with gates, flight displays, luggage, travellers, and broad glass curtain walls"],
    ["Greenhouse", "a humid working greenhouse with glass walls, dense plant benches, irrigation lines, condensation, and luminous diffused light"],
    ["Abandoned factory", "a vast abandoned factory with rusted machinery, broken windows, debris, graffiti, and dramatic shafts of daylight"],
    ["Construction site", "an active urban construction site with scaffolding, cranes, materials, safety barriers, workers, and dusty daylight"],
    ["Fire station", "a working fire station apparatus bay with engines, turnout gear, lockers, tools, and open street-facing doors"],
    ["Farmhouse barn", "a weathered working barn with timber beams, hay, tools, animals, open doors, and warm rural daylight"],
    ["Underground bunker", "a reinforced underground bunker with concrete corridors, heavy doors, utility pipes, supplies, and stark emergency lighting"],
  ];

  const CHARACTER_PRESETS = [
    { label: "Cinematic heroine", character: { sex: "female", age: "young adult", identity: "A poised cinematic lead with assured presence", ensemble: "evening gown", hair_style: "wavy", hair_length: "long", hair_color: "dark brown", makeup: "soft glam makeup", eyes: "almond-shaped eyes", face_shape: "oval face", body_type: "athletic build", fitness: "fit", proportions: "natural proportions" } },
    { label: "Action hero", character: { sex: "male", age: "adult", identity: "A battle-tested protector who remains calm under pressure", ensemble: "bomber jacket and jeans", hair_style: "messy layered", hair_length: "short", hair_color: "dark brown", makeup: "no makeup", eyes: "deep-set eyes", face_shape: "square face", body_type: "muscular build", fitness: "powerful physique", proportions: "broad shoulders" } },
    { label: "Sci-fi commander", character: { sex: "female", age: "adult", identity: "A decisive starship commander with a disciplined bearing", ensemble: "sci-fi crew uniform", hair_style: "undercut", hair_length: "short", hair_color: "silver", makeup: "natural makeup", eyes: "grey eyes", face_shape: "diamond-shaped face", body_type: "athletic build", fitness: "highly athletic", proportions: "tall proportions" } },
    { label: "Veteran pilot", character: { sex: "male", age: "middle aged", identity: "A veteran shuttle pilot with a weathered face and quick instincts", ensemble: "sci-fi flight suit", hair_style: "messy layered", hair_length: "short", hair_color: "dark brown", makeup: "no makeup", eyes: "brown eyes", nose: "aquiline nose", chin: "cleft chin", face_shape: "long face", body_type: "average build", fitness: "fit", proportions: "natural proportions" } },
    { label: "Noir detective", character: { sex: "male", age: "middle aged", identity: "A private detective who notices every detail", ensemble: "noir trench coat and fedora", hair_style: "straight", hair_length: "short", hair_color: "black", makeup: "no makeup", eyes: "deep-set eyes", nose: "straight nose", mouth: "thin lips", face_shape: "square face", body_type: "average build", fitness: "lightly toned", proportions: "natural proportions" } },
    { label: "Fantasy ranger", character: { sex: "unspecified", age: "young adult", identity: "A quiet woodland ranger and expert tracker", ensemble: "fantasy ranger leathers", hair_style: "braided", hair_length: "shoulder-length", hair_color: "auburn", makeup: "no makeup", eyes: "green eyes", face_shape: "heart-shaped face", body_type: "slim build", fitness: "highly athletic", proportions: "long legs" } },
    { label: "Royal mage", character: { sex: "unspecified", age: "middle aged", identity: "A learned royal mage with an elegant, otherworldly presence", ensemble: "royal mage robes", hair_style: "wavy", hair_length: "waist-length", hair_color: "platinum blonde", makeup: "editorial makeup", eyes: "bright blue eyes", nose: "straight nose", mouth: "defined cupid's bow", chin: "pointed chin", face_shape: "oval face", body_type: "slim build", fitness: "soft physique", proportions: "tall proportions" } },
    { label: "Cyberpunk hacker", character: { sex: "unspecified", age: "young adult", identity: "A brilliant underground hacker with restless energy", ensemble: "cyberpunk streetwear", hair_style: "undercut", hair_length: "chin-length", hair_color: "blue", makeup: "gothic makeup", eyes: "large round eyes", face_shape: "diamond-shaped face", body_type: "slim build", fitness: "lightly toned", proportions: "petite proportions" } },
    { label: "Cheerful student", character: { sex: "female", age: "young adult", identity: "An outgoing university student with an infectious laugh", clothing_top: "knit sweater", clothing_bottom: "straight-leg jeans", hair_style: "ponytail", hair_length: "shoulder-length", hair_color: "auburn", makeup: "natural makeup", eyes: "large round eyes", nose: "button nose", mouth: "wide mouth", chin: "rounded chin", face_shape: "round face", body_type: "average build", fitness: "lightly toned", proportions: "natural proportions" } },
    { label: "Elegant elder", character: { sex: "female", age: "elderly", identity: "An elegant older mentor with warmth, wisdom, and authority", ensemble: "business suit", hair_style: "wavy", hair_length: "chin-length", hair_color: "silver", makeup: "natural makeup", eyes: "hooded eyes", nose: "aquiline nose", mouth: "thin lips", chin: "strong chin", face_shape: "long face", body_type: "average build", fitness: "soft physique", proportions: "natural proportions" } },
  ];

  let lightingSvgSequence = 0;
  function createWizardWidget(node) {
    function expertMode() { return !!node.widgets?.find(widget => widget.name === "expert_mode")?.value; }
    function renderRow(row, context) { return renderPresetRow(row, Object.assign({}, context, { expert: expertMode() })); }
    const lightingSvgPrefix = "krea2-lt-" + (++lightingSvgSequence) + "-";
    const valueWidget = (node.widgets || []).find(function (w) { return w.name === "wizard_state_json"; });
    if (!valueWidget) {
      console.warn("[Krea2PromptWizard] No wizard_state_json widget found");
      return null;
    }
    valueWidget.hidden = true;
    valueWidget.type = "hidden";
    valueWidget.computeSize = function () { return [0, -4]; };
    const stateString = valueWidget.value || "";
    const parsedInit = parseState(stateString);
    const freshNode = !parsedInit || Object.keys(parsedInit).length === 0;
    let state = coerceState(parsedInit);
    if (!Array.isArray(state.rows)) state.rows = [];

    const library = [];
    if (freshNode && !state.characters.length) {      // v2: a brand-new node shows one expanded character card with the
      // seeded concept rows so the layout is obvious without clicking.
      // Seeding happens here, after `library` exists (seed rows are looked
      // up from it).
      const starter = newCharacter();
      seedCharacterConcepts(starter);
      state.characters.push(starter);
      state.selected_character_id = starter.id;
    }
    let savedPresets = [];
    let acknowledgedPresets = [];
    let presetSaveQueue = Promise.resolve();
    let masterPresets = [];
    let loras = [];
    let conflictList = [];
    let conflictPairsCache = null;
    let dirty = false;
    let undoStack = [];
    let redoStack = [];
    let persistedState = JSON.stringify(state);
    let latestPreview = null;
    let previewSequence = 0;
    let previousExpanded = null;
    let contractNextSync = false;
    let disposed = false;
    let revision = Number(state.document_revision) || 0;
    let lastTransaction = null;
    let inputTransaction = null;
    let focusOverlay = null;
    let focusedHome = null;
    let activeChooser = null;
    let activeNameDialog = null;
    let lastRun = null;
    let randomRequest = 0;
    const activeDrags = new Set();
    const W = K.workspace;

    // v2.3: the compact quick-edit card is hidden. The wizard always
    // renders the full tabbed editor.
    state.wizard_expanded = true;

    const root = el("div", { class: "krea2-wizard-root" });
    const executionHistory = [];
    const executionRecords = [];
    root.krea2ExecutionHistory = executionHistory;
    root.dataset.krea2ExecutionCount = "0";
    root.dataset.krea2ExecutionHistory = "[]";

    function recordExecution(prompt, message) {
      if (typeof prompt !== "string" || !prompt.trim()) return;
      executionHistory.push(prompt);
      if (executionHistory.length > 100) executionHistory.splice(0, executionHistory.length - 100);
      root.dataset.krea2ExecutionCount = String(executionHistory.length);
      root.dataset.krea2ExecutionHistory = JSON.stringify(executionHistory);
      root.dataset.krea2LastOutput = prompt;
      const rawTrace = message && message.krea2_trace;
      let trace = null;
      try { trace = JSON.parse(Array.isArray(rawTrace) ? rawTrace[0] : rawTrace || "null"); } catch (_) {}
      const rawRevision = message && message.krea2_resolved_revision;
      const rawState = message?.krea2_resolved_state;
      let snapshot = null;
      try { snapshot = JSON.parse(Array.isArray(rawState) ? rawState[0] : rawState || "null"); } catch (_) {}
      lastRun = { prompt, snapshot, revision: Number(Array.isArray(rawRevision) ? rawRevision[0] : rawRevision ?? state.document_revision), trace, warnings: message?.krea2_warnings || [], encoded: message?.krea2_encoded_prompt || [] };
      executionRecords.push(lastRun);
      if (executionRecords.length > 100) executionRecords.shift();
      refreshExecutionHistoryControl();
      render();
    }

    function refreshExecutionHistoryControl() {
      if (!livePreview || !livePreview.historySelect) return;
      const select = livePreview.historySelect;
      select.innerHTML = "";
      select.appendChild(el("option", { value: "" }, executionHistory.length
        ? executionHistory.length + " generated prompt" + (executionHistory.length === 1 ? "" : "s")
        : "No generated prompts yet"));
      for (let index = executionHistory.length - 1; index >= 0; index -= 1) {
        const number = index + 1;
        const excerpt = executionHistory[index].slice(0, 72).replace(/\s+/g, " ");
        select.appendChild(el("option", { value: String(index) }, "Job " + number + " · " + excerpt));
      }
      if (executionHistory.length) select.value = String(executionHistory.length - 1);
    }

    /* --- Top section: base prompt, mode, library button --- */
    const basePromptControl = buildBasePrompt();
    const livePreview = buildLivePreview();
    const showWorkToggle = buildShowWorkToggle(state);
    const libraryBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: openLibrary }, "Library");
    const randomAllBtn = diceButton(
      "Randomize all concept groups",
      randomizeAll,
      "krea2-wizard-btn krea2-wizard-random-all krea2-icon-btn",
    );
    const settingsBtn = el("button", {
      type: "button",
      class: "krea2-wizard-btn krea2-icon-btn",
      title: "Node settings",
      "aria-label": "Node settings",
      onClick: function () {
        state.settings_open = !state.settings_open;
        markDirty();
        renderNodeSettings();
      },
    }, icon("sliders", { width: "14", height: "14" }));
    const materializeBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: materialize }, "Materialize");
    const subgraphBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: createSubgraph }, "Create Subgraph");
    const undoBtn = el("button", { type: "button", class: "krea2-wizard-btn krea2-icon-btn", onClick: undo, title: "Undo the last change", "aria-label": "Undo" }, icon("undo", { width: "13", height: "13" }));
    const redoBtn = el("button", { type: "button", class: "krea2-wizard-btn krea2-icon-btn", onClick: redo, title: "Redo the last undone change", "aria-label": "Redo" }, icon("redo", { width: "13", height: "13" }));
    const resetBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: resetAll }, "Reset All");
    const savedPresetControl = buildSavedPresetControl();
    const creativeModeControl = buildCreativeModeControl();
    const masterPresetSelect = buildMasterPresetControl();

    const topBar = el("div", { class: "krea2-wizard-top" }, [
      el("span", {
        class: "krea2-wizard-version",
        title: "Krea2 Prompt Wizard build " + WIZARD_VERSION,
        "aria-label": "Wizard build " + WIZARD_VERSION,
      }, WIZARD_VERSION),
      savedPresetControl.root,
      el("span", { class: "krea2-structured-spacer" }),
      undoBtn,
      redoBtn,
      resetBtn,
      buildOverflowMenu(),
    ]);

    /* v2.3: the compact <-> advanced mode switch is removed — the wizard
     * always renders the full editor at the advanced width. */
    const ADVANCED_WIDTH = 780;

    function applyModeSize(advanced) {
      if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
    }

    function setWizardMode(advanced) {
      state.wizard_expanded = true;
      markDirty();
      render();
      applyModeSize(true);
    }

    function buildOverflowMenu() {
      const wrap = el("div", { class: "krea2-wizard-overflow" });
      const moreBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn",
        title: "More options",
        "aria-label": "More options",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          const open = menu.classList.toggle("is-open");
          document.addEventListener("mousedown", closeOnOutside, { once: true });
          function closeOnOutside(event) {
            if (!wrap.contains(event.target)) menu.classList.remove("is-open");
          }
          if (!open) document.removeEventListener("mousedown", closeOnOutside, { once: true });
        },
      }, "···");
      const menu = el("div", { class: "krea2-wizard-overflow-menu" }, [
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open"); openLibrary();
        } }, "Library"),
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open"); randomizeAll();
        } }, "Randomize all"),
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open");
          state.settings_open = !state.settings_open;
          markDirty();
          renderNodeSettings();
        } }, "Node settings"),
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open"); materialize();
        } }, "Materialize"),
        el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
          menu.classList.remove("is-open"); createSubgraph();
        } }, "Create Subgraph"),
      ]);
      wrap.appendChild(moreBtn);
      wrap.appendChild(menu);
      return wrap;
    }

    function handleColorChange(presetId, newColor) {
      state.concept_colors = state.concept_colors || {};
      if (newColor) state.concept_colors[presetId] = newColor;
      else delete state.concept_colors[presetId];
      markDirty();
      render();
    }

    /* --- Searchable add concept --- */
    const addConcept = el("button", {
      type: "button",
      class: "krea2-wizard-btn krea2-wizard-add",
      onClick: function () {
        showSearchableSelector({
          presets: compatibleLibrary(),
          multiSelect: true,
          selectedIds: state.rows.map(function (row) { return row.preset_id; }),
          onToggle: togglePreset,
          onClose: function () { render(); },
          getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
          onColorChange: function (presetId, newColor) {
            state.concept_colors = state.concept_colors || {};
            if (newColor) state.concept_colors[presetId] = newColor;
            else delete state.concept_colors[presetId];
            markDirty();
          },
        });
      },
    }, "+ Add Concept");

    /* --- Layout: mode tabs with per-tab hosts --- */
    const tabBar = el("div", { class: "krea2-wizard-tabs", role: "tablist" });
    const castHost = el("div", { class: "krea2-tab-host krea2-cast-tab" });
    const sceneHost = el("div", { class: "krea2-tab-host krea2-scene-tab" });
    const conceptsHost = el("div", { class: "krea2-tab-host krea2-concepts-tab" });
    const promptHost = el("div", { class: "krea2-tab-host krea2-prompt-tab" });
    const settingsHost = el("div", { class: "krea2-settings-host" });
    const structuredHost = el("div", { class: "krea2-structured-host" });
    const categoryBody = el("div", { class: "krea2-wizard-categories" });
    const showWork = el("div", { class: "krea2-wizard-show-work-host" });
    const footerHost = el("div", { class: "krea2-wizard-footer" });

    const editorBody = el("div", { class: "krea2-wizard-editor" }, [
      tabBar,
      settingsHost,
      castHost,
      sceneHost,
      conceptsHost,
      promptHost,
    ]);
    /* Compact-mode surface (concept layout). Rendered by renderB2Shell()
     * whenever state.wizard_expanded is false. */
    const b2Shell = el("div", { class: "krea2-b2-shell" });

    root.appendChild(topBar);
    root.appendChild(editorBody);
    root.appendChild(b2Shell);
    root.appendChild(footerHost);

    /* The backend supplies the built-in category presets together with the
     * user's saved presets. Keeping one source prevents stale browser-only
     * IDs from silently loading empty cards. */
    /*
      // ── Subject & Expression ──
      {"id":"fb_sub_1","label":"Cinematic Portrait","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"body","preset_id":"body.shoulders_pulled_back","intensity":60},{"id":"x2","category":"emotion","preset_id":"emotion.confident","intensity":65},{"id":"x3","category":"gaze","preset_id":"gaze.looking_directly_into_the_camera","intensity":70}]},
      {"id":"fb_sub_2","label":"Joyful Laughter","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"emotion","preset_id":"emotion.joy","intensity":80},{"id":"x2","category":"mouth","preset_id":"mouth.laughing","intensity":75},{"id":"x3","category":"face","preset_id":"face.cheek_raiser","intensity":70}]},
      {"id":"fb_sub_3","label":"Anger","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"emotion","preset_id":"emotion.anger","intensity":85},{"id":"x2","category":"face","preset_id":"face.upper_lip_raiser","intensity":75},{"id":"x3","category":"gaze","preset_id":"gaze.staring_intently","intensity":75}]},
      {"id":"fb_sub_4","label":"Sadness","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"emotion","preset_id":"emotion.sadness","intensity":70},{"id":"x2","category":"gaze","preset_id":"gaze.looking_down","intensity":65},{"id":"x3","category":"face","preset_id":"face.eyebrow_raiser_inner","intensity":60}]},
      {"id":"fb_sub_5","label":"Suspenseful Stare","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"gaze","preset_id":"gaze.wide_open_eyes","intensity":75},{"id":"x2","category":"emotion","preset_id":"emotion.surprise","intensity":70},{"id":"x3","category":"body","preset_id":"body.stiff_rigid_stance","intensity":60}]},
      {"id":"fb_sub_6","label":"Contemplative","scope":"group","group":"subject_expression","base_prompt":"","rows":[{"id":"x1","category":"emotion","preset_id":"emotion.contemplative","intensity":65},{"id":"x2","category":"gaze","preset_id":"gaze.looking_away_thoughtful","intensity":60},{"id":"x3","category":"body","preset_id":"body.relaxed_pose","intensity":50}]},
      // ── Camera & Film ──
      {"id":"fb_cam_1","label":"Cinematic Close-up","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"framing","preset_id":"framing.close_up","intensity":70},{"id":"x2","category":"lens","preset_id":"lens.85mm_portrait","intensity":60},{"id":"x3","category":"aperture","preset_id":"aperture.shallow_depth_of_field","intensity":75}]},
      {"id":"fb_cam_2","label":"Wide Epic Landscape","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"framing","preset_id":"framing.wide_establishing_shot","intensity":80},{"id":"x2","category":"lens","preset_id":"lens.14mm_ultrawide","intensity":65},{"id":"x3","category":"aperture","preset_id":"aperture.deep_focus","intensity":70}]},
      {"id":"fb_cam_3","label":"Dutch Angle Thriller","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"angle","preset_id":"angle.dutch_angle","intensity":75},{"id":"x2","category":"framing","preset_id":"framing.extreme_close_up","intensity":70},{"id":"x3","category":"composition","preset_id":"composition.diagonal_composition","intensity":65}]},
      {"id":"fb_cam_4","label":"Handheld Docudrama","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"camera_movement","preset_id":"camera_movement.handheld_camera","intensity":75},{"id":"x2","category":"framing","preset_id":"framing.medium_shot","intensity":60},{"id":"x3","category":"perspective","preset_id":"perspective.eye_level","intensity":50}]},
      {"id":"fb_cam_5","label":"Aerial Drone Shot","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"perspective","preset_id":"perspective.birds_eye_view","intensity":80},{"id":"x2","category":"camera_movement","preset_id":"camera_movement.crane_shot","intensity":65},{"id":"x3","category":"lens","preset_id":"lens.50mm_standard","intensity":50}]},
      {"id":"fb_cam_6","label":"Golden Hour Cinematic","scope":"group","group":"camera_film","base_prompt":"","rows":[{"id":"x1","category":"framing","preset_id":"framing.medium_shot","intensity":65},{"id":"x2","category":"lens","preset_id":"lens.35mm_wide","intensity":60},{"id":"x3","category":"film_color","preset_id":"film_color.kodak_vision3_250d","intensity":55}]},
      // ── Lighting ──
      {"id":"fb_lit_1","label":"Rembrandt Classic","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_setup","preset_id":"lighting_setup.rembrandt_lighting","intensity":70},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.rim_lighting","intensity":60}]},
      {"id":"fb_lit_2","label":"Backlit Dramatic","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_direction","preset_id":"lighting_direction.backlighting","intensity":80},{"id":"x2","category":"lighting_effect","preset_id":"lighting_effect.lens_flare","intensity":60}]},
      {"id":"fb_lit_3","label":"Noir Chiaroscuro","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_setup","preset_id":"lighting_setup.low_key_lighting","intensity":85},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.side_lighting","intensity":75}]},
      {"id":"fb_lit_4","label":"Soft Beauty Light","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_setup","preset_id":"lighting_setup.soft_diffused_lighting","intensity":80},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.front_lighting","intensity":55}]},
      {"id":"fb_lit_5","label":"Neon Cyberpunk","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_effect","preset_id":"lighting_effect.neon_glow","intensity":80},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.colored_gels","intensity":70}]},
      {"id":"fb_lit_6","label":"Golden Hour Warmth","scope":"group","group":"lighting","base_prompt":"","rows":[{"id":"x1","category":"lighting_setup","preset_id":"lighting_setup.golden_hour_lighting","intensity":80},{"id":"x2","category":"lighting_direction","preset_id":"lighting_direction.backlighting","intensity":60}]},
      // ── Environment ──
      {"id":"fb_env_1","label":"Golden Hour","scope":"group","group":"environment","base_prompt":"","rows":[{"id":"x1","category":"atmosphere","preset_id":"atmosphere.light_haze","intensity":60},{"id":"x2","category":"lighting_setup","preset_id":"lighting_setup.golden_hour_lighting","intensity":75}]},
      {"id":"fb_env_2","label":"Stormy Sky","scope":"group","group":"environment","base_prompt":"","rows":[{"id":"x1","category":"atmosphere","preset_id":"atmosphere.heavy_storm","intensity":80},{"id":"x2","category":"environment_movement","preset_id":"environment_movement.leaves_blowing_in_wind","intensity":65}]},
      {"id":"fb_env_3","label":"Foggy Mysterious","scope":"group","group":"environment","base_prompt":"","rows":[{"id":"x1","category":"atmosphere","preset_id":"atmosphere.dense_fog","intensity":75},{"id":"x2","category":"environment_movement","preset_id":"environment_movement.smoke_drifting","intensity":50}]},
      {"id":"fb_env_4","label":"Rainy Neon Streets","scope":"group","group":"environment","base_prompt":"","rows":[{"id":"x1","category":"atmosphere","preset_id":"atmosphere.heavy_rain","intensity":75},{"id":"x2","category":"environment_movement","preset_id":"environment_movement.rain_sweeping_across","intensity":60}]},
      // ── Style & Finish ──
      {"id":"fb_sty_1","label":"Fashion Editorial","scope":"group","group":"style_finish","base_prompt":"","rows":[{"id":"x1","category":"style","preset_id":"style.fashion_editorial","intensity":70},{"id":"x2","category":"texture","preset_id":"texture.smooth_clean_digital_texture","intensity":55}]},
      {"id":"fb_sty_2","label":"Cinematic Film","scope":"group","group":"style_finish","base_prompt":"","rows":[{"id":"x1","category":"style","preset_id":"style.cinematic","intensity":75},{"id":"x2","category":"texture","preset_id":"texture.heavy_film_grain","intensity":60}]},
      {"id":"fb_sty_3","label":"Oil Painting","scope":"group","group":"style_finish","base_prompt":"","rows":[{"id":"x1","category":"style","preset_id":"style.oil_painting","intensity":75},{"id":"x2","category":"texture","preset_id":"texture.thick_impasto_paint","intensity":70}]},
      {"id":"fb_sty_4","label":"Vintage Analogue","scope":"group","group":"style_finish","base_prompt":"","rows":[{"id":"x1","category":"style","preset_id":"style.vintage_photograph","intensity":70},{"id":"x2","category":"texture","preset_id":"texture.dust_scratches","intensity":45}]},
    ];
    */

    const savedPresetsReady = fetchSavedPresets().then(function (presets) {
      acknowledgedPresets = cloneJson(Array.isArray(presets) ? presets : []);
      savedPresets = mergePendingPresetEdits([], savedPresets, acknowledgedPresets);
      refreshSavedPresetSelect();
      render();
    });

    function setState(newState) {
      state = coerceState(newState);
      stageDrag = null;
      revision = Math.max(revision, Number(state.document_revision) || 0);
      if (!Array.isArray(state.rows)) state.rows = [];
      persistedState = JSON.stringify(state);
      persist();
      render();
    }

    function parseState(text) {
      try { return JSON.parse(text); } catch (e) { return null; }
    }

    function persist() {
      try {
        valueWidget.value = JSON.stringify(state);
        if (node.setDirtyCanvas) node.setDirtyCanvas(true);
      } catch (e) {
        console.warn("[Krea2PromptWizard] failed to persist state", e);
      }
    }

    function markDirty() {
      const currentState = JSON.stringify(state);
      if (currentState === persistedState) return;
      const now = Date.now();
      const sameTransaction = inputTransaction && lastTransaction && lastTransaction.target === inputTransaction && now - lastTransaction.time < 800;
      if (!sameTransaction) undoStack.push(persistedState);
      if (undoStack.length > 50) undoStack.shift();
      redoStack = [];
      dirty = true;
      state.randomization.replay = false;
      state.document_revision = ++revision;
      lastTransaction = { target: inputTransaction, time: now };
      persistedState = JSON.stringify(state);
      persist();
      updateHistoryControls();
      renderLivePreview(true);
      root.dataset.documentRevision = String(state.document_revision);
      const status = root.querySelector(".krea2-workspace-status");
      if (status) status.textContent = "Revision " + state.document_revision + " · Modified";
      for (const badge of root.querySelectorAll(".krea2-identity-status")) {
        const character = state.characters.find(character => character.id === badge.dataset.characterId);
        if (character) badge.textContent = identityStatus(character);
      }
      const performanceBadge = root.querySelector(".krea2-performance-preset-summary");
      const character = selectedCharacter();
      if (performanceBadge && character) {
        const preset = savedPresets.find(preset => preset.id === character.loaded_performance_preset_id);
        if (preset) performanceBadge.textContent = preset.label + (performanceModified(character) ? " · Modified" : "");
      }
    }

    function cloneJson(value) {
      return JSON.parse(JSON.stringify(value));
    }
    function trackDocumentDrag(move, release) {
      const stop = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", release); activeDrags.delete(stop); };
      activeDrags.add(stop);
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", release);
      return stop;
    }

    function diceButton(label, onClick, className) {
      return el("button", {
        type: "button",
        class: className || "krea2-wizard-btn krea2-icon-btn",
        title: label,
        "aria-label": label,
        onClick: onClick,
      }, icon("dice", { width: "14", height: "14" }));
    }

    function randomStrengthValue() {
      const minimum = Math.max(-3, Math.min(3, Number(state.random_strength_min) || 0));
      const maximum = Math.max(minimum, Math.min(3, Number(state.random_strength_max) || 0));
      const steps = Math.round((maximum - minimum) * 2);
      return Math.round((minimum + Math.floor(Math.random() * (steps + 1)) / 2) * 2) / 2;
    }

    function renderNodeSettings() {
      settingsHost.innerHTML = "";
      if (!state.settings_open) return;
      const panel = el("section", { class: "krea2-node-settings" });
      const close = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn",
        title: "Close settings",
        "aria-label": "Close settings",
        onClick: function () { state.settings_open = false; markDirty(); renderNodeSettings(); },
      }, icon("close", { width: "12", height: "12" }));
      panel.appendChild(el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "Randomization & output"),
        el("span", { class: "krea2-structured-spacer" }),
        close,
      ]));

      const profiles = el("div", { class: "krea2-random-profile-row" });
      [
        ["Gentle", 0, 1.5],
        ["Positive", 0, 3],
        ["Wild", -3, 3],
      ].forEach(function (profile) {
        const active = Number(state.random_strength_min) === profile[1]
          && Number(state.random_strength_max) === profile[2];
        profiles.appendChild(el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-random-profile" + (active ? " is-active" : ""),
          onClick: function () {
            state.random_strength_min = profile[1];
            state.random_strength_max = profile[2];
            markDirty();
            renderNodeSettings();
          },
        }, profile[0] + " " + profile[1] + " to +" + profile[2]));
      });

      function strengthSelect(label, key) {
        const select = el("select", {
          class: "krea2-compact-select",
          "aria-label": label,
          onChange: function (event) {
            state[key] = Number(event.target.value);
            if (state.random_strength_min > state.random_strength_max) {
              if (key === "random_strength_min") state.random_strength_max = state.random_strength_min;
              else state.random_strength_min = state.random_strength_max;
            }
            markDirty();
            renderNodeSettings();
          },
        });
        for (let value = -3; value <= 3.001; value += 0.25) {
          const rounded = Math.round(value * 4) / 4;
          select.appendChild(el("option", { value: String(rounded) }, (rounded > 0 ? "+" : "") + rounded));
        }
        select.value = String(state[key]);
        return el("label", { class: "krea2-settings-field" }, [el("span", null, label), select]);
      }

      panel.appendChild(el("div", { class: "krea2-settings-copy" },
        "Strengths for every dice action and every-job concept randomization."));
      panel.appendChild(profiles);
      panel.appendChild(el("div", { class: "krea2-settings-range" }, [
        strengthSelect("Minimum strength", "random_strength_min"),
        strengthSelect("Maximum strength", "random_strength_max"),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check krea2-metadata-toggle" }, [
        el("input", {
          type: "checkbox",
          checked: state.embed_prompt_metadata !== false,
          onChange: function (event) { state.embed_prompt_metadata = !!event.target.checked; markDirty(); },
        }),
        el("span", null, "Embed the exact generated prompt in image metadata"),
      ]));
      panel.appendChild(el("div", { class: "krea2-settings-copy" },
        "Connect Prompt Output to the text encoder used by the image. The normal Save Image node will then store the resolved text as krea2_prompt when metadata is enabled in ComfyUI."));
      panel.appendChild(el("label", { class: "krea2-inline-check", title: "Readers such as the Timesaver Artius Browser and A1111-style viewers show a plain-text 'prompt' metadata chunk as the Positive Prompt" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.prompt_metadata_override,
          onChange: function (event) {
            state.prompt_metadata_override = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Write the prompt as the standard 'prompt' metadata chunk (Timesaver / A1111 compatible)"),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check", title: "Grouped concept cards instead of plain prompt code in the Final Prompt Preview" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.pretty_preview,
          onChange: function (event) {
            state.pretty_preview = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Pretty Prompt Preview (grouped concept cards)"),
      ]));
      panel.appendChild(el("div", { class: "krea2-settings-field" }, [
        el("span", null, "Character Creator"),
        (function () {
          const select = el("select", {
            class: "krea2-compact-select",
            "aria-label": "Character Creator mode",
            onChange: function (event) {
              state.character_creator = event.target.value;
              markDirty();
              render();
            },
          });
          select.appendChild(el("option", { value: "legacy" }, "Legacy Character Creator"));
          select.appendChild(el("option", { value: "visual" }, "Visual Character Creator"));
          select.value = state.character_creator || "legacy";
          return select;
        })(),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.show_concepts_tab,
          onChange: function (event) {
            state.show_concepts_tab = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Show the advanced Concepts tab"),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.show_face_guidance,
          onChange: function (event) {
            state.show_face_guidance = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Show face guidance trigger fields on cast members"),
      ]));
      panel.appendChild(el("label", { class: "krea2-inline-check" }, [
        el("input", {
          type: "checkbox",
          checked: !!state.show_motion_prompt,
          onChange: function (event) {
            state.show_motion_prompt = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Show the video motion prompt section (LTX-2.3)"),
      ]));
      settingsHost.appendChild(panel);
    }

    function newCharacter() {
      const id = "character_" + Date.now().toString(36) + "_" + Math.random().toString(16).slice(2, 7);
      return {
        id: id,
        name: "Character " + ((state.characters || []).length + 1),
        enabled: true,
        // v2 redesign: cast cards start expanded so the four appearance
        // dropdowns, identity chips and concept rows are visible at once.
        expanded: true,
        identity: "",
        sex: "",
        age: "",
        ethnicity: "",
        subject: "",
        expression: "",
        clothing: "",
        ensemble: "",
        clothing_top: "",
        clothing_bottom: "",
        hair_style: "",
        hair_length: "",
        hair_color: "",
        makeup: "",
        eyes: "",
        nose: "",
        mouth: "",
        chin: "",
        face_shape: "",
        body_type: "",
        fitness: "",
        proportions: "",
        adult_description: "",
        character_ref: "",
        profile_image: "",
        profile_image_name: "",
        position: "",
        face_guidance: "",
        interaction: "",
        lora_triggers: "",
        lora_name: "",
        lora_strength: 0.8,
        loras: [],
        additional_info: "",
        additional_open: false,
        rows: [],
        concepts_open: true,
        quick_open: true,
        loras_open: true,
        randomize_fields: {},
        randomize_direction_groups: {},
      };
    }

    function profileShotLighting() {
      const phrases = (state.rows || []).filter(function (row) {
        return row && row.enabled !== false
          && ["lighting_setup", "lighting_direction", "lighting_effect", "film_color"].includes(row.category);
      }).map(function (row) {
        return String(row.phrase || row.label || "").trim();
      }).filter(Boolean);
      if (phrases.length) return phrases.slice(0, 4).join(", ");
      return "soft diffused studio lighting, a large soft key light at 45 degrees, gentle fill light, subtle rim light";
    }

    function buildProfileShotPrompt(character) {
      const name = String(character && character.name || "this character").trim();
      return [
        "professional character profile reference portrait of " + name,
        "chest-up three-quarter portrait, centered composition, looking directly at the camera",
        "neutral relaxed expression, shoulders visible, consistent facial features and costume details",
        profileShotLighting(),
        "plain seamless studio background, clean separation from the background, 85mm portrait lens, shallow depth of field",
        "high-detail photographic render, no text, no watermark",
      ].join(", ");
    }

    function applyProfileShotSetup(character) {
      const prompt = buildProfileShotPrompt(character);
      const current = String(character.additional_info || "").trim();
      if (current && current !== prompt && !window.confirm(
        "Replace the current Additional info with the profile-shot setup? You can undo this change.",
      )) return;
      character.additional_info = prompt;
      character.additional_open = true;
      state.active_tab = "cast";
      markDirty();
      render();
      showToast("Profile-shot prompt added to Additional info", "info");
    }

    function imageFileLooksSupported(file) {
      if (!file) return false;
      const type = String(file.type || "").toLowerCase();
      const name = String(file.name || "").toLowerCase();
      return /^image\/(jpeg|png|webp)$/.test(type) || /\.(jpe?g|png|webp)$/.test(name);
    }

    function storeProfileImage(character, file) {
      if (!imageFileLooksSupported(file)) {
        showToast("Choose a JPG, PNG, or WebP portrait image", "warning");
        return;
      }
      if (Number(file.size || 0) > 12 * 1024 * 1024) {
        showToast("That image is over 12 MB. Choose a smaller portrait render.", "warning");
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        const source = String(reader.result || "");
        const finish = function (dataUrl) {
          if (!dataUrl || dataUrl.length > 3_200_000) {
            showToast("That portrait is too large to store in the workflow", "warning");
            return;
          }
          character.profile_image = dataUrl;
          character.profile_image_name = String(file.name || "portrait.jpg");
          markDirty();
          render();
          showToast("Portrait reference added to " + (character.name || "the character"), "info");
        };
        if (!source || typeof window.Image !== "function") {
          finish(source);
          return;
        }
        const image = new window.Image();
        image.onload = function () {
          const maxEdge = 640;
          const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || image.width || 1, image.naturalHeight || image.height || 1));
          const width = Math.max(1, Math.round((image.naturalWidth || image.width || 1) * scale));
          const height = Math.max(1, Math.round((image.naturalHeight || image.height || 1) * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext && canvas.getContext("2d");
          if (!context || typeof canvas.toDataURL !== "function") {
            finish(source);
            return;
          }
          context.drawImage(image, 0, 0, width, height);
          finish(canvas.toDataURL("image/jpeg", 0.82));
        };
        image.onerror = function () { finish(source); };
        image.src = source;
      };
      reader.onerror = function () { showToast("Could not read that portrait image", "error"); };
      reader.readAsDataURL(file);
    }

    function renderCharacterPortrait(character, openPicker) {
      const source = String(character.profile_image || "").trim();
      const portrait = el("button", {
        type: "button",
        class: "krea2-character-portrait" + (source ? " has-image" : " is-empty"),
        title: source ? "Replace portrait reference" : "Add a portrait reference",
        "aria-label": source ? "Replace portrait reference" : "Add a portrait reference",
        onClick: openPicker,
        onDragover: function (event) { event.preventDefault(); portrait.classList.add("is-drop-target"); },
        onDragleave: function () { portrait.classList.remove("is-drop-target"); },
        onDrop: function (event) {
          event.preventDefault();
          portrait.classList.remove("is-drop-target");
          const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
          storeProfileImage(character, file);
        },
      });
      if (source) {
        portrait.appendChild(el("img", {
          src: source,
          alt: (character.name || "Character") + " portrait reference",
        }));
      } else {
        portrait.append(
          icon("camera", { width: "18", height: "18" }),
          el("span", null, "Add portrait"),
        );
      }
      return portrait;
    }

    function renderCharacterProfileTools(character, openPicker) {
      const choose = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-quiet-btn",
        onClick: openPicker,
      }, [icon("file", { width: "12", height: "12" }), " Choose portrait"]);
      const clear = character.profile_image ? el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-quiet-btn krea2-profile-clear",
        onClick: function () {
          character.profile_image = "";
          character.profile_image_name = "";
          markDirty();
          render();
        },
      }, "Clear") : null;
      const apply = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-profile-shot-button",
        title: "Fill Additional info with a profile-shot prompt using the current lighting concepts",
        onClick: function () { applyProfileShotSetup(character); },
      }, [icon("camera", { width: "12", height: "12" }), " Use profile-shot setup"]);
      return el("div", { class: "krea2-character-profile-tools" }, [
        el("div", { class: "krea2-character-profile-copy" }, [
          el("strong", null, character.profile_image ? "Portrait reference" : "Add a portrait reference"),
          el("span", null, character.profile_image
            ? (character.profile_image_name || "Saved in this workflow")
            : "Use a JPG render to make this character easy to recognize."),
        ]),
        el("div", { class: "krea2-character-profile-actions" }, [choose, clear, apply]),
      ]);
    }

    /* Seed a fresh character with the three default concept rows. Rows are
     * built from fallback data when the library has not loaded yet, then
     * enriched once fetchLibrary resolves. */
    function seedCharacterConcepts(character) {
      if (!Array.isArray(character.rows)) character.rows = [];
      for (const entry of SEED_ROWS) {
        const preset = library.find(function (item) { return item.id === entry[0]; });
        let row;
        if (preset) {
          row = presetToRow(preset, state);
          row.id = uniqueCharacterRowId(character);
        } else {
          const fallback = SEED_ROW_FALLBACKS[entry[0]] || {};
          row = {
            id: uniqueCharacterRowId(character),
            category: fallback.category || "custom",
            preset_id: entry[0],
            label: fallback.label || entry[0],
            phrase: fallback.phrase || "",
            control_mode: "scalar",
            intensity: 0,
            strength: entry[1],
            enabled: true,
            aliases: [],
            verification: "general visual vocabulary",
            source: "seed",
          };
        }
        row.strength = entry[1];
        character.rows.push(row);
      }
    }

    function enrichSeedRows() {
      for (const character of (state.characters || [])) {
        for (const row of (character.rows || [])) {
          if (row.source !== "seed") continue;
          const preset = library.find(function (item) { return item.id === row.preset_id; });
          if (!preset) continue;
          row.category = preset.category || row.category;
          row.label = preset.label || row.label;
          row.phrase = preset.phrase || row.phrase;
          row.intensity = parseInt(preset.default_strength, 10) || row.intensity;
          row.source = "library";
        }
      }
    }

    function ensureStructuredState() {
      if (!Array.isArray(state.characters)) state.characters = [];
      if (!Array.isArray(state.character_presets)) state.character_presets = [];
      if (!state.setting || typeof state.setting !== "object") {
        state.setting = { enabled: false, name: "", description: "" };
      }
      if (!Array.isArray(state.setting_presets)) state.setting_presets = [];
      if (state.characters.length && !state.characters.some(function (item) {
        return item.id === state.selected_character_id;
      })) state.selected_character_id = state.characters[0].id;
    }

    function randomChoice(values) {
      return values[Math.floor(Math.random() * values.length)] || "";
    }

    function renderStructuredEditors() {
      render();
    }

    /* --- Per-character direction (emotion, face, body, position) --- */

    function uniqueCharacterRowId(character) {
      let id;
      const taken = new Set(state.rows.map(function (row) { return row.id; }));
      (state.characters || []).forEach(function (item) {
        (item.rows || []).forEach(function (row) { taken.add(row.id); });
      });
      do {
        id = "crow_" + Math.random().toString(16).slice(2, 12);
      } while (taken.has(id));
      return id;
    }

    function addCharacterRow(character, preset) {
      if (!Array.isArray(character.rows)) character.rows = [];
      const row = presetToRow(preset, state);
      row.id = uniqueCharacterRowId(character);
      character.rows.push(row);
      markDirty();
      render();
    }

    function removeCharacterRow(character, rowId) {
      character.rows = (character.rows || []).filter(function (row) { return row.id !== rowId; });
      markDirty();
      render();
    }

    function editCharacterRow(character, row) {
      // Replace picker is scoped to the concept group the row belongs to,
      // so clicking "Arms Crossed" never offers emotion concepts.
      const group = CHARACTER_CONCEPT_GROUPS.find(function (item) {
        return item.categories.includes(row.category);
      }) || null;
      showSearchableSelector({
        presets: characterRowPresets(),
        title: "Replace " + (row.label || "concept"),
        categories: group ? group.categories : CHARACTER_PICKER_CATEGORIES,
        multiSelect: false,
        selectedIds: [row.preset_id],
        initialPresetId: row.preset_id,
        filterPreset: characterConflictFilter(character),
        onClose: function () { render(); },
        getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
        onColorChange: function (presetId, newColor) {
          state.concept_colors = state.concept_colors || {};
          if (newColor) state.concept_colors[presetId] = newColor;
          else delete state.concept_colors[presetId];
          markDirty();
        },
        onPick: function (preset) {
          const replacement = presetToRow(preset, state);
          replacement.id = row.id;
          replacement.strength = row.strength;
          replacement.enabled = row.enabled;
          const index = (character.rows || []).findIndex(function (item) { return item.id === row.id; });
          if (index >= 0) character.rows[index] = replacement;
          markDirty();
          render();
        },
      });
    }

    function characterRowPresets() {
      return compatibleLibrary().filter(function (preset) {
        return DIRECTION_CATEGORIES.includes(preset.category) && !preset.disabled;
      });
    }

    function characterRowCtx(character, rows) {
      return {
        presets: library,
        conceptColors: state.concept_colors,
        markDirty: markDirty,
        persistConceptColors: function () { saveConceptColors(state.concept_colors || {}).catch(function () {}); },
        refresh: render,
        removeRow: function (id) { removeCharacterRow(character, id); },
        onReorder: function (parent) {
          const ids = Array.prototype.map.call(parent.querySelectorAll(".krea2-row"), function (element) {
            return element.dataset.rowId;
          });
          const reordered = ids.map(function (id) {
            return (character.rows || []).find(function (row) { return row.id === id; });
          }).filter(Boolean);
          const scopedIds = new Set(rows.map(function (row) { return row.id; }));
          character.rows = (character.rows || []).map(function (row) {
            return scopedIds.has(row.id) ? reordered.shift() : row;
          });
          markDirty();
        },
        editRow: function (row) { editCharacterRow(character, row); },
        onHover: setRowHover,
      };
    }

    function characterRowBlock(character, categories, title, emptyHint) {
      const rows = (character.rows || []).filter(function (row) {
        return categories.includes(row.category);
      });
      const block = el("div", { class: "krea2-direction-block" });
      const header = el("div", { class: "krea2-direction-block-head" }, [
        el("strong", null, title),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-quiet-btn",
          onClick: function () {
            showSearchableSelector({
              presets: characterRowPresets(),
              title: "Add " + title + " for " + (character.name || "this character"),
              categories: categories,
              multiSelect: true,
              selectedIds: rows.map(function (row) { return row.preset_id; }),
              onToggle: function (preset, shouldSelect) {
                if (shouldSelect) {
                  addCharacterRow(character, preset);
                } else {
                  const existing = (character.rows || []).find(function (row) {
                    return row.preset_id === preset.id;
                  });
                  if (existing) removeCharacterRow(character, existing.id);
                }
              },
              onClose: function () { render(); },
              getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
              onColorChange: function (presetId, newColor) {
                state.concept_colors = state.concept_colors || {};
                if (newColor) state.concept_colors[presetId] = newColor;
                else delete state.concept_colors[presetId];
                markDirty();
              },
            });
          },
        }, "+ Add"),
      ]);
      block.appendChild(header);
      if (!rows.length) {
        block.appendChild(el("div", { class: "krea2-wizard-empty" }, emptyHint || "Nothing set yet."));
        return block;
      }
      const content = el("div", { class: "krea2-direction-rows" });
      for (const row of rows) {
        content.appendChild(renderRow(row, characterRowCtx(character, rows)));
      }
      block.appendChild(content);
      return block;
    }

    function toggleQuickDirection(character, quick) {
      const ids = quick.presets.map(function (entry) { return entry[0]; });
      const hasAny = (character.rows || []).some(function (row) {
        return ids.includes(row.preset_id);
      });
      if (hasAny) {
        // Clicking an active quick direction removes its whole set.
        character.rows = (character.rows || []).filter(function (row) {
          return !ids.includes(row.preset_id);
        });
      } else {
        if (!Array.isArray(character.rows)) character.rows = [];
        const existingIds = new Set(character.rows.map(function (row) { return row.preset_id; }));
        for (const entry of quick.presets) {
          const preset = library.find(function (item) { return item.id === entry[0]; });
          if (!preset || existingIds.has(preset.id)) continue;
          const row = presetToRow(preset, state);
          row.id = uniqueCharacterRowId(character);
          row.strength = entry[1];
          character.rows.push(row);
          existingIds.add(preset.id);
        }
      }
      markDirty();
      render();
    }

    function renderQuickDirectionChips(character) {
      const chips = el("div", { class: "krea2-emotion-chips krea2-quick-directions" });
      const ids = new Set((character.rows || []).map(function (row) { return row.preset_id; }));
      for (const quick of QUICK_DIRECTIONS) {
        const active = quick.presets.some(function (entry) { return ids.has(entry[0]); });
        const chip = el("button", {
          type: "button",
          class: "krea2-emotion-chip" + (active ? " is-active" : ""),
          title: active
            ? "Remove the whole \u201c" + quick.label + "\u201d direction"
            : "Add the \u201c" + quick.label + "\u201d direction (emotion, face, and body together)",
          onClick: function () { toggleQuickDirection(character, quick); },
        }, quick.label);
        chips.appendChild(chip);
      }
      return chips;
    }

    /* Direction groups: the same category structure as the Concepts tab,
     * scoped to one cast member. */
    const DIRECTION_GROUPS = [
      { id: "emotion", icon: "sparkle", label: "Emotion", categories: EMOTION_CATEGORIES, emptyHint: "No emotion set." },
      { id: "face", icon: "eye", label: "Face", categories: FACE_CATEGORIES, emptyHint: "No facial action set." },
      { id: "body", icon: "users", label: "Body", categories: BODY_CATEGORIES, emptyHint: "No body language set." },
    ];

    function directionGroupPresetId(groupKey) {
      return "direction_" + groupKey;
    }

    function randomizeCharacterDirection(character, group) {
      return resolveRandom({ kind: "group", group: group.id, character_id: character.id });
    }

    function saveCharacterDirectionPreset(character, groupKey, suggestedLabel) {
      return createWorkspacePreset("group", directionGroupPresetId(groupKey));
    }

    function loadCharacterDirectionPreset(character, groupKey, presetId) {
      const preset = savedPresets.find(item => item.id === presetId);
      if (preset) applyWorkspacePreset(preset);
    }

    function buildCharacterDirectionPresetPicker(character, groupKey) {
      const select = el("select", {
        class: "krea2-wizard-group-preset",
        "aria-label": groupKey + " direction presets",
        onChange: function (event) {
          const presetId = event.target.value;
          select.value = "";
          if (presetId) loadCharacterDirectionPreset(character, groupKey, presetId);
        },
      });
      select.appendChild(el("option", { value: "" }, "Presets..."));
      const groupPresets = savedPresets.filter(function (item) {
        return item.scope === "group" && item.group === directionGroupPresetId(groupKey)
          && Array.isArray(item.rows);
      });
      for (const preset of groupPresets) {
        select.appendChild(el("option", { value: preset.id }, preset.label));
      }
      const lastLoaded = (character.loaded_direction_presets || {})[groupKey];
      if (lastLoaded && groupPresets.some(function (p) { return p.id === lastLoaded; })) {
        select.value = lastLoaded;
      }
      return select;
    }

    /* Direction sections styled like the Concepts tab: header with the
     * count on the right, and the full action set (Add, presets, save,
     * randomize, shuffle each job). In the three-column layout the group
     * headers are NOT collapsible — only the parent container toggles. */
    function renderCharacterDirectionBlock(character, groupKey, opts) {
      const group = CHARACTER_CONCEPT_GROUPS.find(function (item) { return item.id === groupKey; })
        || DIRECTION_GROUPS.find(function (item) { return item.id === groupKey; });
      const collapsible = !opts || opts.collapsible !== false;
      const rows = (character.rows || []).filter(function (row) {
        return group.categories.includes(row.category);
      });
      const section = el("section", { class: "krea2-wizard-category krea2-character-category" });
      const collapsed = !!(character.collapsed_direction || {})[groupKey];
      section.classList.toggle("is-collapsed", collapsed);
      const header = el("div", { class: "krea2-wizard-category-header" }, [
        el("strong", { class: "krea2-wizard-category-title" }, group.label),
        el("span", { class: "krea2-wizard-category-count" },
          rows.length + (rows.length === 1 ? " concept" : " concepts")),
      ]);
      const addBtn = el("button", {
        type: "button",
        class: "krea2-wizard-category-add",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          showSearchableSelector({
            presets: characterRowPresets(),
            title: "Add " + group.label + " for " + (character.name || "this character"),
            categories: group.categories,
            multiSelect: true,
            selectedIds: rows.map(function (row) { return row.preset_id; }),
            filterPreset: characterConflictFilter(character),
            onToggle: function (preset, shouldSelect) {
              if (shouldSelect) {
                addCharacterRow(character, preset);
              } else {
                const existing = (character.rows || []).find(function (row) {
                  return row.preset_id === preset.id;
                });
                if (existing) removeCharacterRow(character, existing.id);
              }
            },
            onClose: function () { render(); },
            getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
            onColorChange: function (presetId, newColor) {
              state.concept_colors = state.concept_colors || {};
              if (newColor) state.concept_colors[presetId] = newColor;
              else delete state.concept_colors[presetId];
              markDirty();
            },
          });
        },
      }, icon("plus", { width: "12", height: "12" }));
      const presetSelect = buildCharacterDirectionPresetPicker(character, groupKey);
      const saveBtn = el("button", {
        type: "button",
        class: "krea2-wizard-category-save krea2-icon-btn",
        title: "Save these direction concepts as a reusable preset",
        "aria-label": "Save " + group.label + " preset",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          saveCharacterDirectionPreset(character, groupKey);
        },
      }, icon("save", { width: "12", height: "12" }));
      const randomBtn = diceButton(
        "Replace this direction with a random combination",
        function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          randomizeCharacterDirection(character, group);
        },
        "krea2-wizard-category-random krea2-icon-btn",
      );
      const eachJobOn = !!(character.randomize_direction_groups || {})[groupKey];
      const randomEachJob = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (eachJobOn ? " is-active" : ""),
        title: eachJobOn
          ? "Shuffle on: this direction is randomized for every queued job. Click to stop."
          : "Shuffle off: this direction is randomized once when you press the dice. Click to randomize it every queued job.",
        "aria-label": "Randomize this direction every queued job",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (!character.randomize_direction_groups) character.randomize_direction_groups = {};
          character.randomize_direction_groups[groupKey] = !character.randomize_direction_groups[groupKey];
          markDirty();
          render();
        },
      }, icon("shuffle", { width: "13", height: "13" }));
      const actions = el("div", { class: "krea2-wizard-category-actions" }, [
        addBtn,
        presetSelect,
        saveBtn,
        el("div", { class: "krea2-wizard-random-controls" }, [randomBtn, randomEachJob]),
      ]);
      const content = el("div", { class: "krea2-wizard-category-content" });
      if (!rows.length) {
        content.appendChild(el("div", { class: "krea2-wizard-empty" }, group.emptyHint));
      } else {
        for (const row of rows) {
          content.appendChild(renderRow(row, characterRowCtx(character, rows)));
        }
      }
      if (collapsed) {
        actions.style.display = "none";
        content.style.display = "none";
      }
      if (collapsible) {
        header.addEventListener("click", function (event) {
          const target = event && event.target;
          if (target && typeof target.closest === "function"
              && target.closest("button,select,input,label,.krea2-wizard-category-actions")) return;
          character.collapsed_direction = character.collapsed_direction || {};
          const next = !character.collapsed_direction[groupKey];
          character.collapsed_direction[groupKey] = next;
          actions.style.display = next ? "none" : "";
          content.style.display = next ? "none" : "";
          section.classList.toggle("is-collapsed", next);
          markDirty();
        });
      }
      section.appendChild(header);
      section.appendChild(actions);
      section.appendChild(content);
      return section;
    }

    function renderCharacterDirection(character) {
      const section = el("div", { class: "krea2-character-direction" });
      section.appendChild(el("div", { class: "krea2-direction-heading" },
        "Direction — emotion, face and body for this character only"));

      /* Three side-by-side concept sections with the full action set */
      const grid = el("div", { class: "krea2-direction-columns" });
      for (const group of DIRECTION_GROUPS) {
        grid.appendChild(renderCharacterDirectionBlock(character, group.id));
      }
      section.appendChild(grid);

      /* Face guidance free text (advanced, hidden by default) */
      if (state.show_face_guidance) {
        const guidance = el("div", { class: "krea2-direction-guidance" });
        guidance.appendChild(el("div", { class: "krea2-direction-block-head" }, [
          el("strong", null, "Face guidance triggers"),
          el("span", { class: "krea2-direction-hint" }, "one (trigger:weight) per line, emitted verbatim"),
        ]));
        guidance.appendChild(el("textarea", {
          class: "krea2-compact-textarea krea2-face-guidance",
          rows: "3",
          "aria-label": "Face guidance triggers",
          placeholder: "(sparkling bright eyes:1.4)\n(genuine warm smile:1.2)",
          onInput: function (event) { character.face_guidance = event.target.value; markDirty(); },
        }, character.face_guidance || ""));
        section.appendChild(guidance);
      }

      /* Interaction with other cast members */
      const others = (state.characters || []).filter(function (item) {
        return item.id !== character.id && item.enabled !== false;
      }).map(function (item) { return item.name; }).filter(Boolean);
      const interaction = el("div", { class: "krea2-direction-interaction" });
      interaction.appendChild(el("div", { class: "krea2-direction-block-head" }, [
        el("strong", null, "Interaction"),
        el("span", { class: "krea2-direction-hint" }, "e.g. looking at " + (others[0] || "the other character")),
      ]));
      const interactionInput = el("input", {
        type: "text",
        class: "krea2-compact-input",
        value: character.interaction || "",
        placeholder: "looking at Alex",
        list: "krea2-interaction-suggestions-" + character.id,
        "aria-label": "Interaction with other characters",
        onInput: function (event) { character.interaction = event.target.value; markDirty(); },
      });
      const suggestions = el("datalist", { id: "krea2-interaction-suggestions-" + character.id });
      for (const other of others) {
        suggestions.appendChild(el("option", { value: "looking at " + other }));
        suggestions.appendChild(el("option", { value: "smiling at " + other }));
        suggestions.appendChild(el("option", { value: "pointing at " + other }));
        suggestions.appendChild(el("option", { value: "leaning toward " + other }));
        suggestions.appendChild(el("option", { value: "facing away from " + other }));
      }
      interaction.appendChild(interactionInput);
      interaction.appendChild(suggestions);
      section.appendChild(interaction);
      return section;
    }

    function avatarColor(value, fallback) {
      const colors = {
        black: "#24242a", "jet black": "#16161a", "dark brown": "#4b2e24",
        "chestnut brown": "#6b4226", auburn: "#8c3f2b", copper: "#b4531f",
        red: "#c74735", ginger: "#c96a3a", "strawberry blonde": "#d99a6c",
        blonde: "#d9b65e", "honey blonde": "#d4a94f", "platinum blonde": "#eee6c9",
        "ash blonde": "#c9c4b8", silver: "#aeb6c2", white: "#f4f2ee",
        grey: "#8a9098", blue: "#367bd6", teal: "#1f8f8f", purple: "#7a5fb8",
        pink: "#d85b9f", green: "#3e8e54", rainbow: "#c45a8a", ombre: "#8c5a4a",
        balayage: "#a86a4a", highlights: "#c9a25e", lowlights: "#5a4030",
        "two-tone": "#8a4a9a",
        orange: "#d97a3d", amber: "#d9a441", yellow: "#dfc24d",
        cyan: "#37b7cc", navy: "#2b3a66", magenta: "#b84a9e",
      };
      return colors[value] || fallback;
    }

    function skinColorTone(value) {
      const map = {
        white: "#f2dcc8", blonde: "#f0ddc4", silver: "#e6d6c4", grey: "#b8a898",
        black: "#3a2a22", "dark brown": "#5c3b26", brown: "#8a5a3b", auburn: "#a86a4a",
        red: "#c96a5a", orange: "#d99a6c", amber: "#d9a97a", yellow: "#e6c890",
        green: "#7d9e7a", teal: "#6d9e96", cyan: "#a8ccd6", blue: "#7d9ec8",
        navy: "#5a6a8a", purple: "#9a86b8", magenta: "#b88aa8", pink: "#e8a8b8",
      };
      return map[String(value || "").toLowerCase()] || "#d9ad8b";
    }

    function irisColors(eyeColor) {
      const value = String(eyeColor || "").toLowerCase();
      const map = {
        "bright blue eyes": ["#3b78d6", "#3b78d6"], "icy blue eyes": ["#8fc4f0", "#8fc4f0"],
        "green eyes": ["#3e8e54", "#3e8e54"], "hazel eyes": ["#8a6f2a", "#8a6f2a"],
        "brown eyes": ["#5b3a24", "#5b3a24"], "dark brown eyes": ["#43301f", "#43301f"],
        "black eyes": ["#26262c", "#26262c"], "grey eyes": ["#9aa3ab", "#9aa3ab"],
        "amber eyes": ["#c98a2e", "#c98a2e"], "violet eyes": ["#7a5fb8", "#7a5fb8"],
        "heterochromatic eyes": ["#3b78d6", "#3e8e54"],
        black: ["#1f1f24", "#1f1f24"], white: ["#f4f2ee", "#f4f2ee"],
        grey: ["#9aa3ab", "#9aa3ab"], silver: ["#c8ccd2", "#c8ccd2"],
        brown: ["#5b3a24", "#5b3a24"], "dark brown": ["#43301f", "#43301f"],
        blonde: ["#d9b65e", "#d9b65e"], auburn: ["#8c4a2e", "#8c4a2e"],
        red: ["#c74735", "#c74735"], orange: ["#d97a3d", "#d97a3d"],
        amber: ["#c98a2e", "#c98a2e"], yellow: ["#d9c44d", "#d9c44d"],
        green: ["#3e8e54", "#3e8e54"], teal: ["#1f8f8f", "#1f8f8f"],
        cyan: ["#37b7cc", "#37b7cc"], blue: ["#3b78d6", "#3b78d6"],
        navy: ["#2b3a66", "#2b3a66"], purple: ["#7a5fb8", "#7a5fb8"],
        magenta: ["#b84a9e", "#b84a9e"], pink: ["#e07a9e", "#e07a9e"],
      };
      return map[value] || ["#5b3a24", "#5b3a24"];
    }

    function slugify(value) {
      return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    function characterAgeClass(character) {
      const age = String(character.age || "").toLowerCase();
      if (age.includes("child") || age.includes("teen")) return "is-child";
      if (age.includes("middle")) return "is-middle-aged";
      if (age.includes("elder")) return "is-elderly";
      return "";
    }

    function characterSexClass(character) {
      const sex = String(character.sex || "").toLowerCase();
      if (sex === "male") return "is-male";
      if (sex === "female") return "is-female";
      return "is-unspecified";
    }

    function buildCharacterAvatar(character) {
      const hairColor = avatarColor(character.hair_color, "#4b2e24");
      const iris = irisColors(character.eyes);
      const clothing = String(
        character.clothing || character.ensemble || character.clothing_top || "",
      ).toLowerCase();
      const outfitColor = clothing.includes("sci-fi") ? "#405a78"
        : clothing.includes("armour") ? "#6c7582"
        : clothing.includes("fantasy") || clothing.includes("medieval") ? "#72513d"
        : clothing.includes("formal") || clothing.includes("suit") || clothing.includes("tuxedo") ? "#303844"
        : clothing.includes("streetwear") || clothing.includes("biker") ? "#8a4160"
        : clothing.includes("leather") || clothing.includes("noir") ? "#5c4433"
        : clothing.includes("flapper") || clothing.includes("gown") || clothing.includes("ballgown") ? "#8a4a6a"
        : clothing.includes("military") || clothing.includes("fatigues") ? "#4a5c4a"
        : clothing.includes("lab") || clothing.includes("chef") || clothing.includes("scrubs") ? "#cfd6df"
        : clothing.includes("cowboy") || clothing.includes("western") ? "#8a6a4a"
        : clothing.includes("samurai") || clothing.includes("ninja") ? "#3a3f4a"
        : clothing.includes("pirate") ? "#5c4633"
        : clothing.includes("clown") ? "#d85b5b"
        : clothing.includes("hazmat") || clothing.includes("spacesuit") ? "#cfd6df"
        : "#477f72";
      const avatar = el("div", {
        class: "krea2-avatar " + characterSexClass(character) + " " + characterAgeClass(character),
        role: "img",
        "aria-label": "Simple preview of " + (character.name || "this character"),
        style: {
          "--krea2-avatar-hair": hairColor,
          "--krea2-avatar-outfit": outfitColor,
          "--krea2-avatar-iris": iris[0],
          "--krea2-avatar-iris-r": iris[1],
          "--krea2-avatar-skin": skinColorTone(character.skin_color),
        },
      });
      const art = el("div", { class: "krea2-avatar-art" });
      art.append(
        el("div", { class: "krea2-avatar-hair-back " + slugify(character.hair_length || "short") }),
        el("div", { class: "krea2-avatar-ear left" }),
        el("div", { class: "krea2-avatar-ear right" }),
        el("div", { class: "krea2-avatar-body " + slugify(character.body_type || "average") }),
        el("div", { class: "krea2-avatar-neck" }),
      );
      const head = el("div", {
        class: "krea2-avatar-head " + slugify(character.face_shape || "oval") + " chin-" + slugify(character.chin || "rounded"),
      });
      head.append(
        el("div", { class: "krea2-avatar-hair-front " + slugify(character.hair_style || "straight") }),
        el("div", { class: "krea2-avatar-brow left" }),
        el("div", { class: "krea2-avatar-brow right" }),
        el("div", { class: "krea2-avatar-eye-wrap left " + slugify(character.eyes || "almond") }, [
          el("div", { class: "krea2-avatar-eye-white" }),
          el("div", { class: "krea2-avatar-iris" }),
          el("div", { class: "krea2-avatar-pupil" }),
          el("div", { class: "krea2-avatar-lid" }),
        ]),
        el("div", { class: "krea2-avatar-eye-wrap right " + slugify(character.eyes || "almond") }, [
          el("div", { class: "krea2-avatar-eye-white" }),
          el("div", { class: "krea2-avatar-iris" }),
          el("div", { class: "krea2-avatar-pupil" }),
          el("div", { class: "krea2-avatar-lid" }),
        ]),
        el("div", { class: "krea2-avatar-bag left" }),
        el("div", { class: "krea2-avatar-bag right" }),
        el("div", { class: "krea2-avatar-nose " + slugify(character.nose || "straight") }),
        el("div", { class: "krea2-avatar-mouth " + avatarMouthClass(character) }),
      );
      art.appendChild(head);
      avatar.appendChild(art);
      avatar.appendChild(el("div", { class: "krea2-avatar-label" }, character.name || "Character"));
      return avatar;
    }

    function avatarMouthClass(character) {
      const expression = characterEmotionLabel(character);
      const mouth = String(character.mouth || "").toLowerCase();
      if (mouth.includes("smile") || mouth.includes("cupid")) return "happy";
      if (mouth.includes("pout") || mouth.includes("small")) return "pouty";
      if (mouth.includes("thin")) return "neutral";
      if (mouth.includes("wide") || mouth.includes("full")) return "open";
      if (expression.includes("smile") || expression.includes("joy") || expression.includes("laugh") || expression.includes("happy") || expression.includes("amuse") || expression.includes("flirt")) return "happy";
      if (expression.includes("smirk")) return "smirk";
      if (expression.includes("sad") || expression.includes("grief") || expression.includes("cry") || expression.includes("despair") || expression.includes("melanchol")) return "sad";
      if (expression.includes("anger") || expression.includes("rage") || expression.includes("fury")) return "frown";
      if (expression.includes("shock") || expression.includes("surpris") || expression.includes("terror") || expression.includes("panic") || expression.includes("fear") || expression.includes("gasp")) return "open";
      if (expression.includes("bored") || expression.includes("numb") || expression.includes("flat")) return "neutral";
      return "neutral";
    }

    function characterEmotionLabel(character) {
      const rows = (character.rows || []).filter(function (row) {
        return row && row.category === "emotion" && row.enabled !== false;
      });
      if (rows.length) return String(rows[0].label || rows[0].phrase || "").toLowerCase();
      return String(character.expression || "").toLowerCase();
    }

    function availableCharacterPresets() {
      const presets = CHARACTER_PRESETS.map(function (preset) { return { source: "builtin", preset: preset }; });
      savedPresets.filter(function (preset) { return preset.scope === "character"; }).forEach(function (preset) {
        presets.push({ source: "saved", preset: preset });
      });
      (state.character_presets || []).forEach(function (preset) {
        presets.push({ source: "workflow", preset: preset });
      });
      return presets;
    }

    function characterSummary(character) {
      const parts = [];
      if (character.sex) parts.push(String(character.sex));
      if (character.age) parts.push(String(character.age));
      const look = character.ensemble || character.clothing_top || character.clothing || "";
      if (look) parts.push(String(look));
      const hair = character.hair_color || character.hair_style || "";
      if (hair) parts.push(String(hair));
      return parts.join(" · ");
    }

    function comboboxForField(character, field) {
      const listId = "krea2-appearance-" + field.key + "-" + (character.id || "char");
      const input = el("input", {
        type: "text",
        class: "krea2-compact-input krea2-combobox",
        list: listId,
        value: character[field.key] || "",
        "aria-label": field.label,
        placeholder: "Pick or type…",
        onInput: function (event) {
          applyAppearanceValue(character, field, event.target.value);
        },
      });
      // When the field already holds a preset value, opening the dropdown
      // again shows ALL options (not just the currently selected one).
      input.addEventListener("focus", function () {
        if (field.options.includes(input.value)) {
          input.dataset.holdValue = input.value;
          input.value = "";
        }
      });
      input.addEventListener("blur", function () {
        if (input.dataset.holdValue && !input.value.trim()) {
          input.value = input.dataset.holdValue;
        }
        delete input.dataset.holdValue;
      });
      const datalist = el("datalist", { id: listId });
      // Blank first entry: picking it clears the field. Options are sorted
      // alphabetically (Age keeps its youngest-to-oldest order).
      datalist.appendChild(el("option", { value: "" }));
      const ordered = field.natural ? (field.options || []) : sortedOptions(field.options);
      for (const option of ordered) {
        datalist.appendChild(el("option", { value: option }));
      }
      return { input: input, datalist: datalist };
    }

    function applyAppearanceValue(character, field, rawValue) {
      const value = String(rawValue || "").trim();
      character[field.key] = value;
      if (field.key === "ethnicity" && value && !character.skin_color) {
        // Picking an ethnicity suggests a matching default skin tone
        // (still fully editable afterwards).
        character.skin_color = ETHNICITY_SKIN[value.toLowerCase()] || "";
      }
      if (field.key === "ensemble" && value) {
        // Choosing an ensemble disables the separates.
        character.clothing_top = "";
        character.clothing_bottom = "";
      }
      if ((field.key === "clothing_top" || field.key === "clothing_bottom") && value) {
        // Using separates disables the ensemble.
        character.ensemble = "";
      }
      // Typing must never re-render mid-keystroke (that steals focus).
      markDirty();
    }

    const scheduleAppearanceRender = debounce(function () { render(); }, 350);

    function randomizeAppearanceField(character, field) {
      return resolveRandom({ kind: "field", character_id: character.id, field: field.key, pool: field.options });
    }

    function setAppearanceFieldEachJob(character, field, enabled) {
      if (!character.randomize_fields) character.randomize_fields = {};
      if (enabled) {
        character.randomize_fields[field.key] = field.options.slice();
      } else {
        delete character.randomize_fields[field.key];
      }
    }

    function buildAppearanceFieldRow(character, field) {
      const combobox = comboboxForField(character, field);
      const eachRun = !!(character.randomize_fields || {})[field.key];
      const useEnsemble = Boolean(String(character.ensemble || "").trim());
      const isSeparate = field.key === "clothing_top" || field.key === "clothing_bottom";
      const disabledByEnsemble = useEnsemble && isSeparate;
      const hint = disabledByEnsemble ? "disabled — an ensemble is chosen" : "";
      if (disabledByEnsemble) {
        combobox.input.disabled = true;
        combobox.input.title = hint;
      }
      const randomBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-random",
        title: disabledByEnsemble
          ? field.label + " is disabled because an ensemble is chosen."
          : "Roll " + field.label + " once now.",
        "aria-label": "Randomize " + field.label + " once",
        disabled: disabledByEnsemble,
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (disabledByEnsemble) return;
          randomizeAppearanceField(character, field);
          markDirty();
          render();
        },
      }, "🎲");
      const eachJobBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-each-job krea2-shuffle" + (eachRun ? " is-active" : ""),
        title: eachRun
          ? field.label + " randomizes for every queued job. Click to keep it fixed."
          : "Keep " + field.label + " changing for every queued job.",
        "aria-label": eachRun
          ? field.label + " randomizes every queued job"
          : "Randomize " + field.label + " every queued job",
        "aria-pressed": eachRun ? "true" : "false",
        disabled: disabledByEnsemble,
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (disabledByEnsemble) return;
          setAppearanceFieldEachJob(character, field, !eachRun);
          markDirty();
          render();
        },
      }, icon("shuffle", { width: "13", height: "13" }));
      const row = el("label", { class: "krea2-character-field" + (disabledByEnsemble ? " is-disabled" : "") }, [
        el("span", null, field.label),
        el("div", { class: "krea2-field-row" }, [
          combobox.input,
          combobox.datalist,
          el("div", { class: "krea2-field-random-controls" }, [randomBtn, eachJobBtn]),
        ]),
      ]);
      return row;
    }

    function appearanceColumns(character) {
      const grid = el("div", { class: "krea2-character-columns" });
      for (const layout of CHARACTER_COLUMN_LAYOUT) {
        const fields = CHARACTER_APPEARANCE.filter(function (field) {
          return layout[1].includes(field.group);
        });
        if (!fields.length) continue;
        const col = el("div", { class: "krea2-character-column" });
        col.appendChild(el("div", { class: "krea2-character-column-title" }, layout[0]));
        for (const field of fields) {
          col.appendChild(buildAppearanceFieldRow(character, field));
        }
        grid.appendChild(col);
      }
      /* Additional characteristics: hidden behind a checkbox, auto-expanding. */
      const additionalOpen = character.additional_open === true;
      const additionalCheck = el("label", { class: "krea2-inline-check krea2-additional-toggle" }, [
        el("input", {
          type: "checkbox",
          checked: additionalOpen,
          onChange: function (event) {
            character.additional_open = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Additional info"),
      ]);
      const gridWrap = el("div", { class: "krea2-character-grid-wrap" }, [grid, additionalCheck]);
      if (additionalOpen) {
        const additional = el("textarea", {
          class: "krea2-compact-textarea krea2-additional-info",
          rows: "2",
          "aria-label": "Additional characteristics",
          placeholder: "A mole on her cheek, an eyepatch over one eye, a scar…",
          onInput: function (event) {
            character.additional_info = event.target.value;
            autoExpandTextarea(event);
            markDirty();
          },
        }, character.additional_info || "");
        autoExpandTextarea({ target: additional });
        gridWrap.appendChild(additional);
      }
      return gridWrap;
    }

    function loraFileNameStem(name) {
      return String(name || "")
        .replace(/\.(safetensors|ckpt|pt|bin)$/i, "")
        .replace(/[_-]+/g, " ")
        .trim();
    }

    /* Shared LoRA picker + strength slider, used by the full LoRA section
     * and the compact B2 expanded-state cards. */
    function buildLoraSelect(character) {
      const loraSelect = el("select", {
        class: "krea2-compact-select",
        "aria-label": "LoRA for " + (character.name || "this character"),
        onChange: function (event) {
          const name = event.target.value;
          character.lora_name = name;
          if (name && !String(character.lora_triggers || "").trim()) {
            const stem = loraFileNameStem(name);
            if (stem) character.lora_triggers = stem;
          }
          markDirty();
          render();
        },
      });
      loraSelect.appendChild(el("option", { value: "" }, "No LoRA — " + (loras.length ? loras.length + " available" : "connect to list your loras")));
      for (const name of loras) {
        loraSelect.appendChild(el("option", { value: name }, name));
      }
      if (loras.includes(character.lora_name)) loraSelect.value = character.lora_name;
      return loraSelect;
    }

    function buildLoraStrengthControl(character) {
      const strength = Number(character.lora_strength) || 0.8;
      const strengthInput = el("input", {
        type: "range",
        min: "0",
        max: "2",
        step: "0.05",
        value: String(strength),
        class: "krea2-lora-strength",
        "aria-label": "LoRA strength",
        onInput: function (event) {
          character.lora_strength = Math.round(Number(event.target.value) * 20) / 20;
          markDirty();
          scheduleAppearanceRender();
        },
      });
      const strengthValue = el("span", { class: "krea2-lora-strength-value" }, strength.toFixed(2));
      return { input: strengthInput, value: strengthValue };
    }

    function renderLoraSection(character) {
      const section = el("div", { class: "krea2-lora-section" });
      const picker = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-quiet-btn",
        onClick: function () {
          showSearchableSelector({
            presets: characterRowPresets(),
            title: "Add LoRA trigger words for " + (character.name || "this character"),
            categories: LORA_CATEGORIES,
            multiSelect: true,
            selectedIds: [],
            onToggle: function (preset, shouldSelect) {
              if (!shouldSelect) return;
              const lines = String(character.lora_triggers || "").split(/\r?\n/)
                .map(function (line) { return line.trim(); }).filter(Boolean);
              const phrase = String(preset.phrase || preset.label || "").trim();
              if (phrase && !lines.includes(phrase)) {
                lines.push(phrase);
                character.lora_triggers = lines.join("\n");
              }
              markDirty();
              render();
            },
            onClose: function () { render(); },
            getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
            onColorChange: function (presetId, newColor) {
              state.concept_colors = state.concept_colors || {};
              if (newColor) state.concept_colors[presetId] = newColor;
              else delete state.concept_colors[presetId];
              markDirty();
            },
          });
        },
      }, "+ Pick trigger words");
      const randomBtn = diceButton("Random trigger word", function () {
        const presets = characterRowPresets().filter(function (preset) { return LORA_CATEGORIES.includes(preset.category); });
        const preset = randomChoice(presets);
        if (!preset) return;
        const lines = String(character.lora_triggers || "").split(/\r?\n/)
          .map(function (line) { return line.trim(); }).filter(Boolean);
        const phrase = String(preset.phrase || preset.label || "").trim();
        if (phrase && !lines.includes(phrase)) {
          lines.push(phrase);
          character.lora_triggers = lines.join("\n");
        }
        markDirty();
        render();
      }, "krea2-field-random krea2-icon-btn");
      const loraEachJobOn = !!(character.randomize_fields || {}).lora_triggers;
      const loraEachJobBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-lora-each-job krea2-shuffle" + (loraEachJobOn ? " is-active" : ""),
        title: loraEachJobOn
          ? "LoRA trigger words change for every queued job. Click to keep them fixed."
          : "Randomize this character's LoRA trigger words for every queued job.",
        "aria-label": "Randomize LoRA trigger words every queued job",
        "aria-pressed": loraEachJobOn ? "true" : "false",
        onClick: function () {
          if (!character.randomize_fields) character.randomize_fields = {};
          if (character.randomize_fields.lora_triggers) {
            delete character.randomize_fields.lora_triggers;
          } else {
            let lines = String(character.lora_triggers || "").split(/\r?\n/)
              .map(function (line) { return line.trim(); }).filter(Boolean);
            if (!lines.length) {
              const presets = characterRowPresets().filter(function (preset) {
                return LORA_CATEGORIES.includes(preset.category) && !preset.disabled;
              });
              for (let i = presets.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                const swap = presets[i];
                presets[i] = presets[j];
                presets[j] = swap;
              }
              for (const preset of presets.slice(0, 4)) {
                const phrase = String(preset.phrase || preset.label || "").trim();
                if (phrase && !lines.includes(phrase)) lines.push(phrase);
              }
            }
            character.randomize_fields.lora_triggers = lines;
          }
          markDirty();
          render();
        },
      }, icon("shuffle", { width: "13", height: "13" }));
      section.appendChild(el("div", { class: "krea2-direction-block-head" }, [
        el("strong", null, "LoRA"),
        el("span", { class: "krea2-direction-hint" }, "applies to THIS character — connect a model to the node's Model input"),
        el("span", { class: "krea2-structured-spacer" }),
        el("div", { class: "krea2-wizard-random-controls" }, [randomBtn, loraEachJobBtn]),
        picker,
      ]));
      const loraSelect = buildLoraSelect(character);
      const strengthControl = buildLoraStrengthControl(character);
      const strengthInput = strengthControl.input;
      const strengthValue = strengthControl.value;
      const loraRow = el("div", { class: "krea2-lora-controls" }, [
        loraSelect,
        el("span", { class: "krea2-direction-label" }, "strength"),
        strengthInput,
        strengthValue,
      ]);
      section.appendChild(loraRow);
      section.appendChild(el("div", { class: "krea2-settings-copy" },
        "The LoRA is applied to the model with this strength. Its trigger words compile only inside " +
        (character.name || "this character") + "\u2019s block, steering the LoRA's look toward this character. " +
        "LoRAs without trigger words often respond to their file name — picking one fills it in automatically."));
      section.appendChild(el("textarea", {
        class: "krea2-compact-textarea krea2-lora-triggers",
        rows: "2",
        "aria-label": "LoRA trigger words",
        placeholder: "young woman\nsemi-realistic art style",
        onInput: function (event) { character.lora_triggers = event.target.value; markDirty(); },
      }, character.lora_triggers || ""));
      return section;
    }


    /* v1.5.0: compact identity chips shown on collapsed cast members.
     * One pill per populated direction group plus the LoRA, so the card
     * stays scannable at reduced zoom without hovering. */
    function characterChips(character) {
      const chips = el("div", { class: "krea2-character-chips" });
      let hasContent = false;
      for (const group of DIRECTION_GROUPS) {
        const labels = (character.rows || []).filter(function (row) {
          return group.categories.includes(row.category);
        }).map(function (row) { return row.label || row.preset_id; });
        if (!labels.length) continue;
        chips.appendChild(el("span", {
          class: "krea2-chip krea2-character-chip",
          title: group.label + ": " + labels.join(", "),
        }, [
          icon(group.icon, { width: "10", height: "10" }),
          " " + group.label + " \u00b7 " + labels.length,
        ]));
        hasContent = true;
      }
      const loraName = String(character.lora_name || "").trim();
      if (loraName) {
        chips.appendChild(el("span", {
          class: "krea2-chip krea2-character-chip krea2-chip-lora",
          title: "LoRA: " + loraName,
        }, [
          icon("bolt", { width: "10", height: "10" }),
          " LoRA \u00b7 " + loraName,
        ]));
        hasContent = true;
      }
      if (!hasContent) {
        chips.appendChild(el("span", { class: "krea2-character-chips-empty" },
          "No direction or LoRA set yet — expand to craft one"));
      }
      return chips;
    }

    function saveCharacterPreset() { createWorkspacePreset("character"); }

    function renderCharacterEditor() {
      const section = el("section", { class: "krea2-structured-section krea2-character-section" });
      const add = el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
        const character = newCharacter();
        state.characters.push(character);
        state.selected_character_id = character.id;
        markDirty();
        renderStructuredEditors();
      } }, "+ Character");
      const exportBtn = el("button", { type: "button", class: "krea2-wizard-btn krea2-quiet-btn", onClick: exportStructuredPresets }, "Export");
      const importInput = el("input", { type: "file", accept: "application/json", hidden: true, onChange: importStructuredPresets });
      const importBtn = el("button", { type: "button", class: "krea2-wizard-btn krea2-quiet-btn", onClick: function () { importInput.click(); } }, "Import");
      /* v1.5.0: cast-level randomization stays in the cast header so the
       * whole cast can be re-rolled without opening every member. */
      const castRandomAll = diceButton("Randomize every character's full look once now", function () {
        (state.characters || []).forEach(function (character) {
          CHARACTER_APPEARANCE.forEach(function (field) {
            randomizeAppearanceField(character, field);
          });
        });
        markDirty();
        render();
      }, "krea2-cast-random-all");
      section.appendChild(el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "People & Characters"),
        el("span", { class: "krea2-structured-spacer" }), castRandomAll, add, exportBtn, importBtn, importInput,
      ]));
      if (!state.characters.length) {
        const starter = el("select", { class: "krea2-compact-select", "aria-label": "Add a preset character" });
        starter.appendChild(el("option", { value: "" }, "Start with a preset character..."));
        CHARACTER_PRESETS.forEach(function (preset, presetIndex) { starter.appendChild(el("option", { value: String(presetIndex) }, preset.label)); });
        starter.addEventListener("change", function () {
          const preset = CHARACTER_PRESETS[Number(starter.value)];
          if (!preset) return;
          const character = Object.assign(newCharacter(), cloneJson(preset.character), { name: preset.label });
          state.characters.push(character); state.selected_character_id = character.id;
          markDirty(); renderStructuredEditors();
        });
        section.appendChild(el("div", { class: "krea2-character-empty-row" }, [starter, el("span", { class: "krea2-structured-empty" }, "or create a blank character") ]));
        return section;
      }
      state.characters.forEach(function (character, index) {
        section.appendChild(renderCharacterCard(character, index));
      });
      return section;
    }

    function autoExpandTextarea(event) {
      const target = event.target;
      target.style.height = "auto";
      target.style.height = Math.max(target.scrollHeight || 0, 28) + "px";
    }

    /* Shared scene controls: dice (roll once) and shuffle (every queued job).
     * Used by both the compact B2 shell and the full scene editor. */
    function randomizeSceneOnce() {
      return resolveRandom({ kind: "setting", pool: SETTING_PRESETS.map(preset => ({ enabled: true, name: preset[0], description: preset[1] })) });
    }

    function toggleSceneShuffle(eachJobOn) {
      state.randomize_on_job = state.randomize_on_job || {};
      state.randomize_on_job.setting = !eachJobOn;
      state.setting_random_pool = SETTING_PRESETS.map(function (preset) {
        return { name: preset[0], description: preset[1] };
      });
      if (!eachJobOn && state.setting) state.setting.enabled = true;
      markDirty();
      render();
    }

    function renderSettingEditor() {
      const section = el("section", { class: "krea2-structured-section krea2-scene-editor" });
      const setting = state.setting;
      const settingEachJob = !!(state.randomize_on_job || {}).setting;
      const compact = state.scene_collapsed === true;
      section.classList.toggle("is-compact", compact);

      const sceneDice = diceButton("Randomize the scene", randomizeSceneOnce);
      const sceneShuffle = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (settingEachJob ? " is-active" : ""),
        title: settingEachJob
          ? "Shuffle on: a fresh scene is chosen for every queued job. Click to stop."
          : "Shuffle off: the scene stays fixed. Click to pick a fresh scene every queued job.",
        "aria-label": "Randomize the scene every queued job",
        onClick: function () {
          toggleSceneShuffle(settingEachJob);
        },
      }, "🔀");
      const expandBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-scene-expand",
        title: compact ? "Expand the scene editor" : "Collapse the scene editor to one line",
        "aria-label": compact ? "Expand scene editor" : "Collapse scene editor",
        "aria-expanded": compact ? "false" : "true",
        onClick: function () {
          state.scene_collapsed = !compact;
          markDirty();
          render();
        },
      }, compact ? "Expand" : "Collapse");

      /* v1.5.0: compact state — one-line semantic summary with the dice,
       * shuffle and expand controls. */
      if (compact) {
        const summary = el("div", { class: "krea2-scene-summary" }, [
          el("strong", { class: "krea2-scene-name" },
            setting.enabled && setting.name ? setting.name : "Scene"),
          el("span", {
            class: "krea2-scene-summary-text",
            title: setting.description || "",
          }, setting.enabled
            ? (setting.description || "No description yet — expand to describe the scene.")
            : "Not included yet — expand to describe the scene."),
        ]);
        const actions = el("div", { class: "krea2-scene-compact-actions" }, [
          el("label", { class: "krea2-inline-check", title: "Include this scene in the prompt" }, [
            el("input", { type: "checkbox", checked: !!setting.enabled, onChange: function (event) { setting.enabled = !!event.target.checked; markDirty(); render(); } }),
            el("span", null, "Include"),
          ]),
          sceneDice,
          sceneShuffle,
          expandBtn,
        ]);
        section.appendChild(el("div", { class: "krea2-scene-compact-row" }, [summary, actions]));
        return section;
      }

      const heading = el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "Scene"),
        el("span", { class: "krea2-structured-spacer" }),
        el("label", { class: "krea2-inline-check" }, [
          el("input", { type: "checkbox", checked: !!setting.enabled, onChange: function (event) { setting.enabled = !!event.target.checked; markDirty(); render(); } }),
          el("span", null, "Include"),
        ]),
        sceneShuffle,
        expandBtn,
      ]);
      section.appendChild(heading);
      const toolbar = el("div", { class: "krea2-structured-toolbar krea2-scene-toolbar" });
      const builtins = el("select", {
        class: "krea2-compact-select krea2-scene-select",
        "aria-label": "Selected scene",
        title: "Pick a scene — it applies immediately",
        onChange: function (event) {
          const preset = SETTING_PRESETS[Number(event.target.value)];
          if (!preset) return;
          setting.enabled = true; setting.name = preset[0]; setting.description = preset[1];
          markDirty(); render();
        },
      });
      builtins.appendChild(el("option", { value: "" }, "Selected scene: " + (setting.enabled && setting.name ? setting.name : "— choose one —")));
      SETTING_PRESETS.forEach(function (preset, index) { builtins.appendChild(el("option", { value: String(index) }, preset[0])); });
      const saved = el("select", {
        class: "krea2-compact-select krea2-scene-select",
        "aria-label": "Saved scene presets",
        onChange: function (event) {
          const preset = savedSettings[Number(event.target.value)];
          if (!preset) return;
          state.setting = cloneJson(preset.setting);
          markDirty(); render();
        },
      });
      saved.appendChild(el("option", { value: "" }, "Saved scenes..."));
      const savedSettings = savedPresets.filter(function (preset) { return preset.scope === "setting"; })
        .concat(state.setting_presets || []);
      savedSettings.forEach(function (preset, index) { saved.appendChild(el("option", { value: String(index) }, preset.label || "Scene")); });
      toolbar.append(
        builtins,
        sceneDice,
        saved,
        el("button", {
          type: "button",
          class: "krea2-wizard-btn",
          title: "Save the current scene as a reusable preset",
          onClick: function () {
            const label = String(setting.name || "Scene").trim();
            if (!label) { showToast("Choose or name the scene first", "warning"); return; }
            const existing = findExistingSavedPreset("setting", label);
            if (existing && !window.confirm(
              "A scene preset named \u201c" + label + "\u201d already exists. Overwrite it?",
            )) return;
            const payload = { scope: "setting", setting: cloneJson(setting) };
            if (existing) {
              Object.assign(existing, payload, { label: label });
            } else {
              savedPresets.push(Object.assign({ id: makeSavedPresetId("setting", ""), label: label }, payload));
            }
            persistSavedPresets(existing ? "Scene preset overwritten" : "Scene preset saved");
          },
        }, "Save scene"),
      );
      section.appendChild(toolbar);
      const description = el("textarea", {
        class: "krea2-compact-textarea krea2-scene-description",
        rows: "2",
        "aria-label": "Scene description",
        placeholder: "Describe the scene's background and atmosphere…",
        onInput: function (event) { setting.description = event.target.value; autoExpandTextarea(event); markDirty(); },
      }, setting.description || "");
      autoExpandTextarea({ target: description });
      section.appendChild(el("div", { class: "krea2-setting-grid" }, [
        el("label", { class: "krea2-field-wide" }, [el("span", null, "Description"), description]),
      ]));
      return section;
    }

    function exportStructuredPresets() {
      const payload = JSON.stringify({ characters: state.characters, character_presets: state.character_presets, setting: state.setting, setting_presets: state.setting_presets }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const anchor = el("a", { href: url, download: "krea2-characters-and-settings.json" });
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    }

    function importStructuredPresets(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const payload = JSON.parse(String(reader.result || "{}"));
          if (Array.isArray(payload.characters)) state.characters = payload.characters.filter(function (item) { return item && typeof item === "object"; });
          if (Array.isArray(payload.character_presets)) state.character_presets = payload.character_presets;
          if (payload.setting && typeof payload.setting === "object") state.setting = payload.setting;
          if (Array.isArray(payload.setting_presets)) state.setting_presets = payload.setting_presets;
          state.selected_character_id = state.characters.length ? state.characters[0].id : null;
          markDirty(); renderStructuredEditors(); showToast("Characters and settings imported", "info");
        } catch (error) { showToast("That preset file is not valid JSON", "error"); }
      };
      reader.readAsText(file);
      event.target.value = "";
    }

    function undo() {
      if (undoStack.length === 0) return;
      redoStack.push(JSON.stringify(state));
      state = coerceState(JSON.parse(undoStack.pop()));
      state.document_revision = ++revision;
      lastTransaction = null;
      dirty = true;
      persistedState = JSON.stringify(state);
      persist();
      updateHistoryControls();
      render();
    }

    function redo() {
      if (redoStack.length === 0) return;
      undoStack.push(JSON.stringify(state));
      state = coerceState(JSON.parse(redoStack.pop()));
      state.document_revision = ++revision;
      lastTransaction = null;
      dirty = true;
      persistedState = JSON.stringify(state);
      persist();
      updateHistoryControls();
      render();
    }

    function updateHistoryControls() {
      undoBtn.disabled = undoStack.length === 0;
      redoBtn.disabled = redoStack.length === 0;
    }

    function presetToRow(preset, state) {
      const initialStrength = Math.round(Math.max(-3, Math.min(3,
        (Number(preset.default_strength) || 0) / 20)) * 2) / 2;
      return {
        id: uniqueRowId(state),
        category: preset.category || "custom",
        preset_id: preset.id || "",
        label: preset.label || "",
        phrase: preset.phrase || "",
        control_mode: preset.control_mode || "scalar",
        intensity: parseInt(preset.default_strength, 10) || 0,
        strength: initialStrength,
        enabled: true,
        aliases: preset.aliases || [],
        verification: preset.verification || "general visual vocabulary",
        source: preset.source || "library",
        origin: "preset",
        origin_action: preset.id || "add_concept",
        positive_phrase: preset.positive_phrase,
        negative_phrase: preset.negative_phrase,
        neutral_phrase: preset.neutral_phrase,
        safe_weight_min: preset.safe_weight_min,
        safe_weight_max: preset.safe_weight_max,
        compatible_profiles: preset.compatible_profiles || [],
      };
    }

    function togglePreset(preset, shouldSelect) {
      if (shouldSelect) {
        if (!state.rows.some(function (row) { return row.preset_id === preset.id; })) {
          state.rows.push(presetToRow(preset, state));
        }
      } else {
        state.rows = state.rows.filter(function (row) {
          return row.preset_id !== preset.id;
        });
      }
      markDirty();
      saveConceptColors(state.concept_colors).catch(function () {});
      render();
    }

    function replaceGroupWithRandom(group) {
      state.rows = state.rows.filter(function (row) {
        return groupForCategory(row.category) !== group;
      });
      const allowed = new Set(RANDOM_GROUP_CATEGORIES[group]);
      const candidates = compatibleLibrary().filter(function (preset) {
        return allowed.has(preset.category) && !preset.disabled;
      });
      for (let i = candidates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = swap;
      }
      const minimum = Math.min(2, candidates.length);
      const maximum = Math.min(6, candidates.length);
      const count = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
      for (const preset of candidates.slice(0, count)) {
        const row = presetToRow(preset, state);
        row.strength = randomStrengthValue();
        state.rows.push(row);
      }
    }

    function presetMedia(preset) {
      const category = preset.category || "";
      const text = [
        preset.id || "", preset.label || "", preset.phrase || "",
        (preset.tags || []).join(" "),
      ].join(" ").toLowerCase();
      if (category === "camera_body" || category === "lens_family") return "photo";
      if (category !== "style") return "common";
      if (/(photograph|photographic|film still|fashion editorial|direct.flash|cinematic)/.test(text)) {
        return "photo";
      }
      return "art";
    }

    function presetMatchesCreativeMode(preset) {
      // Artwork mode was removed; every concept is offered.
      return true;
    }

    function compatibleLibrary() {
      return library.filter(presetMatchesCreativeMode);
    }

    function buildCreativeModeControl() {
      const wrap = el("div", {
        class: "krea2-wizard-creative-mode",
        title: "Photography concepts",
      });
      for (const option of [
        { value: "photo", label: "Photography" },
      ]) {
        wrap.appendChild(el("button", {
          type: "button",
          class: "krea2-wizard-creative-option"
            + ((state.creative_mode || "photo") === option.value ? " is-active" : ""),
          onClick: function () {
            if (state.creative_mode === option.value) return;
            state.creative_mode = option.value;
            for (const button of wrap.querySelectorAll(".krea2-wizard-creative-option")) {
              button.classList.toggle("is-active", button.textContent === option.label);
            }
            markDirty();
            render();
          },
        }, option.label));
      }
      return wrap;
    }

    function randomizeGroup(group) { return resolveRandom({ kind: "group", group }); }
    function randomizeAll() { return resolveRandom({ kind: "all" }); }

    function buildBasePrompt() {
      const ta = el("textarea", {
        class: "krea2-wizard-base",
        "aria-label": "Additional scene information",
        placeholder: "Describe the scene, subject, mood, lighting, camera, or style.",
        onInput: function (e) {
          state.base_prompt = e.target.value;
          sizeBasePrompt();
          markDirty();
        },
      }, state.base_prompt || "");
      return {
        root: el("div", { class: "krea2-wizard-prompt-field" }, [
          el("div", { class: "krea2-wizard-prompt-label-row" }, [
            el("label", { class: "krea2-wizard-prompt-title" }, "Additional info"),
            el("span", { class: "krea2-wizard-prompt-helper" }, "Scene, mood, camera or style notes"),
          ]),
          ta,
        ]),
        input: ta,
      };
    }

    function buildShowWorkToggle(state) {
      const btn = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        onClick: function () {
          state.show_work = !state.show_work;
          markDirty();
          render();
        },
      }, state.show_work ? "Hide Work" : "Show Work");
      return btn;
    }

    function buildSavedPresetControl() {
      const select = el("select", {
        class: "krea2-wizard-saved-select",
        "aria-label": "Saved prompt and group presets",
      });
      const load = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        onClick: loadSelectedSavedPreset,
      }, "Load");
      const remove = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-danger",
        onClick: deleteSelectedSavedPreset,
      }, "Delete");
      const save = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-wizard-save",
        title: "Save the entire node setup (prompt, characters, scene, concepts) as a preset",
        onClick: saveFullPreset,
      }, "Save Full Prompt");
      return {
        root: el("div", { class: "krea2-wizard-saved" }, [
          el("span", { class: "krea2-wizard-saved-label" }, "My presets"),
          select,
          load,
          remove,
          save,
        ]),
        select: select,
        load: load,
        remove: remove,
      };
    }

    function refreshSavedPresetSelect() {
      const current = savedPresetControl.select.value;
      savedPresetControl.select.innerHTML = "";
      savedPresetControl.select.appendChild(el("option", { value: "" }, "Choose a saved preset..."));
      const ordered = savedPresets.filter(function (preset) {
        return !preset.builtin && (preset.scope === "full" || preset.scope === "group");
      }).sort(function (a, b) {
        return (a.scope + a.label).localeCompare(b.scope + b.label);
      });
      for (const preset of ordered) {
        const prefix = preset.scope === "full"
          ? "Full"
          : (GROUP_LABELS[preset.group] || "Group");
        savedPresetControl.select.appendChild(
          el("option", { value: preset.id }, prefix + " · " + preset.label));
      }
      savedPresetControl.select.value = ordered.some(function (preset) {
        return preset.id === current;
      }) ? current : "";
      const disabled = ordered.length === 0;
      savedPresetControl.load.disabled = disabled;
      savedPresetControl.remove.disabled = disabled;
    }

    function cloneRowsWithFreshIds(rows) {
      const occupied = state.rows.slice();
      return (rows || []).map(function (row) {
        const copy = JSON.parse(JSON.stringify(row));
        copy.id = uniqueRowId({ rows: occupied });
        occupied.push(copy);
        return copy;
      });
    }

    function makeSavedPresetId(scope, group) {
      return "saved_" + scope + "_" + (group || "all") + "_"
        + Date.now().toString(36) + "_" + Math.random().toString(16).slice(2, 7);
    }

    async function askPresetName(message) {
      activeNameDialog?.close();
      const dialog = K.workspace.nameDialog({ title: message });
      activeNameDialog = dialog;
      const name = await dialog.result;
      if (activeNameDialog === dialog) activeNameDialog = null;
      return disposed ? "" : name;
    }

    function findExistingSavedPreset(scope, label) {
      const needle = String(label || "").trim().toLowerCase();
      if (!needle) return null;
      return savedPresets.find(function (preset) {
        return preset.scope === scope && String(preset.label || "").trim().toLowerCase() === needle;
      }) || null;
    }

    function persistSavedPresets(successMessage) {
      const operation = presetSaveQueue.then(async function () {
        await savedPresetsReady;
        const submitted = cloneJson(savedPresets);
        try {
          const presets = await saveSavedPresets(submitted, cloneJson(acknowledgedPresets));
          acknowledgedPresets = cloneJson(presets);
          savedPresets = mergePendingPresetEdits(submitted, savedPresets, presets);
          refreshSavedPresetSelect();
          if (!disposed) render();
          showToast(successMessage, "info");
          return true;
        } catch (error) {
          const message = error.status === 409
            ? (error.message || "Another node changed the same preset.") + " Your unsaved preset changes are kept in this node."
            : error.message || "Could not save preset.";
          showToast(message, "error");
          return false;
        }
      });
      presetSaveQueue = operation.then(() => undefined);
      return operation;
    }

    function mergePendingPresetEdits(base, local, latest) {
      const result = cloneJson(latest);
      const baseById = new Map(base.map(preset => [preset.id, preset]));
      const localById = new Map(local.map(preset => [preset.id, preset]));
      for (const id of new Set([...baseById.keys(), ...localById.keys()])) {
        if (JSON.stringify(baseById.get(id)) === JSON.stringify(localById.get(id))) continue;
        const index = result.findIndex(preset => preset.id === id);
        const edited = localById.get(id);
        if (edited) { if (index < 0) result.push(cloneJson(edited)); else result[index] = cloneJson(edited); }
        else if (index >= 0) result.splice(index, 1);
      }
      return result;
    }

    function saveFullPreset() { return createWorkspacePreset("full"); }

    function saveGroupPreset(group) {
      return createWorkspacePreset("group", group);
    }

    function loadSelectedSavedPreset() {
      const preset = savedPresets.find(item => item.id === savedPresetControl.select.value);
      if (preset) applyWorkspacePreset(preset);
    }

function loadGroupPreset(group, presetId) {
      const preset = savedPresets.find(item => item.id === presetId);
      if (preset) applyWorkspacePreset(preset);
    }

function buildGroupPresetPicker(group) {
      const select = el("select", {
        class: "krea2-wizard-group-preset",
        "aria-label": GROUP_LABELS[group] + " saved presets",
        onChange: function (event) {
          const presetId = event.target.value;
          select.value = "";
          if (presetId) loadGroupPreset(group, presetId);
        },
      });
      select.appendChild(el("option", { value: "" }, "Load preset..."));
      var groupPresets = savedPresets.filter(function (item) {
        return item.scope === "group" && item.group === group
          && Array.isArray(item.rows)
          && item.rows.some(function (row) { return groupForCategory(row.category) === group; });
      });
      for (const preset of groupPresets) {
        select.appendChild(el("option", { value: preset.id }, preset.label));
      }
      var lastLoaded = (state.loaded_group_presets || {})[group];
      if (lastLoaded && groupPresets.some(function (p) { return p.id === lastLoaded; })) {
        select.value = lastLoaded;
      }
      return { select: select };
    }

    function deleteSelectedSavedPreset() {
      const id = savedPresetControl.select.value;
      const preset = savedPresets.find(function (item) { return item.id === id; });
      if (!preset || !window.confirm("Delete saved preset “" + preset.label + "”?")) return;
      savedPresets = savedPresets.filter(function (item) { return item.id !== id; });
      persistSavedPresets("Saved preset deleted");
    }

    function buildMasterPresetControl() {
      const select = el("select", {
        class: "krea2-wizard-master-select",
        "aria-label": "Shot presets",
      });
      select.appendChild(el("option", { value: "" }, "Shot presets..."));
      return select;
    }

    function refreshMasterPresetSelect() {
      const current = masterPresetSelect.value;
      masterPresetSelect.innerHTML = "";
      masterPresetSelect.appendChild(el("option", { value: "" }, "Shot presets..."));
      masterPresets.slice().sort(function (a, b) {
        return String(a.label || "").toLowerCase().localeCompare(String(b.label || "").toLowerCase());
      }).forEach(function (preset) {
        masterPresetSelect.appendChild(el("option", { value: preset.id }, preset.label));
      });
      masterPresetSelect.value = masterPresets.some(function (p) {
        return p.id === current;
      }) ? current : "";
      masterPresetSelect.onchange = function () {
        loadMasterPreset(masterPresetSelect.value);
      };
    }

    function loadMasterPreset(presetId) {
      if (!presetId) return;
      const preset = masterPresets.find(function (p) { return p.id === presetId; });
      if (!preset) return;
      // A style/shot preset replaces the camera, lighting and environment
      // sections; warn first when those sections already have content.
      const replaced = state.rows.some(function (row) {
        return ["framing", "angle", "lens", "aperture", "lighting_setup", "lighting_direction",
          "lighting_effect", "atmosphere", "environment_movement"].includes(row.category);
      });
      if (replaced && typeof window.confirm === "function"
          && !window.confirm("This shot preset replaces your camera, lighting and environment setups. Continue?")) {
        return;
      }
      const newRows = [];
      for (const mpRow of (preset.rows || [])) {
        const libPreset = library.find(function (p) { return p.id === mpRow.preset_id; });
        if (!libPreset) continue;
        const row = presetToRow(libPreset, state);
        row.intensity = mpRow.intensity || 0;
        row.strength = Math.round(Math.max(-3, Math.min(3,
          (Number(mpRow.intensity) || 0) / 20)) * 4) / 4;
        newRows.push(row);
      }
      if (!newRows.length) {
        showToast("No matching presets found for " + preset.label, "warning");
        return;
      }
      state.rows = newRows;
      /* The shot-distance mirror and the lighting-panel light mirrors are
       * regenerated so the applied preset does not strand them. */
      syncShotDistanceRow();
      syncLightRows();
      // A shot preset is a full preset: it also names and describes the scene.
      if (preset.setting && typeof preset.setting === "object") {
        state.setting = {
          enabled: true,
          name: String(preset.setting.name || "Scene"),
          description: String(preset.setting.description || ""),
        };
      }
      state.master_preset_id = presetId;
      state.master_preset_label = preset.label;
      markDirty();
      render();
      showToast("Shot preset \u201c" + preset.label + "\u201d loaded", "info");
    }

    function buildLivePreview() {
      var codeText = el("div", { class: "krea2-wizard-preview" }, "");
      var prettyBody = el("div", { class: "krea2-preview-pretty" });
      var codeLabel = el("div", { class: "krea2-preview-cat-label" }, "Prompt code");
      var copyBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
        copy(codeText.textContent);
      } }, "Copy shown prompt");
      var historySelect = el("select", {
        class: "krea2-compact-select krea2-prompt-history",
        "aria-label": "Generated prompt history",
        onChange: function () {
          const run = executionRecords[Number(historySelect.value)];
          if (!run) return;
          lastRun = run;
          render();
        },
      });
      historySelect.appendChild(el("option", { value: "" }, "No generated prompts yet"));
      var copyGenerated = el("button", { type: "button", class: "krea2-wizard-btn", onClick: function () {
        const prompt = executionHistory[Number(historySelect.value)] || executionHistory[executionHistory.length - 1];
        if (!prompt) { showToast("Run the workflow first", "warning"); return; }
        copy(prompt);
      } }, "Copy generated prompt");
      var root = el("div", { class: "krea2-wizard-preview-host" }, [
        prettyBody,
        codeLabel,
        codeText,
        el("div", { class: "krea2-wizard-preview-buttons" }, [historySelect, copyGenerated, copyBtn]),
      ]);
      return { root: root, previewBody: prettyBody, prettyBody: prettyBody, codeText: codeText, codeLabel: codeLabel, historySelect: historySelect };
    }

    function renderLivePreview(requestAuthoritativePreview) {
      try {
        var signature = JSON.stringify(state);
        var compiled = latestPreview && latestPreview.signature === signature
          ? latestPreview.result
          : compilePreview(state);
        renderPrettyPreview(compiled);
        renderCodePreview(compiled);
        showWork.innerHTML = "";
        if (state.show_work) {
          showWork.appendChild(renderShowWork(state, compiled));
        }
        if (requestAuthoritativePreview !== false) {
          schedulePreview(signature);
        }
      } catch (e) {
        console.warn("[Krea2PromptWizard] renderLivePreview error", e);
      }
    }

    function renderPrettyPreview(compiled) {
      var host = livePreview.prettyBody;
      host.innerHTML = "";
      if (!compiled || !compiled.category_prompts) return;
      var structuredLabels = (state.characters || []).filter(function (character) {
        return character && character.enabled !== false;
      }).map(function (character) { return character.name || "Character"; });
      if (state.setting && state.setting.enabled) structuredLabels.push(state.setting.name || "Setting");
      if (structuredLabels.length) {
        host.appendChild(el("div", { class: "krea2-preview-block" }, [
          el("div", { class: "krea2-preview-group-title" }, "People & Setting"),
          el("div", { class: "krea2-preview-cat-item" }, structuredLabels.join(" · ")),
        ]));
      }
      var catRaw = compiled.category_prompts;
      var fragmentByRow = new Map((compiled.fragments || []).map(function (f) { return [f.row_id, f]; }));
      var anyContent = false;
      for (var gi = 0; gi < GROUPS.length; gi++) {
        var group = GROUPS[gi];
        var categories = GROUP_CATEGORIES[group];
        var groupParts = [];
        for (var ci = 0; ci < categories.length; ci++) {
          var cat = categories[ci];
          var raw = catRaw[cat];
          var items = [];
          if (Array.isArray(raw)) {
            items = raw.filter(Boolean);
          } else if (typeof raw === "string" && raw.trim()) {
            items = [raw.trim()];
          }
          if (!items.length) continue;
          var catItems = [];
          for (var ri = 0; ri < state.rows.length; ri++) {
            var row = state.rows[ri];
            if (row.category !== cat || row.enabled === false) continue;
            var fragment = fragmentByRow.get(row.id);
            if (fragment && fragment.fragment) {
              var text = fragment.fragment;
              var btn = el("button", {
                type: "button",
                class: "krea2-preview-concept",
                dataset: { rowId: row.id },
                onMouseEnter: function (id) { return function () { setRowHover(id, true); }; }(row.id),
                onMouseLeave: function (id) { return function () { setRowHover(id, false); }; }(row.id),
                onClick: function (id) { return function () { focusRow(id); }; }(row.id),
              }, text);
              catItems.push(el("div", { class: "krea2-preview-cat-item" }, [btn]));
            }
          }
          groupParts.push({ label: CATEGORY_LABELS[cat] || cat, items: catItems });
        }
        if (!groupParts.length) continue;
        anyContent = true;
        var block = el("div", { class: "krea2-preview-block" });
        block.appendChild(el("div", { class: "krea2-preview-group-title" }, GROUP_LABELS[group]));
        for (var pi = 0; pi < groupParts.length; pi++) {
          var part = groupParts[pi];
          block.appendChild(el("div", { class: "krea2-preview-cat-label" }, part.label));
          for (var ii = 0; ii < part.items.length; ii++) {
            block.appendChild(part.items[ii]);
          }
        }
        host.appendChild(block);
      }
    }

    function renderCodePreview(compiled) {
      const host = livePreview.codeText;
      host.innerHTML = "";
      const spans = compiled.trace && compiled.trace.emitted_spans;
      if (Array.isArray(spans) && spans.length) {
        for (const span of spans) {
          if (span.origin === "generated_separator") host.appendChild(document.createTextNode(span.text));
          else host.appendChild(el("button", { type: "button", class: "krea2-preview-concept", title: "Edit " + span.owner_path + " · " + span.origin,
            dataset: { ownerPath: span.owner_path }, onClick: () => focusOwner(span.owner_path),
          }, span.text));
        }
        return;
      }
      const parts = [];
      /* Reconstruct the final prompt from its fragments so every concept
       * span is hoverable and clickable, linking back to the row that
       * produced it (global scene rows and per-character rows alike). */
      let rest = compiled.final_prompt || "";
      if (rest.trim() && (state.base_prompt || "").trim()
          && rest.indexOf((state.base_prompt || "").trim()) === 0) {
        const base = (state.base_prompt || "").trim();
        parts.push({ text: base, rowId: "" });
        rest = rest.slice(base.length).replace(/^,\s*/, "");
      }
      for (const fragment of (compiled.fragments || [])) {
        if (!fragment || !fragment.fragment) continue;
        const index = rest.indexOf(fragment.fragment);
        if (index < 0) continue;
        if (index > 0) {
          parts.push({ text: rest.slice(0, index), rowId: "" });
        }
        parts.push({ text: fragment.fragment, rowId: fragment.row_id });
        rest = rest.slice(index + fragment.fragment.length);
        rest = rest.replace(/^,\s*/, "");
      }
      if (rest.trim()) parts.push({ text: rest, rowId: "" });
      parts.forEach(function (part, index) {
        if (index) host.appendChild(document.createTextNode(", "));
        if (!part.rowId) {
          host.appendChild(document.createTextNode(part.text));
          return;
        }
        host.appendChild(el("button", {
          type: "button",
          class: "krea2-preview-concept",
          dataset: { rowId: part.rowId },
          onMouseEnter: function () { setRowHover(part.rowId, true); },
          onMouseLeave: function () { setRowHover(part.rowId, false); },
          onClick: function () { focusRow(part.rowId); },
        }, part.text));
      });
    }

    function setRowHover(rowId, active) {
      for (const element of root.querySelectorAll('[data-row-id="' + rowId + '"]')) {
        element.classList.toggle("is-linked-hover", active);
      }
    }

    function focusRow(rowId) {
      const globalRow = state.rows.find(row => row.id === rowId);
      if (globalRow && ownedDerivedRow(globalRow)) {
        focusOwner(globalRow.preset_id === "custom.shot_distance" ? "scene_sections.shot_distance" : "scene_sections.lights[" + (state.scene_sections.lights || []).findIndex(light => "custom.light_" + light.id === globalRow.preset_id) + "]");
        return;
      }
      const character = state.characters.find(character => character.rows.some(row => row.id === rowId));
      if (character) state.selected_character_id = character.id;
      const performanceRow = character?.rows.find(row => row.id === rowId && PERFORMANCE_CATEGORIES.includes(row.category));
      if (performanceRow) state.collapsed.workspace_performance = false;
      else state.collapsed.workspace_advanced = false;
      render();
      const schedule = window.requestAnimationFrame || window.setTimeout;
      schedule(function () {
        const section = root.querySelector('[data-section-id="' + (performanceRow ? "performance" : "advanced") + '"]');
        const card = (section || root).querySelector('.krea2-row[data-row-id="' + rowId + '"]');
        if (!card) return;
        if (card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("is-focus-flash");
        window.setTimeout(function () { card.classList.remove("is-focus-flash"); }, 1200);
      }, 0);
    }

    function focusOwner(path) {
      if (/^scene_sections\.(lights|shot_distance)/.test(path || "")) {
        const lighting = path.includes("lights");
        state.collapsed["workspace_" + (lighting ? "lighting" : "camera")] = false;
        render();
        const index = /lights\[(\d+)\]/.exec(path)?.[1];
        const target = lighting && index !== undefined ? root.querySelector('.krea2-v2-lt-card[data-light-index="' + index + '"]') : root.querySelector('[data-section-id="camera"]');
        target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        return;
      }
      const characterMatch = /^characters\[(\d+)\]/.exec(path || "");
      if (characterMatch) {
        const character = state.characters[Number(characterMatch[1])];
        if (character) {
          state.selected_character_id = character.id;
          character.expanded = true;
          const rowMatch = /\.rows\[(\d+)\]/.exec(path);
          if (rowMatch && character.rows[Number(rowMatch[1])]) { focusRow(character.rows[Number(rowMatch[1])].id); return; }
        }
        state.collapsed.workspace_character = false; state.collapsed.workspace_advanced = false;
      } else if (/^rows\[/.test(path || "")) {
        const row = state.rows[Number(/^rows\[(\d+)\]/.exec(path)[1])];
        if (row) { focusRow(row.id); return; }
      } else if (/^setting|^base_prompt/.test(path || "")) state.collapsed.workspace_environment = false;
      else state.collapsed.workspace_advanced = false;
      render();
      const section = characterMatch ? "character" : /^setting|^base_prompt/.test(path || "") ? "environment" : "advanced";
      root.querySelector('[data-section-id="' + section + '"]')?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }

    function editRow(row) {
      const group = groupForCategory(row.category);
      showSearchableSelector({
        presets: compatibleLibrary(),
        title: "Replace " + (row.label || "concept"),
        categories: GROUP_CATEGORIES[group],
        multiSelect: false,
        selectedIds: [row.preset_id],
        initialPresetId: row.preset_id,
        onClose: function () { render(); },
        getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
        onColorChange: function (presetId, newColor) {
          state.concept_colors = state.concept_colors || {};
          if (newColor) state.concept_colors[presetId] = newColor;
          else delete state.concept_colors[presetId];
          markDirty();
        },
        onPick: function (preset) {
          const replacement = presetToRow(preset, state);
          replacement.id = row.id;
          replacement.strength = row.strength;
          replacement.enabled = row.enabled;
          const index = state.rows.findIndex(function (item) { return item.id === row.id; });
          if (index >= 0) state.rows[index] = replacement;
          markDirty();
          render();
          focusRow(replacement.id);
        },
      });
    }

    const schedulePreview = debounce(requestPreview, 140);

    function requestPreview(signature) {
      if (disposed) return;
      if (latestPreview && latestPreview.signature === signature) return;
      const requestId = ++previewSequence;
      const previewState = JSON.parse(signature);
      fetchCompiledPreview(previewState, { expert: expertMode() }).then(function (compiled) {
        if (disposed || requestId !== previewSequence) return;
        if (signature !== JSON.stringify(state)) return;
        const migrated = compiled.resolved_state && state.state_version < 2;
        if (migrated) {
          state = coerceState(compiled.resolved_state);
          persistedState = JSON.stringify(state);
          persist();
        }
        latestPreview = { signature: JSON.stringify(state), result: compiled };
        if (migrated) render(); else renderLivePreview(false);
      }).catch(function () {
        // Keep the instant local preview available if the optional API route is unavailable.
      });
    }

    function renderGroupSections(host, groups) {
      for (const group of groups) {
        const rows = state.rows.filter(function (row) {
          return groupForCategory(row.category) === group && !ownedDerivedRow(row);
        });
        const collapsed = !!(state.collapsed || {})[group];
        const section = el("section", {
          class: "krea2-wizard-category" + (collapsed ? " is-collapsed" : ""),
        });
        const header = el("div", { class: "krea2-wizard-category-header" }, [
          el("strong", { class: "krea2-wizard-category-title" }, GROUP_LABELS[group]),
          el("span", { class: "krea2-wizard-category-summary", title: rows.map(function (row) {
            return row.label || row.preset_id;
          }).join(", ") }, rows.map(function (row) {
            return row.label || row.preset_id;
          }).join(" · ")),
          el("span", { class: "krea2-wizard-category-count" },
            rows.length + (rows.length === 1 ? " concept" : " concepts")),
        ]);
        const addBtn = el("button", {
          type: "button",
          class: "krea2-wizard-category-add",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            showSearchableSelector({
              presets: compatibleLibrary(),
              title: "Add " + GROUP_LABELS[group] + " concepts",
              categories: GROUP_CATEGORIES[group],
              multiSelect: true,
              selectedIds: rows.map(function (row) { return row.preset_id; }),
              onToggle: togglePreset,
              onClose: function () { render(); },
              getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
              onColorChange: function (presetId, newColor) {
                state.concept_colors = state.concept_colors || {};
                if (newColor) state.concept_colors[presetId] = newColor;
                else delete state.concept_colors[presetId];
                markDirty();
              },
            });
          },
        }, "+ Add");
        const randomBtn = diceButton(
          "Replace this group with a random combination",
          function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            randomizeGroup(group);
          },
          "krea2-wizard-category-random krea2-icon-btn",
        );
        const saveBtn = el("button", {
          type: "button",
          class: "krea2-wizard-category-save",
          title: "Save these concepts and their values as a reusable group preset",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            saveGroupPreset(group);
          },
        }, "Save preset");
        const groupPreset = buildGroupPresetPicker(group);
        const eachJobOn = !!(state.randomize_on_job || {})[group];
        const randomEachJob = el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (eachJobOn ? " is-active" : ""),
          title: eachJobOn
            ? "Shuffle on: this group is randomized for every queued job. Click to stop."
            : "Shuffle off: this group is randomized once when you press the dice. Click to randomize it every queued job.",
          "aria-label": "Randomize this group every queued job",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            state.randomize_on_job = state.randomize_on_job || {};
            state.randomize_on_job[group] = !state.randomize_on_job[group];
            markDirty();
            render();
          },
        }, icon("shuffle", { width: "13", height: "13" }));
        const randomControls = el("div", { class: "krea2-wizard-random-controls" }, [
          randomBtn,
          randomEachJob,
        ]);
        const actions = el("div", { class: "krea2-wizard-category-actions" }, [
          addBtn,
          groupPreset.select,
          saveBtn,
          randomControls,
        ]);
        const content = el("div", { class: "krea2-wizard-category-content" });
        if (rows.length === 0) {
          content.appendChild(el("div", { class: "krea2-wizard-empty" },
            "No concepts yet. Add your own or use the dice."));
        } else {
          for (const row of rows) {
            content.appendChild(renderRow(row, {
              presets: library,
              conceptColors: state.concept_colors,
              markDirty: markDirty,
              persistConceptColors: function () { saveConceptColors(state.concept_colors || {}).catch(function () {}); },
              refresh: render,
              removeRow: function (id) {
                state.rows = state.rows.filter(function (r) { return r.id !== id; });
                markDirty();
                render();
              },
              onReorder: function (parent) {
                const ids = Array.prototype.map.call(parent.querySelectorAll(".krea2-row"), function (el) { return el.dataset.rowId; });
                const reordered = ids.map(function (id) {
                  return state.rows.find(function (row) { return row.id === id; });
                }).filter(Boolean);
                const groupIds = new Set(rows.map(function (row) { return row.id; }));
                state.rows = state.rows.map(function (row) {
                  return groupIds.has(row.id) ? reordered.shift() : row;
                });
                markDirty();
              },
              editRow: editRow,
              onHover: setRowHover,
            }));
          }
        }
        header.addEventListener("click", function () {
          state.collapsed = state.collapsed || {};
          state.collapsed[group] = !state.collapsed[group];
          content.style.display = state.collapsed[group] ? "none" : "";
          actions.style.display = state.collapsed[group] ? "none" : "";
          section.classList.toggle("is-collapsed", state.collapsed[group]);
          markDirty();
        });
        if (collapsed) {
          content.style.display = "none";
          actions.style.display = "none";
        }
        section.appendChild(header);
        section.appendChild(actions);
        section.appendChild(content);
        host.appendChild(section);
      }
    }

    /* Groups owned by the Scene tab: subject/expression, camera, lighting,
     * environment, style. The global Subject & Expression pool covers the
     * subject's body language and expression concepts that are not owned by
     * a specific cast member (per-character direction stays in the Cast tab). */
    const SCENE_GROUPS = ["subject_expression", "camera_film", "lighting", "environment", "style_finish"];

    /* ------------------------------------------------------------------
     * v2 redesigned tabbed editor (CAST / SCENE).
     * ------------------------------------------------------------------ */

    /* The appearance controls on a cast card. Every field keeps its own
     * dice (randomize once) and shuffle (every job). Fields with a colour
     * (hair / eyes / skin) carry a colour pop-up button on the same row.
     * Dropdown options are alphabetical, except Age which runs youngest to
     * oldest. */
    function formatLoraValue(value) {
      const number = Math.round(Number(value) * 100) / 100;
      if (number === 0) return "0";
      return (number > 0 ? "+" : "") + String(number);
    }

    /* ------------------------------------------------------------------
     * v1.3.1-style appearance wall: every field on its own row with its
     * own dice (randomize once) and shuffle (every queued job).
     * ------------------------------------------------------------------ */
    const V2_APPEARANCE_FIELDS = (function () {
      const byKey = {};
      CHARACTER_APPEARANCE.forEach(function (field) { byKey[field.key] = field; });
      const eyesShapes = byKey.eyes.options.filter(function (option) {
        return !/(blue|green|hazel|brown|black|grey|amber|violet|heterochromatic)/.test(option);
      });
      const paletteNames = PALETTE_COLORS.map(function (entry) { return entry[0]; });
      const buildOptions = dedupeOptions(
        byKey.body_type.options.concat(byKey.fitness.options, byKey.proportions.options),
      );
      return [
        { key: "age", label: "Age", options: byKey.age.options, natural: true },
        { key: "ethnicity", label: "Ethnicity", options: byKey.ethnicity.options, colorKey: "skin_color", colorPalette: "character" },
        { key: "hair_style", label: "Hair", options: byKey.hair_style.options, colorKey: "hair_color", colorPalette: "hair" },
        { key: "hair_length", label: "Hair length", options: byKey.hair_length.options },
        { key: "makeup", label: "Makeup", options: byKey.makeup.options },
        { key: "eyes", label: "Eye Shape", options: eyesShapes, colorKey: "eye_color", colorPalette: "character" },
        { key: "nose", label: "Nose", options: byKey.nose.options },
        { key: "mouth", label: "Mouth", options: byKey.mouth.options },
        { key: "chin", label: "Chin", options: byKey.chin.options },
        { key: "face_shape", label: "Face shape", options: byKey.face_shape.options },
        { key: "body_type", label: "Build", options: buildOptions },
        { key: "clothing_top", label: "Top", options: byKey.clothing_top.options },
        { key: "clothing_bottom", label: "Bottom", options: byKey.clothing_bottom.options },
        { key: "ensemble", label: "Ensemble (full costume)", options: byKey.ensemble.options, wide: true },
      ];
    })();

    function dedupeOptions(options) {
      const seen = new Set();
      const out = [];
      for (const option of options) {
        const key = String(option).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(option);
      }
      return out;
    }

    const IDENTITY_GENDER_CYCLE = ["", "female", "male", "unspecified"];
    const IDENTITY_AGE_CYCLE = ["", "child", "teenager", "young adult", "adult", "middle aged", "elderly"];
    const IDENTITY_ETHNICITY_CYCLE = (function () {
      const field = CHARACTER_APPEARANCE.find(function (f) { return f.key === "ethnicity"; });
      return field ? field.options.slice() : [];
    })();

    function capitalizeFirst(value) {
      const text = String(value || "");
      return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
    }

    /* Gender pills: three small buttons directly under the character name.
     * Single-select; only one choice at a time. */
    function renderGenderPills(character) {
      const row = el("div", { class: "krea2-v2-gender-pills", role: "radiogroup", "aria-label": "Gender" });
      for (const option of ["female", "male", "unspecified"]) {
        const active = String(character.sex || "") === option;
        row.appendChild(el("button", {
          type: "button",
          role: "radio",
          "aria-checked": active ? "true" : "false",
          class: "krea2-v2-gender-pill" + (active ? " is-active" : ""),
          title: "Set gender to " + option,
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            character.sex = character.sex === option ? "" : option;
            markDirty();
            render();
          },
        }, capitalizeFirst(option)));
      }
      return row;
    }

    /* Per-field dice (randomize once) + shuffle (randomize every job). */
    function fieldRandomControls(character, field) {
      const randomBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-random",
        title: "Roll " + field.label + " once now",
        "aria-label": "Randomize " + field.label + " once",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          randomizeAppearanceField(character, field);
          markDirty();
          render();
        },
      }, icon("dice", { width: "12", height: "12" }));
      const eachJobOn = !!(character.randomize_fields || {})[field.key];
      const eachJobBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-each-job krea2-shuffle" + (eachJobOn ? " is-active" : ""),
        title: eachJobOn
          ? field.label + " randomizes for every queued job. Click to keep it fixed."
          : "Randomize " + field.label + " for every queued job.",
        "aria-label": "Randomize " + field.label + " every queued job",
        "aria-pressed": eachJobOn ? "true" : "false",
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          setAppearanceFieldEachJob(character, field, !eachJobOn);
          markDirty();
          render();
        },
      }, icon("shuffle", { width: "12", height: "12" }));
      return el("div", { class: "krea2-v2-field-random-controls" }, [randomBtn, eachJobBtn]);
    }

    /* Colour pop-up button: shows the chosen colour, click to open a small
     * palette pop-up with a hex input inside. Used for hair / eye / skin
     * colour and for light colour. */
    function colourHexFor(name, palette) {
      const entry = palette.find(function (item) { return item[0] === name; });
      return entry ? entry[1] : "";
    }

    /* Photoshop / Adobe Express style colour picker pop-up: a hue bar on
     * top, a saturation/value square below it, and a Hex field with a copy
     * button at the bottom. The stored value stays a model-friendly colour
     * word (nearest palette entry); the Hex field always shows the hex. */
    function openColorPopup(anchor, palette, current, label, onPick) {
      const existing = document.querySelector(".krea2-color-popup");
      if (existing) { K.helpers.cleanupDOM(existing); existing.remove(); }
      const popup = el("div", { class: "krea2-color-popup krea2-color-popup-full" });
      popup.appendChild(el("div", { class: "krea2-color-popup-label" }, label));

      const HUE_W = 216;
      const HUE_H = 14;
      const SV_W = 216;
      const SV_H = 128;
      const svgNs = "http://www.w3.org/2000/svg";
      const mk = typeof document.createElementNS === "function"
        ? function (tag) { return document.createElementNS(svgNs, tag); }
        : function (tag) { return document.createElement(tag); };

      let hsv = hexToHsv(colourHexFor(String(current || ""), palette) || "#ffffff");
      const hexInput = el("input", {
        type: "text",
        class: "krea2-compact-input krea2-v2-palette-hex",
        value: hsvToHex(hsv),
        placeholder: "#rrggbb",
        "aria-label": label + " (hex code)",
        onKeyDown: function (event) {
          if (event.key === "Enter") {
            const name = paletteNearestName(hexInput.value, palette);
            if (name) { onPick(name); popup.remove(); }
          }
          if (typeof event.stopPropagation === "function") if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        },
      });

      const commit = function () {
        const name = paletteNearestName(hsvToHex(hsv), palette);
        if (name) onPick(name);
      };

      /* Hue bar */
      const hueSvg = mk("svg");
      hueSvg.setAttribute("viewBox", "0 0 " + HUE_W + " " + HUE_H);
      hueSvg.setAttribute("width", String(HUE_W));
      hueSvg.setAttribute("height", String(HUE_H));
      hueSvg.setAttribute("class", "krea2-color-hue");
      const defs = mk("defs");
      const gradient = mk("linearGradient");
      gradient.setAttribute("id", "krea2-hue-grad");
      gradient.setAttribute("x1", "0");
      gradient.setAttribute("y1", "0");
      gradient.setAttribute("x2", "1");
      gradient.setAttribute("y2", "0");
      const hueStops = [
        ["0%", "#ff0000"], ["17%", "#ffff00"], ["33%", "#00ff00"], ["50%", "#00ffff"],
        ["67%", "#0000ff"], ["83%", "#ff00ff"], ["100%", "#ff0000"],
      ];
      for (const stop of hueStops) {
        const node = mk("stop");
        node.setAttribute("offset", stop[0]);
        node.setAttribute("stop-color", stop[1]);
        gradient.appendChild(node);
      }
      defs.appendChild(gradient);
      hueSvg.appendChild(defs);
      const hueRect = mk("rect");
      hueRect.setAttribute("x", "0"); hueRect.setAttribute("y", "0");
      hueRect.setAttribute("width", String(HUE_W)); hueRect.setAttribute("height", String(HUE_H));
      hueRect.setAttribute("rx", "7");
      hueRect.setAttribute("fill", "url(#krea2-hue-grad)");
      hueSvg.appendChild(hueRect);
      const hueHandle = mk("circle");
      hueHandle.setAttribute("r", "7");
      hueHandle.setAttribute("class", "krea2-color-handle");
      const positionHueHandle = function () {
        hueHandle.setAttribute("cx", String((hsv.h / 360) * HUE_W));
        hueHandle.setAttribute("cy", String(HUE_H / 2));
      };
      hueSvg.appendChild(hueHandle);
      positionHueHandle();

      /* Saturation / value square */
      const svSvg = mk("svg");
      svSvg.setAttribute("viewBox", "0 0 " + SV_W + " " + SV_H);
      svSvg.setAttribute("width", String(SV_W));
      svSvg.setAttribute("height", String(SV_H));
      svSvg.setAttribute("class", "krea2-color-sv");
      const svBase = mk("rect");
      svBase.setAttribute("width", String(SV_W)); svBase.setAttribute("height", String(SV_H));
      svBase.setAttribute("rx", "8");
      const svOverlayWhite = mk("rect");
      svOverlayWhite.setAttribute("width", String(SV_W)); svOverlayWhite.setAttribute("height", String(SV_H));
      svOverlayWhite.setAttribute("rx", "8");
      const svOverlayBlack = mk("rect");
      svOverlayBlack.setAttribute("width", String(SV_W)); svOverlayBlack.setAttribute("height", String(SV_H));
      svOverlayBlack.setAttribute("rx", "8");
      const updateSv = function () {
        const base = hsvToHex({ h: hsv.h, s: 1, v: 1 });
        svBase.setAttribute("fill", base);
        svOverlayWhite.setAttribute("fill", "url(#krea2-sv-white)");
        svOverlayBlack.setAttribute("fill", "url(#krea2-sv-black)");
      };
      const svDefs = mk("defs");
      const whiteGrad = mk("linearGradient");
      whiteGrad.setAttribute("id", "krea2-sv-white");
      whiteGrad.setAttribute("x1", "0"); whiteGrad.setAttribute("y1", "0");
      whiteGrad.setAttribute("x2", "1"); whiteGrad.setAttribute("y2", "0");
      whiteGrad.appendChild(whiteStop("#ffffff", "1"));
      whiteGrad.appendChild(whiteStop("#ffffff", "0"));
      function whiteStop(color, opacity) {
        const node = mk("stop");
        node.setAttribute("offset", opacity === "1" ? "0%" : "100%");
        node.setAttribute("stop-color", color);
        node.setAttribute("stop-opacity", opacity);
        return node;
      }
      const blackGrad = mk("linearGradient");
      blackGrad.setAttribute("id", "krea2-sv-black");
      blackGrad.setAttribute("x1", "0"); blackGrad.setAttribute("y1", "0");
      blackGrad.setAttribute("x2", "0"); blackGrad.setAttribute("y2", "1");
      const blackTop = mk("stop");
      blackTop.setAttribute("offset", "0%");
      blackTop.setAttribute("stop-color", "#000000");
      blackTop.setAttribute("stop-opacity", "0");
      const blackBottom = mk("stop");
      blackBottom.setAttribute("offset", "100%");
      blackBottom.setAttribute("stop-color", "#000000");
      blackBottom.setAttribute("stop-opacity", "1");
      blackGrad.appendChild(blackTop);
      blackGrad.appendChild(blackBottom);
      svDefs.appendChild(whiteGrad);
      svDefs.appendChild(blackGrad);
      svSvg.appendChild(svDefs);
      svSvg.appendChild(svBase);
      svSvg.appendChild(svOverlayWhite);
      svSvg.appendChild(svOverlayBlack);
      const svHandle = mk("circle");
      svHandle.setAttribute("r", "8");
      svHandle.setAttribute("class", "krea2-color-handle");
      svSvg.appendChild(svHandle);
      const positionSvHandle = function () {
        svHandle.setAttribute("cx", String(hsv.s * SV_W));
        svHandle.setAttribute("cy", String((1 - hsv.v) * SV_H));
      };
      updateSv();
      positionSvHandle();

      const redraw = function () {
        positionHueHandle();
        positionSvHandle();
        updateSv();
        hexInput.value = hsvToHex(hsv);
      };

      const dragHue = function (event) {
        const bounds = hueSvg.getBoundingClientRect();
        if (!bounds || !bounds.width) return;
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        hsv.h = x * 360;
        hsv.s = Math.max(0, Math.min(1, hsv.s));
        redraw();
      };
      const dragSv = function (event) {
        const bounds = svSvg.getBoundingClientRect();
        if (!bounds || !bounds.width) return;
        hsv.s = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        hsv.v = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height));
        redraw();
      };

      function attachDrag(surface, onDrag, onUp) {
        surface.addEventListener("mousedown", function (event) {
          if (event.button !== 0) return;
          event.preventDefault();
          onDrag(event);
          const move = function (e) { onDrag(e); };
          const up = function () {
            stopDrag();
            commit();
          };
          const stopDrag = trackDocumentDrag(move, up);
        });
      }
      attachDrag(hueSvg, dragHue);
      attachDrag(svSvg, dragSv);

      /* Hex row: format label + divider + value + copy button */
      const hexRow = el("div", { class: "krea2-color-hexrow" }, [
        el("span", { class: "krea2-color-hexlabel" }, "Hex"),
        el("span", { class: "krea2-color-hexdivider" }),
        hexInput,
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn",
          title: "Copy hex code",
          "aria-label": "Copy hex code",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(hexInput.value).then(function () {}, function () {});
            }
          },
        }, icon("copy", { width: "12", height: "12" })),
      ]);
      popup.appendChild(hueSvg);
      popup.appendChild(svSvg);
      popup.appendChild(hexRow);

      const rect = anchor.getBoundingClientRect();
      Object.assign(popup.style, {
        position: "fixed",
        left: rect.left + "px",
        top: (rect.bottom + 4) + "px",
        zIndex: "2147483500",
      });
      document.body.appendChild(popup);
      function onDocClick(e) {
        if (!popup.contains(e.target)) close();
      }
      let closed = false;
      const timer = setTimeout(() => { if (!closed) document.addEventListener("click", onDocClick, true); }, 0);
      function close() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        document.removeEventListener("click", onDocClick, true);
        popup.remove();
      }
      K.helpers.onCleanup(anchor, close);
      K.helpers.onCleanup(popup, close);
      return popup;
    }

    function renderColorPopupButton(character, key, palette, label) {
      const current = String(character[key] || "");
      const btn = el("button", {
        type: "button",
        class: "krea2-v2-color-btn" + (current ? " has-color" : ""),
        style: current ? { background: colourHexFor(current, palette) } : {},
        title: (current || "no colour") + " — click to pick " + label,
        "aria-label": label + ": " + (current || "none"),
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          openColorPopup(btn, palette, current, label, function (name) {
            character[key] = name;
            markDirty();
            scheduleAppearanceRender();
          });
        },
      }, current ? "" : icon("dot", { width: "11", height: "11", color: "#8a8f98" }));
      return btn;
    }

    /* Concepts Applied to <character>: header-click toggle, then three
     * side-by-side groups (Pose / Emotion / Face) each with its own dice
     * and each-job shuffle, plus the full picker for more. */
    function renderCharacterConceptsBlock(character) {
      const open = character.concepts_open !== false;
      const rows = Array.isArray(character.rows) ? character.rows : [];
      const block = el("section", {
        class: "krea2-v2-concepts-block" + (open ? " is-open" : ""),
      });
      const header = el("div", { class: "krea2-v2-block-head krea2-clickable-head" }, [
        el("strong", null, "Concepts Applied to " + (character.name || "this character")),
        el("span", { class: "krea2-v2-block-count" },
          rows.length + (rows.length === 1 ? " concept" : " concepts")),
        el("span", { class: "krea2-structured-spacer" }),
        el("span", { class: "krea2-v2-chevron", "aria-hidden": "true" },
          icon(open ? "chevron_down" : "chevron_right", { width: "12", height: "12" })),
      ]);
      header.addEventListener("click", function () {
        character.concepts_open = character.concepts_open === false;
        markDirty();
        render();
      });
      const body = el("div", { class: "krea2-v2-block-body" });
      if (open) {
        const grid = el("div", { class: "krea2-v2-concept-columns" });
        for (const group of CHARACTER_CONCEPT_GROUPS) {
          grid.appendChild(renderCharacterDirectionBlock(character, group.id, { collapsible: false }));
        }
        body.appendChild(grid);
        body.appendChild(el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-v2-add-concept",
          onClick: function () {
            showSearchableSelector({
              presets: compatibleLibrary(),
              title: "Add concepts for " + (character.name || "this character"),
              // Character concepts are subject & expression only: emotion,
              // face, body, placement. Camera / lighting / environment /
              // style live on the SCENE tab.
              categories: CHARACTER_PICKER_CATEGORIES,
              multiSelect: true,
              selectedIds: rows.map(function (row) { return row.preset_id; }),
              filterPreset: characterConflictFilter(character),
              onToggle: function (preset, shouldSelect) {
                if (shouldSelect) {
                  addCharacterRow(character, preset);
                } else {
                  const existing = (character.rows || []).find(function (row) {
                    return row.preset_id === preset.id;
                  });
                  if (existing) removeCharacterRow(character, existing.id);
                }
              },
              onClose: function () { render(); },
              getConceptColor: function (presetId) { return (state.concept_colors || {})[presetId] || ""; },
              onColorChange: function (presetId, newColor) {
                state.concept_colors = state.concept_colors || {};
                if (newColor) state.concept_colors[presetId] = newColor;
                else delete state.concept_colors[presetId];
                markDirty();
              },
            });
          },
        }, "+ Add Concept"));
      }
      block.appendChild(header);
      block.appendChild(body);
      return block;
    }

    function renderQuickDirectionsBlock(character) {
      const open = character.quick_open !== false;
      const block = el("section", {
        class: "krea2-v2-quick-block" + (open ? " is-open" : ""),
      });
      const header = el("div", { class: "krea2-v2-block-head krea2-clickable-head" }, [
        el("strong", null, "Quick Directions"),
        el("span", { class: "krea2-v2-block-hint" }, "one tap applies emotion, face and body together"),
        el("span", { class: "krea2-structured-spacer" }),
        el("span", { class: "krea2-v2-chevron", "aria-hidden": "true" },
          icon(open ? "chevron_down" : "chevron_right", { width: "12", height: "12" })),
      ]);
      header.addEventListener("click", function () {
        character.quick_open = character.quick_open === false;
        markDirty();
        render();
      });
      const body = el("div", { class: "krea2-v2-block-body" });
      if (open) {
        body.appendChild(renderQuickDirectionChips(character));
      }
      block.appendChild(header);
      block.appendChild(body);
      return block;
    }

    /* Per-character LoRA list. Every LoRA emits a <lora:name:strength>
     * token inside this character's prompt block; the first also drives the
     * model-side application (Model input -> Model output). */

    const VISUAL_CATEGORIES = [
      { id: "hair_style", label: "Hair style", icon: "palette" },
      { id: "hair_color", label: "Hair color", icon: "dot" },
      { id: "hair_length", label: "Hair length", icon: "sliders" },
      { id: "eyes", label: "Eyes", icon: "eye" },
      { id: "body_type", label: "Build", icon: "users" },
      { id: "fitness", label: "Fitness", icon: "sparkle" },
      { id: "proportions", label: "Height", icon: "compass" },
      { id: "age", label: "Age", icon: "sliders" },
      { id: "ethnicity", label: "Heritage", icon: "globe" },
      { id: "skin_color", label: "Skin tone", icon: "dot" },
      { id: "makeup", label: "Makeup", icon: "star" },
      { id: "nose", label: "Nose", icon: "eye" },
      { id: "mouth", label: "Mouth", icon: "star" },
      { id: "chin", label: "Chin", icon: "users" },
      { id: "face_shape", label: "Face shape", icon: "compass" },
    ];

    const VISUAL_OPTION_FIELDS = (function () {
      const byKey = {};
      CHARACTER_APPEARANCE.forEach(function (field) { byKey[field.key] = field; });
      return byKey;
    })();

    const HAIR_LENGTH_ORDER = ["shaved", "buzz cut", "short", "ear-length", "chin-length", "neck-length",
      "shoulder-length", "mid-back length", "waist-length", "hip-length", "floor-length"];

    function visualFieldOptions(key) {
      const field = VISUAL_OPTION_FIELDS[key];
      return field ? field.options : [];
    }

    function visualTile(label, active, onPick, opts) {
      const tile = el("button", {
        type: "button",
        class: "krea2-visual-tile" + (active ? " is-active" : ""),
        "aria-pressed": active ? "true" : "false",
        title: label,
        onClick: onPick,
      }, [el("span", { class: "krea2-visual-tile-label" }, label)]);
      if (active) tile.appendChild(el("span", { class: "krea2-visual-check" }, icon("check", { width: "10", height: "10" })));
      return tile;
    }

    function visualSwatch(name, hex, active, onPick) {
      return el("button", {
        type: "button",
        class: "krea2-visual-swatch" + (active ? " is-active" : ""),
        style: { background: hex },
        title: name,
        "aria-label": name,
        "aria-pressed": active ? "true" : "false",
        onClick: onPick,
      });
    }

    function visualSlider(character, key, options, label, onChange) {
      const current = String(character[key] || "");
      const index = Math.max(0, options.indexOf(current));
      const slider = el("input", {
        type: "range",
        class: "krea2-visual-slider",
        min: "0",
        max: String(options.length - 1),
        step: "1",
        value: String(index >= 0 ? index : 0),
        "aria-label": label,
        onChange: function (event) {
          const option = options[Number(event.target.value)];
          if (option) onChange(option);
        },
      });
      return el("div", { class: "krea2-visual-slider-row" }, [
        el("span", { class: "krea2-visual-slider-value" }, current || "—"),
        slider,
      ]);
    }

    function visualCategoryControls(character, categoryId) {
      const wrap = el("div", { class: "krea2-visual-controls" });
      const commit = function (key, value) {
        character[key] = value;
        markDirty();
        render();
      };
      switch (categoryId) {
        case "hair_style":
        case "nose":
        case "mouth":
        case "chin":
        case "face_shape":
        case "ethnicity":
        case "body_type":
        case "makeup": {
          const options = visualFieldOptions(categoryId);
          const grid = el("div", { class: "krea2-visual-tile-grid" });
          for (const option of options) {
            grid.appendChild(visualTile(option, String(character[categoryId] || "") === option,
              function () { commit(categoryId, option); }));
          }
          wrap.appendChild(grid);
          break;
        }
        case "hair_color":
        case "skin_color": {
          const palette = categoryId === "skin_color" ? PALETTE_COLORS : PALETTE_COLORS;
          const swatches = el("div", { class: "krea2-visual-swatch-row" });
          for (const entry of palette) {
            swatches.appendChild(visualSwatch(entry[0], entry[1],
              String(character[categoryId] || "") === entry[0],
              function () { commit(categoryId, entry[0]); }));
          }
          swatches.appendChild(el("button", {
            type: "button",
            class: "krea2-visual-custom-color",
            title: "Custom colour...",
            "aria-label": "Custom colour",
            onClick: function (event) {
              if (event && typeof event.stopPropagation === "function") event.stopPropagation();
              const anchor = event.currentTarget;
              openColorPopup(anchor, PALETTE_COLORS, String(character[categoryId] || ""),
                categoryId === "skin_color" ? "Skin tone" : "Hair colour",
                function (name) { commit(categoryId, name); });
            },
          }, icon("sparkle", { width: "12", height: "12" })));
          wrap.appendChild(swatches);
          break;
        }
        case "eyes": {
          const shapes = visualFieldOptions("eyes").filter(function (option) {
            return !/(blue|green|hazel|brown|black|grey|amber|violet|heterochromatic)/.test(option);
          });
          const grid = el("div", { class: "krea2-visual-tile-grid" });
          for (const option of shapes) {
            grid.appendChild(visualTile(option, String(character.eyes || "") === option,
              function () { commit("eyes", option); }));
          }
          wrap.appendChild(grid);
          const iris = el("div", { class: "krea2-visual-swatch-row" });
          iris.appendChild(el("span", { class: "krea2-visual-group-label" }, "Iris colour"));
          for (const entry of PALETTE_COLORS) {
            iris.appendChild(visualSwatch(entry[0], entry[1],
              String(character.eye_color || "") === entry[0],
              function () { commit("eye_color", entry[0]); }));
          }
          wrap.appendChild(iris);
          break;
        }
        case "hair_length": {
          const presets = [
            ["Short", "short"], ["Medium", "shoulder-length"],
            ["Long", "waist-length"], ["Extra Long", "floor-length"],
          ];
          const presetsRow = el("div", { class: "krea2-visual-preset-row" });
          for (const entry of presets) {
            presetsRow.appendChild(visualTile(entry[0], String(character.hair_length || "") === entry[1],
              function () { commit("hair_length", entry[1]); }));
          }
          wrap.appendChild(presetsRow);
          wrap.appendChild(visualSlider(character, "hair_length", HAIR_LENGTH_ORDER, "Hair length refinement",
            function (option) { commit("hair_length", option); }));
          break;
        }
        case "fitness": {
          wrap.appendChild(visualSlider(character, "fitness", visualFieldOptions("fitness"), "Fitness",
            function (option) { commit("fitness", option); }));
          break;
        }
        case "proportions": {
          wrap.appendChild(visualSlider(character, "proportions", visualFieldOptions("proportions"), "Height",
            function (option) { commit("proportions", option); }));
          break;
        }
        case "age": {
          wrap.appendChild(visualSlider(character, "age", visualFieldOptions("age"), "Age",
            function (option) { commit("age", option); }));
          break;
        }
        default:
          break;
      }
      return wrap;
    }

    function renderVisualCreator(character) {
      const panel = el("div", { class: "krea2-visual-creator" });
      const top = el("div", { class: "krea2-visual-top" }, [
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn",
          title: "Close the visual creator",
          "aria-label": "Close the visual creator",
          onClick: function () {
            character.expanded = false;
            markDirty();
            render();
          },
        }, icon("close", { width: "12", height: "12" })),
        el("span", { class: "krea2-visual-title" }, (character.name || "Character") + " — Visual Creator"),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-visual-save",
          onClick: function () { saveCharacterPreset(character, character.name || ""); },
        }, "Save"),
      ]);
      const actions = el("div", { class: "krea2-visual-actions" }, [
        el("button", { type: "button", class: "krea2-wizard-btn", title: "Undo", onClick: undo }, "Undo"),
        el("button", { type: "button", class: "krea2-wizard-btn", title: "Redo", onClick: redo }, "Redo"),
        el("button", {
          type: "button", class: "krea2-wizard-btn", title: "Reset this character's look",
          onClick: function () {
            if (!window.confirm("Reset " + (character.name || "this character") + "'s appearance?")) return;
            for (const field of CHARACTER_APPEARANCE) {
              character[field.key] = "";
            }
            markDirty();
            render();
          },
        }, "Reset"),
        el("button", {
          type: "button", class: "krea2-wizard-btn krea2-visual-randomize", title: "Randomize unlocked categories",
          onClick: function () {
            const locked = character.visual_locked || {};
            for (const field of CHARACTER_APPEARANCE) {
              if (locked[field.key]) continue;
              randomizeAppearanceField(character, field);
            }
            markDirty();
            render();
          },
        }, "Randomize"),
      ]);
      const activeCategory = character.visual_category || "hair_style";
      const controlsArea = el("div", { class: "krea2-visual-controls-area" }, [
        visualCategoryControls(character, activeCategory),
      ]);
      const bar = el("div", { class: "krea2-visual-category-bar", role: "tablist" });
      for (const category of VISUAL_CATEGORIES) {
        const active = category.id === activeCategory;
        const locked = !!(character.visual_locked || {})[category.id];
        const btn = el("button", {
          type: "button",
          role: "tab",
          "aria-selected": active ? "true" : "false",
          class: "krea2-visual-category" + (active ? " is-active" : ""),
          title: category.label + (locked ? " (locked)" : ""),
          onClick: function () {
            character.visual_category = category.id;
            markDirty();
            render();
          },
        }, [
          icon(category.icon, { width: "13", height: "13" }),
          el("span", { class: "krea2-visual-category-label" }, category.label),
        ]);
        if (locked) btn.classList.add("is-locked");
        bar.appendChild(btn);
      }
      const lockRow = el("div", { class: "krea2-visual-lock-row" }, [
        el("label", { class: "krea2-inline-check", title: "Lock the active category so Randomize keeps it" }, [
          el("input", {
            type: "checkbox",
            checked: !!(character.visual_locked || {})[activeCategory],
            onChange: function (event) {
              if (!character.visual_locked) character.visual_locked = {};
              character.visual_locked[activeCategory] = !!event.target.checked;
              markDirty();
              render();
            },
          }),
          el("span", null, "Lock " + ((VISUAL_CATEGORIES.find(function (c) { return c.id === activeCategory; }) || {}).label || activeCategory) + " for Randomize"),
        ]),
      ]);
      panel.append(top, actions, controlsArea, lockRow, bar);
      return panel;
    }

    /* v2 cast card: header (click = toggle) + four appearance dropdowns on
     * one row, identity chips, concepts block, quick directions, LoRA. */
    function renderCharacterCard(character, index) {
      const expanded = character.expanded !== false;
      const card = el("section", {
        class: "krea2-character-card krea2-v2-character-card" + (expanded ? " is-expanded" : ""),
        dataset: { characterId: character.id },
      });
      const header = el("div", { class: "krea2-character-card-header krea2-clickable-head" });
      const visualCreatorOn = state.character_creator === "visual";
      const portraitInput = el("input", {
        type: "file",
        accept: "image/jpeg,image/png,image/webp",
        hidden: true,
        onChange: function (event) {
          const file = event.target.files && event.target.files[0];
          if (file) storeProfileImage(character, file);
          event.target.value = "";
        },
      });
      const openPortraitPicker = function () { portraitInput.click(); };
      const portrait = renderCharacterPortrait(character, openPortraitPicker);
      const name = el("input", {
        type: "text",
        class: "krea2-compact-input krea2-character-name",
        value: character.name || "",
        "aria-label": "Character name",
        onInput: function (event) { character.name = event.target.value; markDirty(); },
      });
      const summary = el("span", { class: "krea2-character-summary" },
        characterSummary(character) || "No appearance set yet");
      const enabled = el("label", { class: "krea2-inline-check", title: "Include this character in the prompt" }, [
        el("input", {
          type: "checkbox",
          checked: character.enabled !== false,
          onChange: function (event) { character.enabled = !!event.target.checked; markDirty(); render(); },
        }),
        el("span", null, "Include"),
      ]);
      const randomAll = diceButton("Randomize this entire character's look once now", function () {
        resolveRandom({ kind: "appearance", character_id: character.id, pools: Object.fromEntries(CHARACTER_APPEARANCE.map(field => [field.key, field.options])) });
      }, "krea2-character-random-look krea2-icon-btn");
      const allFieldsEachJob = V2_APPEARANCE_FIELDS.every(function (field) {
        return !!(character.randomize_fields || {})[field.key];
      });
      const randomAllEachJob = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle krea2-character-random-each-job" + (allFieldsEachJob ? " is-active" : ""),
        title: allFieldsEachJob
          ? "This character's appearance changes for every queued job. Click to keep it fixed."
          : "Randomize this character's appearance for every queued job.",
        "aria-label": "Randomize this character's appearance every queued job",
        "aria-pressed": allFieldsEachJob ? "true" : "false",
        onClick: function () {
          V2_APPEARANCE_FIELDS.forEach(function (field) {
            setAppearanceFieldEachJob(character, field, !allFieldsEachJob);
          });
          markDirty(); render();
        },
      }, icon("shuffle", { width: "13", height: "13" }));
      const save = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-save-character",
        title: "Save this character's look as a reusable preset",
        onClick: function () { saveCharacterPreset(character, name.value || character.name); },
      }, "Save as");
      const remove = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-danger",
        title: "Delete character",
        "aria-label": "Delete character",
        onClick: function () {
          if (!window.confirm("Delete \u201c" + (character.name || "this character") + "\u201d from the cast?")) return;
          state.characters = state.characters.filter(function (item) { return item.id !== character.id; });
          if (state.selected_character_id === character.id) {
            state.selected_character_id = state.characters.length ? state.characters[0].id : null;
          }
          markDirty(); render();
        },
      }, icon("trash", { width: "12", height: "12" }));
      const chevron = el("span", { class: "krea2-v2-chevron krea2-character-chevron", "aria-hidden": "true" },
        icon(expanded ? "chevron_down" : "chevron_right", { width: "13", height: "13" }));
      const identity = el("div", { class: "krea2-character-card-identity" }, [
        name,
        summary,
        renderGenderPills(character),
      ]);
      const actions = el("div", { class: "krea2-character-card-actions" }, [
        el("span", { class: "krea2-identity-status", dataset: { characterId: character.id } }, identityStatus(character)),
        enabled,
        el("div", { class: "krea2-wizard-random-controls" }, [randomAll, randomAllEachJob]),
        save,
        remove,
      ]);
      if (savedPresets.some(preset => preset.id === character.loaded_identity_preset_id && !preset.builtin)) actions.appendChild(W.button("Update saved identity", () => {
        const preset = savedPresets.find(preset => preset.id === character.loaded_identity_preset_id);
        if (!preset) return;
        preset.character = cloneJson(character);
        character.loaded_identity_snapshot = identityFingerprint(character);
        persistSavedPresets("Saved identity updated");
      }));
      header.append(portrait, identity, actions, chevron);
      header.addEventListener("click", function (event) {
        const target = event && event.target;
        if (target && typeof target.closest === "function"
            && target.closest("input,button,select,textarea,label")) return;
        character.expanded = character.expanded === false;
        markDirty();
        render();
      });

      const body = el("div", { class: "krea2-character-card-body" });
      if (expanded) {
        body.appendChild(renderCharacterProfileTools(character, openPortraitPicker));
        if (visualCreatorOn) {
          body.appendChild(renderVisualCreator(character));
        } else {
          /* Appearance wall (every field with its own dice + each-job
           * shuffle), then the Direction columns. */
          body.appendChild(renderCharacterPresetRow(character));
          body.appendChild(renderAppearanceColumns(character));
          body.appendChild(renderAdditionalInfo(character));
          body.appendChild(renderLoraSection(character));
        }
      }
      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(portraitInput);
      return card;
    }

    /* LOAD icon: opens the character preset popup (built-in + saved +
     * workflow characters), laid out like the concept picker. */
    function renderCharacterPresetRow(character) {
      const wrap = el("div", { class: "krea2-character-preset-row" });
      const loadBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-character-load",
        title: "Load a character preset",
        "aria-label": "Load a character preset",
        onClick: function () { openCharacterPresetPopup(character, loadBtn); },
      }, icon("download", { width: "12", height: "12" }));
      wrap.appendChild(loadBtn);
      return wrap;
    }

    function openCharacterPresetPopup() { openWorkspaceChooser("character"); }

    /* Appearance wall: three labelled columns; every field keeps its title
     * and dropdown on ONE horizontal line, with a clear ×, a dice
     * (randomize once) and a shuffle (every queued job). Colour fields
     * keep their pop-up pickers on the same row. */
    function renderAppearanceColumns(character) {
      const grid = el("div", { class: "krea2-character-columns" });
      const columns = [
        ["Identity & hair", ["age", "ethnicity", "hair_style", "hair_length", "makeup"]],
        ["Face & body", ["eyes", "nose", "mouth", "chin", "face_shape", "body_type"]],
        ["Clothing", ["clothing_top", "clothing_bottom", "ensemble"]],
      ];
      for (const layout of columns) {
        const fields = V2_APPEARANCE_FIELDS.filter(function (field) {
          return layout[1].includes(field.key);
        });
        if (!fields.length) continue;
        const col = el("div", { class: "krea2-character-column" });
        col.appendChild(el("div", { class: "krea2-character-column-title" }, layout[0]));
        for (const field of fields) {
          const fieldEl = el("label", {
            class: "krea2-character-field" + (field.wide ? " krea2-field-wide" : ""),
          }, [
            el("span", { class: "krea2-v2-field-label" }, field.label),
          ]);
          const combobox = comboboxForField(character, field);
          const clearBtn = el("button", {
            type: "button",
            class: "krea2-wizard-btn krea2-icon-btn krea2-field-clear",
            title: "Clear " + field.label,
            "aria-label": "Clear " + field.label,
            onClick: function (event) {
              if (event && typeof event.stopPropagation === "function") event.stopPropagation();
              applyAppearanceValue(character, field, "");
              markDirty();
              render();
            },
          }, "×");
          const dice = el("button", {
            type: "button",
            class: "krea2-wizard-btn krea2-icon-btn krea2-field-random",
            title: "Roll " + field.label + " once now",
            "aria-label": "Randomize " + field.label + " once",
            onClick: function (event) {
              if (event && typeof event.stopPropagation === "function") event.stopPropagation();
              randomizeAppearanceField(character, field);
              markDirty();
              render();
            },
          }, icon("dice", { width: "12", height: "12" }));
          const eachJobOn = !!(character.randomize_fields || {})[field.key];
          const shuffle = el("button", {
            type: "button",
            class: "krea2-wizard-btn krea2-icon-btn krea2-field-each-job krea2-shuffle" + (eachJobOn ? " is-active" : ""),
            title: eachJobOn
              ? field.label + " randomizes for every queued job. Click to keep it fixed."
              : "Randomize " + field.label + " for every queued job.",
            "aria-label": "Randomize " + field.label + " every queued job",
            "aria-pressed": eachJobOn ? "true" : "false",
            onClick: function (event) {
              if (event && typeof event.stopPropagation === "function") event.stopPropagation();
              setAppearanceFieldEachJob(character, field, !eachJobOn);
              markDirty();
              render();
            },
          }, icon("shuffle", { width: "12", height: "12" }));
          const fieldRow = el("div", { class: "krea2-field-row" }, [
            combobox.input,
            combobox.datalist,
            clearBtn,
            dice,
            shuffle,
          ]);
          if (field.colorKey) {
            const palette = field.colorPalette === "light" ? LIGHT_PALETTE
              : field.colorPalette === "hair" ? HAIR_PALETTE : PALETTE_COLORS;
            const colourLabel = field.key === "eyes" ? "Eye colour" : field.label + " colour";
            fieldRow.appendChild(renderColorPopupButton(character, field.colorKey, palette, colourLabel));
            const colorField = { key: field.colorKey, options: palette.map(function (entry) { return entry[0]; }) };
            fieldRow.appendChild(fieldRandomControls(character, colorField));
          }
          fieldEl.appendChild(fieldRow);
          col.appendChild(fieldEl);
        }
        grid.appendChild(col);
      }
      return grid;
    }


    /* v1.3.1 "Additional info" behind a checkbox, auto-expanding. */
    function renderAdditionalInfo(character) {
      const additionalOpen = character.additional_open === true;
      const check = el("label", { class: "krea2-inline-check krea2-additional-toggle" }, [
        el("input", {
          type: "checkbox",
          checked: additionalOpen,
          onChange: function (event) {
            character.additional_open = !!event.target.checked;
            markDirty();
            render();
          },
        }),
        el("span", null, "Additional info"),
      ]);
      if (!additionalOpen) return check;
      const ta = el("textarea", {
        class: "krea2-compact-textarea krea2-additional-info",
        rows: "2",
        "aria-label": "Additional characteristics",
        placeholder: "A mole on her cheek, an eyepatch over one eye, a scar\u2026",
        onInput: function (event) {
          character.additional_info = event.target.value;
          autoExpandTextarea(event);
          markDirty();
        },
      }, character.additional_info || "");
      autoExpandTextarea({ target: ta });
      return el("div", { class: "krea2-character-grid-wrap" }, [check, ta]);
    }

    /* Conflict-aware cascading (v1 scope: emotion, framing, angle). */
    function getConflictPairs() {
      if (conflictPairsCache) return conflictPairsCache;
      const pairs = [];
      const add = function (a, b) { if (a !== b) pairs.push([a, b]); };
      for (const pair of CURATED_CONFLICTS) add(pair[0], pair[1]);
      const tokens = new Map();
      for (const preset of library) {
        const slug = String(preset.id || "").split(".").pop();
        if (!slug) continue;
        if (!tokens.has(slug)) tokens.set(slug, []);
        tokens.get(slug).push(preset.id);
      }
      for (const conflict of conflictList) {
        const id = String(conflict && conflict.id || "");
        const m = id.match(/([a-z0-9_]+)_vs_([a-z0-9_]+)$/);
        if (!m) continue;
        for (const x of tokens.get(m[1]) || []) {
          for (const y of tokens.get(m[2]) || []) {
            const cx = String(x).split(".")[0];
            if (cx === String(y).split(".")[0] && CONFLICT_CATEGORIES.includes(cx)) add(x, y);
          }
        }
      }
      conflictPairsCache = pairs;
      return pairs;
    }

    function conflictsWithAny(presetId, ids) {
      const pairs = getConflictPairs();
      const category = String(presetId).split(".")[0];
      for (const id of ids) {
        if (id === presetId) continue;
        if (String(id).split(".")[0] !== category) continue;
        for (const pair of pairs) {
          if ((pair[0] === id && pair[1] === presetId) || (pair[0] === presetId && pair[1] === id)) {
            return true;
          }
        }
      }
      return false;
    }

    function characterConflictFilter(character) {
      const applied = (character.rows || []).map(function (row) {
        return row.preset_id;
      }).filter(Boolean);
      return function (preset, selectedIds) {
        if (!CONFLICT_CATEGORIES.includes(preset.category)) return true;
        return !conflictsWithAny(preset.id, applied.concat(selectedIds || []));
      };
    }

    /* Scene chip rows: single-select per category, conflict-aware. */
    function chipActive(presetId) {
      return state.rows.some(function (row) { return row.preset_id === presetId; });
    }

    function toggleSceneChip(presetId) {
      const preset = library.find(function (item) { return item.id === presetId; });
      if (!preset) return;
      if (chipActive(presetId)) {
        state.rows = state.rows.filter(function (row) { return row.preset_id !== presetId; });
      } else {
        state.rows = state.rows.filter(function (row) { return row.category !== preset.category; });
        const row = presetToRow(preset, state);
        row.strength = 1.2;
        state.rows.push(row);
        if (preset.category === "lighting_setup") {
          applyLightingSetupLayout(presetId);
        }
      }
      markDirty();
      render();
    }

    /* Multi-select variant (atmosphere): several can be active at once —
     * foggy AND smokey. */
    function toggleSceneChipMulti(presetId) {
      const preset = library.find(function (item) { return item.id === presetId; });
      if (!preset) return;
      if (chipActive(presetId)) {
        state.rows = state.rows.filter(function (row) { return row.preset_id !== presetId; });
      } else {
        const row = presetToRow(preset, state);
        row.strength = 1.2;
        state.rows.push(row);
      }
      markDirty();
      render();
    }

    /* Map a scene chip category to the backend group its each-job shuffle
     * flag lives on. */
    function groupForChipCategory(category) {
      if (category === "framing" || category === "angle" || category === "aperture" || category === "lens") {
        return "camera_film";
      }
      if (category === "lighting_setup" || category === "lighting_direction") {
        return "lighting";
      }
      if (category === "atmosphere" || category === "environment_movement") {
        return "environment";
      }
      return "style_finish";
    }

    /* Randomize one scene chip category once: replace its rows with a
     * random preset from the chip rail. */
    function randomizeSceneChips(category, chips) {
      return resolveRandom({ kind: "category", category });
    }

    function toggleChipShuffle(category) {
      const group = groupForChipCategory(category);
      state.randomize_on_job = state.randomize_on_job || {};
      state.randomize_on_job[group] = !state.randomize_on_job[group];
      markDirty();
      render();
    }

    function renderChipRow(label, category, chips, multi) {
      const row = el("div", { class: "krea2-v2-chip-row" });
      row.appendChild(el("span", { class: "krea2-v2-field-label" }, label));
      const wrap = el("div", { class: "krea2-v2-chips" });
      const activeIds = state.rows.filter(function (row) {
        return row.category === category;
      }).map(function (row) { return row.preset_id; });
      for (const entry of chips) {
        const active = chipActive(entry[0]);
        const conflicted = !multi && conflictsWithAny(entry[0], activeIds);
        wrap.appendChild(el("button", {
          type: "button",
          class: "krea2-v2-chip" + (active ? " is-active" : "") + (conflicted ? " is-conflicted" : ""),
          title: conflicted
            ? "Conflicts with an active concept in this row"
            : (active ? "Click to remove" : "Click to apply"),
          disabled: conflicted,
          onClick: function () {
            if (multi) toggleSceneChipMulti(entry[0]);
            else toggleSceneChip(entry[0]);
          },
        }, entry[1]));
      }
      row.appendChild(wrap);
      const group = groupForChipCategory(category);
      const shuffleOn = !!(state.randomize_on_job || {})[group];
      const dice = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-chip-dice",
        title: "Randomize " + label + " once now",
        "aria-label": "Randomize " + label + " once",
        onClick: function () { randomizeSceneChips(category, chips); },
      }, icon("dice", { width: "12", height: "12" }));
      const shuffle = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (shuffleOn ? " is-active" : ""),
        title: shuffleOn
          ? "Shuffle on: this section randomizes every queued job. Click to stop."
          : "Shuffle off: randomize this section every queued job.",
        "aria-label": "Randomize " + label + " every queued job",
        "aria-pressed": shuffleOn ? "true" : "false",
        onClick: function () { toggleChipShuffle(category); },
      }, icon("shuffle", { width: "12", height: "12" }));
      const clearRow = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-clear",
        title: "Clear all " + label + " concepts (removes them from the prompt)",
        "aria-label": "Clear all " + label + " concepts",
        onClick: function () {
          state.rows = state.rows.filter(function (row) { return row.category !== category; });
          markDirty();
          render();
        },
      }, icon("close", { width: "12", height: "12" }));
      row.appendChild(el("div", { class: "krea2-v2-field-random-controls" }, [dice, shuffle, clearRow]));
      return row;
    }

    /* Lens slider: snaps to a real library lens preset when close, else
     * emits a custom "Nmm lens" phrase. */
    function currentLensMm() {
      const row = state.rows.find(function (r) { return r.category === "lens"; });
      if (!row) return null;
      const match = String(row.phrase || "").match(/(\d{2,3})\s*mm/);
      return match ? Number(match[1]) : null;
    }

    function nearestLensPreset(mm) {
      let best = null;
      let bestDiff = Infinity;
      for (const preset of library) {
        if (preset.category !== "lens") continue;
        const match = String(preset.id).match(/(\d{2,3})mm/);
        if (!match) continue;
        const diff = Math.abs(Number(match[1]) - mm);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = preset;
        }
      }
      return bestDiff <= 1 ? best : null;
    }

    function setLensMm(mm) {
      const clamped = Math.max(14, Math.min(200, Math.round(mm)));
      const preset = nearestLensPreset(clamped);
      state.rows = state.rows.filter(function (row) { return row.category !== "lens"; });
      const row = preset
        ? presetToRow(preset, state)
        : {
            id: uniqueRowId(state),
            category: "lens",
            preset_id: "custom.lens_" + clamped,
            label: clamped + "mm lens",
            phrase: clamped + "mm lens",
            control_mode: "scalar",
            intensity: 60,
            strength: 1.2,
            enabled: true,
            aliases: [],
            verification: "general visual vocabulary",
            source: "custom",
          };
      state.rows.push(row);
      markDirty();
      render();
    }

    function renderLensRow() {
      const mm = currentLensMm() || 85;
      const slider = el("input", {
        type: "range",
        class: "krea2-v2-lens-slider",
        min: "14",
        max: "200",
        step: "1",
        value: String(mm),
        "aria-label": "Focal length in millimetres",
        // Dragging only updates the visible label; the prompt row is
        // committed on release so the slider never loses focus mid-drag.
        onInput: function (event) {
          value.textContent = Number(event.target.value) + "mm";
        },
        onChange: function (event) {
          setLensMm(Number(event.target.value));
        },
      });
      const value = el("span", { class: "krea2-v2-lens-value" }, mm + "mm");
      const clearLens = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-clear",
        title: "Clear the lens (removes it from the prompt)",
        "aria-label": "Clear the lens",
        onClick: function () {
          state.rows = state.rows.filter(function (row) { return row.category !== "lens"; });
          markDirty();
          render();
        },
      }, icon("close", { width: "12", height: "12" }));
      const row = el("div", { class: "krea2-v2-chip-row krea2-v2-lens-row" });
      row.append(
        el("span", { class: "krea2-v2-field-label" }, "Lens"),
        slider,
        value,
        clearLens,
      );
      return row;
    }

    /* ------------------------------------------------------------------
     * Lighting panel (v2.3): a full-width section under Camera.
     * Central pseudo-3D stage + per-light cards. Each light carries
     * azimuth (degrees, 0 = front), distance in metres (0.5m–4m),
     * elevation (0–90°), strength (0–3), colour, and an on/off toggle.
     * Every light compiles into a lighting_direction concept row; the
     * preset rail and gallery drive whole setups.
     * ------------------------------------------------------------------ */
    const LIGHT_METERS_MIN = 0.5;
    const LIGHT_METERS_MAX = 4.0;
    const LIGHT_HEIGHT_MAX = 90;
    const LIGHT_DISTANCE_STEP = 0.1;

    /* Round a metre value to the 0.1 step without float drift. */
    function roundMetres(value) {
      return Math.round(Number(value) * 10) / 10;
    }

    function normalizeAngle(rad) {
      let a = rad % (2 * Math.PI);
      if (a > Math.PI) a -= 2 * Math.PI;
      if (a < -Math.PI) a += 2 * Math.PI;
      return a;
    }

    /* User-facing degrees: 0 = front, 90 = right, 180 = back, 270 = left. */
    function degreesToRad(degrees) {
      return ((90 - degrees) * Math.PI) / 180;
    }

    function radToDegrees(rad) {
      const degrees = 90 - (normalizeAngle(rad) * 180) / Math.PI;
      return ((degrees % 360) + 360) % 360;
    }

    function lightSideLabel(deg) {
      const a = ((Math.round(Number(deg) || 0) % 360) + 360) % 360;
      const sides = ["front", "front right", "right", "back right", "back", "back left", "left", "front left"];
      return sides[Math.round(a / 45) % 8];
    }

    /* Legacy compass distance (0.25–1) -> metres (0.5–2). */
    function lightDistanceMetres(distance) {
      const d = Math.max(0.25, Math.min(1, Number(distance) || 0.85));
      return Math.round((0.5 + ((d - 0.25) / 0.75) * 1.5) * 2) / 2;
    }

    function formatMetres(value) {
      const v = Math.round(Number(value) * 100) / 100;
      return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }

    function lightPhrase(light) {
      const side = lightSideLabel(light.angleDeg);
      const metres = formatMetres(light.distanceM);
      const height = Math.round(Number(light.heightDeg) || 0);
      const colour = String(light.color || "").trim();
      if (light.coordinatesEdited) {
        return lightingScene.physicalPhrase(light);
      }
      let phrase = "light from the " + side + " at " + metres + "m";
      if (height > 0) phrase += ", elevated at " + height + " degrees";
      if (colour && colour !== "white") phrase += ", in " + colour;
      return phrase;
    }

    function lightHex(name) {
      const entry = LIGHT_PALETTE.find(function (item) {
        return item[0] === String(name || "");
      });
      if (entry) return entry[1];
      return "#ffffff";
    }

    function normalizeLight(raw, index) {
      const light = raw && typeof raw === "object" ? raw : {};
      const id = String(light.id || "light_" + (index + 1));
      let angleDeg = Number(light.angleDeg);
      if (!Number.isFinite(angleDeg)) {
        angleDeg = Number.isFinite(Number(light.angle))
          ? Math.round(radToDegrees(Number(light.angle)))
          : 0;
      }
      angleDeg = ((Math.round(angleDeg) % 360) + 360) % 360;
      let distanceM = Number(light.distanceM);
      if (!Number.isFinite(distanceM)) {
        const legacy = Number(light.distance);
        distanceM = Number.isFinite(legacy) ? lightDistanceMetres(legacy) : 1.5;
      }
      distanceM = Math.max(LIGHT_METERS_MIN, Math.min(LIGHT_METERS_MAX, roundMetres(distanceM)));
      let heightDeg = Number(light.heightDeg);
      if (!Number.isFinite(heightDeg)) {
        const defaults = [25, 15, 55];
        heightDeg = defaults[index % defaults.length];
      }
      heightDeg = Math.max(0, Math.min(LIGHT_HEIGHT_MAX, Math.round(heightDeg)));
      let strength = Number(light.strength);
      if (!Number.isFinite(strength)) strength = 1.5;
      strength = Math.max(0, Math.min(3, Math.round(strength * 20) / 20));
      return {
        id: id,
        label: String(light.label || ("Light " + (index + 1))),
        angleDeg: angleDeg,
        distanceM: distanceM,
        heightDeg: heightDeg,
        ...lightingScene.physicalCoordinates({ ...light, distanceM, heightDeg }),
        coordinatesEdited: light.coordinatesEdited === true,
        strength: strength,
        color: String(light.color || ""),
        enabled: light.enabled !== false,
      };
    }

    /* Built-in lighting setups. Every light is described by its final
     * stage geometry; the phrase compiles from the same fields. */
    const LIGHTING_PRESETS = [
      {
        id: "lighting_setup.soft_diffused_lighting",
        label: "Soft", category: "Portrait",
        description: "Soft, flattering light with smooth shadows",
        lights: [{ label: "Soft Key (Front)", angleDeg: 0, distanceM: 1.8, heightDeg: 25, strength: 1.5, color: "" }],
      },
      {
        id: "lighting_setup.hard_directional_lighting",
        label: "Hard", category: "Studio",
        description: "Strong, directional light with crisp shadows",
        lights: [{ label: "Hard Key (Front-Right)", angleDeg: 45, distanceM: 1.5, heightDeg: 35, strength: 2.0, color: "" }],
      },
      {
        id: "lighting_setup.three_point_lighting",
        label: "Three-Point", category: "Studio",
        description: "Classic key, fill & backlight setup",
        lights: [
          { label: "Key Light (Front-Left)", angleDeg: 325, distanceM: 1.8, heightDeg: 25, strength: 1.4, color: "blue" },
          { label: "Fill Light (Front-Right)", angleDeg: 45, distanceM: 1.8, heightDeg: 15, strength: 0.6, color: "orange" },
          { label: "Rim Light (Back-Left)", angleDeg: 235, distanceM: 2.2, heightDeg: 55, strength: 1.2, color: "pink" },
        ],
      },
      {
        id: "lighting_setup.rembrandt_lighting",
        label: "Rembrandt", category: "Portrait",
        description: "Dramatic triangle of light on the face",
        lights: [{ label: "Rembrandt Key (Front-Right)", angleDeg: 45, distanceM: 2.0, heightDeg: 30, strength: 1.4, color: "" }],
      },
      {
        id: "lighting_setup.chiaroscuro",
        label: "Cinematic", category: "Cinematic",
        description: "Atmospheric, filmic lighting style",
        lights: [
          { label: "Key (Front-Left)", angleDeg: 30, distanceM: 2.2, heightDeg: 28, strength: 1.3, color: "orange" },
          { label: "Rim (Back-Left)", angleDeg: 160, distanceM: 1.8, heightDeg: 50, strength: 1.1, color: "cyan" },
        ],
      },
      {
        id: "lighting_setup.high_key_lighting",
        label: "High Key", category: "Portrait",
        description: "Bright, low-contrast, minimal shadows",
        lights: [
          { label: "Key (Front)", angleDeg: 0, distanceM: 1.8, heightDeg: 16, strength: 2.4, color: "" },
          { label: "Fill (Front-Right)", angleDeg: 45, distanceM: 2.2, heightDeg: 10, strength: 1.5, color: "" },
          { label: "Background (Front-Left)", angleDeg: 315, distanceM: 2.6, heightDeg: 12, strength: 1.4, color: "" },
        ],
      },
      {
        id: "lighting_setup.low_key_lighting",
        label: "Low Key", category: "Cinematic",
        description: "Dark, moody with strong shadows",
        lights: [{ label: "Key (Front-Left)", angleDeg: 30, distanceM: 2.4, heightDeg: 35, strength: 1.6, color: "blue" }],
      },
      {
        id: "lighting_setup.butterfly_lighting",
        label: "Butterfly", category: "Portrait",
        description: "Paramount-style light with shadow under nose",
        lights: [{ label: "Butterfly Key (Front, high)", angleDeg: 0, distanceM: 1.8, heightDeg: 58, strength: 1.5, color: "" }],
      },
      {
        id: "lighting_setup.split_lighting",
        label: "Split", category: "Dramatic",
        description: "Half-face fill, half shadow",
        lights: [{ label: "Split Key (Left)", angleDeg: 270, distanceM: 1.6, heightDeg: 25, strength: 1.8, color: "" }],
      },
      {
        id: "lighting_setup.beauty_dish_lighting",
        label: "Beauty Dish", category: "Portrait",
        description: "Soft-wrap light with distinctive falloff",
        lights: [{ label: "Beauty Dish (Front, high)", angleDeg: 0, distanceM: 2.0, heightDeg: 45, strength: 1.4, color: "" }],
      },
      {
        id: "lighting_setup.golden_hour_lighting",
        label: "Golden Hour", category: "Cinematic",
        description: "Low warm key, long soft shadows",
        lights: [{ label: "Sun (Front-Left)", angleDeg: 30, distanceM: 2.6, heightDeg: 12, strength: 1.4, color: "orange" }],
      },
      {
        id: "lighting_setup.candlelight",
        label: "Candlelight", category: "Utility",
        description: "Warm flickering single-source lighting",
        lights: [{ label: "Candle (Front-Left)", angleDeg: 10, distanceM: 1.2, heightDeg: 8, strength: 1.2, color: "yellow" }],
      },
      {
        id: "lighting_setup.neon_lighting",
        label: "Neon", category: "Utility",
        description: "Colourful synthetic neon glow",
        lights: [
          { label: "Neon Key (Left)", angleDeg: 270, distanceM: 1.6, heightDeg: 20, strength: 1.5, color: "magenta" },
          { label: "Neon Fill (Right)", angleDeg: 90, distanceM: 1.8, heightDeg: 10, strength: 0.9, color: "cyan" },
        ],
      },
      {
        id: "lighting_setup.window_lighting",
        label: "Window", category: "Studio",
        description: "Soft directional light from one side",
        lights: [{ label: "Window (Left)", angleDeg: 270, distanceM: 2.4, heightDeg: 20, strength: 1.3, color: "" }],
      },
      {
        id: "lighting_setup.moonlight",
        label: "Moonlight", category: "Cinematic",
        description: "Cool pale steering light",
        lights: [{ label: "Moon (Back-Right)", angleDeg: 135, distanceM: 2.8, heightDeg: 50, strength: 1.1, color: "blue" }],
      },
    ];

    /* Gallery categories offered next to the rail's More button. */
    const LIGHTING_GALLERY_CATEGORIES = ["All", "Portrait", "Studio", "Cinematic", "Dramatic", "Utility"];
    const LIGHTING_PILLS = LIGHTING_PRESETS.slice(0, 7);
    const LIGHTING_RAIL_LIMIT = 7;

    function sceneLights() {
      state.scene_sections = state.scene_sections || {};
      const initialized = Array.isArray(state.scene_sections.lights);
      if (!Array.isArray(state.scene_sections.lights)) state.scene_sections.lights = [];
      const stored = state.scene_sections.light_angle;
      if (!initialized && !state.scene_sections.lights.length && Number.isFinite(stored)) {
        state.scene_sections.lights.push({ id: "light_1", angle: stored });
      }
      if (!initialized && !state.scene_sections.lights.length) {
        /* A lighting_setup row applied by a shot preset (without the
         * lighting panel) seeds the stage from its known layout. */
        const setupRow = (state.rows || []).find(function (row) {
          return row.category === "lighting_setup" && row.enabled !== false;
        });
        const setup = setupRow && LIGHTING_PRESETS.find(function (item) {
          return item.id === setupRow.preset_id;
        });
        if (setup) {
          state.scene_sections.lights = setup.lights.map(normalizeLight);
        } else {
          state.scene_sections.lights.push({ id: "light_1" });
        }
        /* Persist the seeded stage so a fresh node keeps its light. */
        persistedState = JSON.stringify(state);
        persist();
      }
      /* IMPORTANT: keep object identity. The stage/compass drag mutates
       * light objects in place, and repaints happen per mousemove — a
       * normalise-on-every-call would clone them and break drags. */
      state.scene_sections.lights = state.scene_sections.lights.map(function (light, index) {
        if (!light || typeof light !== "object") {
          return normalizeLight({}, index);
        }
        if (Number.isFinite(Number(light.distanceM)) || Number.isFinite(Number(light.angle))) {
          return light;
        }
        return normalizeLight(light, index);
      });
      return state.scene_sections.lights;
    }

    function syncLightRows() {
      const lights = sceneLights();
      state.rows = state.rows.filter(function (row) {
        return !(row.category === "lighting_direction" && String(row.preset_id || "").indexOf("custom.light_") === 0);
      });
      lights.forEach(function (light, index) {
        if (light.enabled === false) return;
        const phrase = lightPhrase(light);
        state.rows.push({
          id: uniqueRowId(state),
          category: "lighting_direction",
          preset_id: "custom.light_" + light.id,
          label: light.label + " \u2014 " + phrase,
          phrase: phrase,
          control_mode: "scalar",
          intensity: 0,
          strength: Number.isFinite(Number(light.strength)) ? Number(light.strength) : 1.5,
          enabled: true,
          aliases: [],
          verification: "general visual vocabulary",
          source: "custom",
        });
      });
    }

    function setLightState(light, changes) {
      if (Object.keys(changes).length) {
        Object.assign(light, lightingScene.physicalCoordinates(light));
        light.coordinatesEdited = true;
      }
      for (const field of ["groundDistanceM", "heightM"]) {
        if (Number.isFinite(Number(changes[field]))) light[field] = Math.max(0, Number(changes[field]));
      }
      if (Number.isFinite(Number(changes.angleDeg))) {
        light.angleDeg = ((Math.round(Number(changes.angleDeg)) % 360) + 360) % 360;
      }
      if (Number.isFinite(Number(changes.distanceM))) {
        light.distanceM = Math.max(
          LIGHT_METERS_MIN,
          Math.min(LIGHT_METERS_MAX, roundMetres(Number(changes.distanceM))),
        );
      }
      if (Number.isFinite(Number(changes.heightDeg))) {
        light.heightDeg = Math.max(0, Math.min(LIGHT_HEIGHT_MAX, Math.round(Number(changes.heightDeg))));
      }
      if (Number.isFinite(Number(changes.strength))) {
        light.strength = Math.max(0, Math.min(3, Math.round(Number(changes.strength) * 20) / 20));
      }
      if (changes.color !== undefined) light.color = String(changes.color || "");
      if (changes.label !== undefined) light.label = String(changes.label || "");
      if (changes.enabled !== undefined) light.enabled = !!changes.enabled;
      syncLightRows();
      markDirty();
      render();
    }

    function addLight() {
      const lights = sceneLights();
      lights.push(normalizeLight({ groundDistanceM: 1.5, heightM: 2, coordinatesEdited: true }, lights.length));
      syncLightRows();
      markDirty();
      render();
    }

    function removeLight(light) {
      const lights = sceneLights();
      state.scene_sections.lights = lights.filter(function (item) { return item !== light; });
      syncLightRows();
      markDirty();
      render();
    }

    function duplicateLight(light) {
      const lights = sceneLights();
      const copy = normalizeLight(light, lights.length);
      copy.id = "light_" + Date.now().toString(36);
      copy.label = light.label || "Light";
      lights.splice(lights.indexOf(light) + 1, 0, copy);
      syncLightRows();
      markDirty();
      render();
    }

    function applyLightingSetup(presetId) {
      const setup = LIGHTING_PRESETS.find(function (item) { return item.id === presetId; });
      if (!setup) return;
      state.scene_sections = state.scene_sections || {};
      state.scene_sections.lights = setup.lights.map(function (entry, index) {
        return normalizeLight(entry, index);
      });
      syncLightRows();
      const libPreset = library.find(function (item) { return item.id === presetId; });
      if (libPreset) {
        state.rows = state.rows.filter(function (row) { return row.category !== "lighting_setup"; });
        const row = presetToRow(libPreset, state);
        row.strength = 1.2;
        state.rows.push(row);
      }
      markDirty();
      render();
    }

    /* Compatibility wrapper: legacy chip paths call this. */
    function applyLightingSetupLayout(presetId) {
      applyLightingSetup(presetId);
    }

    function svgEl(tag, attrs) {
      const doc = typeof document !== "undefined" ? document : null;
      const mk = doc && typeof doc.createElementNS === "function"
        ? function (t) { return doc.createElementNS("http://www.w3.org/2000/svg", t); }
        : function (t) { return doc.createElement(t); };
      const node = mk(tag);
      for (const key of Object.keys(attrs || {})) {
        node.setAttribute(key, attrs[key]);
      }
      return node;
    }

    function svgText(x, y, text, className) {
      const node = svgEl("text", { x: String(x), y: String(y), class: className || "" });
      node.textContent = text;
      return node;
    }

    /* Stage geometry: the figure stands at the centre of a perspective
     * ellipse. angleDeg 0 (front) is toward the bottom of the stage. */
    /* ------------------------------------------------------------------
     * 3D stage (v2.6): a real perspective-projected scene rendered with
     * SVG so it stays dependency-free. The camera orbits the subject:
     * drag the background to rotate azimuth/elevation, use the wheel to
     * dolly, double-click to reset. Lights live in world space
     * (azimuth / distance / elevation) and each is drawn as a bulb,
     * a colour beam into the subject and an azimuth marker.
     * ------------------------------------------------------------------ */
    const STAGE = { w: 460, h: 300 };

    /* Live stage context shared between renderLightStage and the drag
     * handlers so a drag can repaint only the SVG (not the whole editor). */
    let stageDrag = null;

    function stageCamera() {
      const stored = (state.scene_sections || {}).stage_camera || {};
      const azim = Number.isFinite(Number(stored.azim)) ? Number(stored.azim) : 0;
      const elev = Math.max(8, Math.min(85, Number.isFinite(Number(stored.elev)) ? Number(stored.elev) : 25));
      const radius = Number.isFinite(Number(stored.radius)) ? Math.max(3.2, Math.min(11, Number(stored.radius))) : 6.4;
      return {
        azim: ((Math.round(azim) % 360) + 360) % 360,
        elev: Math.round(elev),
        radius: Math.abs(radius),
      };
    }

    function sub3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
    function cross3(a, b) {
      return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
      };
    }
    function normalize3(v) {
      const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
      return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    /* World space: the subject stands at the origin facing +z (toward the
     * default camera). x = right, y = up, z = front. */
    function lightWorldPos(light) {
      return lightingScene.lightPosition(light);
    }

    function stageProjector(camera) {
      const phi = camera.azim * Math.PI / 180;
      const lambda = camera.elev * Math.PI / 180;
      const R = camera.radius;
      const target = { x: 0, y: 1.02, z: 0 };
      const eye = {
        x: R * Math.cos(lambda) * Math.sin(phi),
        y: R * Math.sin(lambda) + target.y,
        z: R * Math.cos(lambda) * Math.cos(phi),
      };
      const fwd = normalize3(sub3(target, eye));
      const right = normalize3(cross3(fwd, { x: 0, y: 1, z: 0 }));
      const up = cross3(right, fwd);
      const k = (STAGE.h / 2) / Math.tan((46 * Math.PI) / 360);
      return function (p) {
        const v = sub3(p, eye);
        const cz = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
        const cx = v.x * right.x + v.y * right.y + v.z * right.z;
        const cy = v.x * up.x + v.y * up.y + v.z * up.z;
        return {
          x: STAGE.w / 2 + (cx * k) / cz,
          y: STAGE.h / 2 - (cy * k) / cz,
          z: cz,
        };
      };
    }

    /* The mannequin is drawn in metres (y-up) and transformed by the
     * projected figure size; it turns with the camera so its facing is
     * implied by the view and the beams. */
    function stageFigure(project, camera) {
      const feet = project({ x: 0, y: 0, z: 0 });
      const head = project({ x: 0, y: 1.78, z: 0 });
      const pxPerM = Math.max(8, (feet.y - head.y) / 1.78);
      let turnCos = Math.cos(camera.azim * Math.PI / 180);
      let flipX = false;
      if (turnCos < 0) { turnCos = -turnCos; flipX = true; }
      return {
        feet: feet,
        pxPerM: pxPerM,
        sx: pxPerM * Math.max(0.08, turnCos) * (flipX ? -1 : 1),
        sy: -pxPerM,
        shadowRy: pxPerM * 0.42 * Math.max(0.12, Math.sin(camera.elev * Math.PI / 180)),
      };
    }


    function renderLightStage() {
      const camera = (stageDrag && stageDrag.camera) || stageCamera();
      const project = stageProjector(camera);
      const lights = sceneLights();
      const showFloor = (state.scene_sections || {}).stage_ground !== "hidden";

      const svg = svgEl("svg", {
        viewBox: "0 0 " + STAGE.w + " " + STAGE.h,
        width: "100%",
        class: "krea2-v2-light-stage",
        "aria-label": "Lighting stage: drag the background to orbit the camera; drag a bulb to move a light; Alt+wheel to zoom; scroll to move through the workspace; double-click to reset the view",
      });
      const defs = svgEl("defs");
      const bgRadial = svgEl("radialGradient", { id: lightingSvgPrefix + "bg" });
      bgRadial.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#2b3440" }));
      bgRadial.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#14191f" }));
      defs.appendChild(bgRadial);
      const floorGrad = svgEl("radialGradient", { id: lightingSvgPrefix + "floor" });
      floorGrad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#39434f" }));
      floorGrad.appendChild(svgEl("stop", { offset: "78%", "stop-color": "#252d36" }));
      floorGrad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#1c232b" }));
      defs.appendChild(floorGrad);
      const glowF = svgEl("filter", { id: lightingSvgPrefix + "bloom", x: "-120%", y: "-120%", width: "340%", height: "340%" });
      glowF.appendChild(svgEl("feGaussianBlur", { stdDeviation: "4" }));
      defs.appendChild(glowF);
      const softF = svgEl("filter", { id: lightingSvgPrefix + "soft", x: "-60%", y: "-60%", width: "220%", height: "220%" });
      softF.appendChild(svgEl("feGaussianBlur", { stdDeviation: "2.2" }));
      defs.appendChild(softF);
      svg.appendChild(defs);

      svg.appendChild(svgEl("rect", {
        x: "0", y: "0", width: String(STAGE.w), height: String(STAGE.h),
        rx: "10", fill: "url(#" + lightingSvgPrefix + "bg)",
      }));

      const r2 = function (v) { return Math.round(v * 100) / 100; };
      const figure = stageFigure(project, camera);

      /* --- Ground: projected circles, ticks and N/E/S/W ---------------- */
      if (showFloor) {
        const circlePath = function (radius, points) {
          let d = "";
          for (let i = 0; i <= points; i += 1) {
            const a = (i / points) * Math.PI * 2;
            const p = project({ x: Math.sin(a) * radius, y: 0, z: Math.cos(a) * radius });
            d += (i === 0 ? "M" : "L") + r2(p.x) + " " + r2(p.y);
          }
          return d + " Z";
        };
        svg.appendChild(svgEl("path", { d: circlePath(4.1, 72), fill: "url(#" + lightingSvgPrefix + "floor)" }));
        for (let ring = 1; ring <= 4; ring += 1) {
          svg.appendChild(svgEl("path", {
            d: circlePath(ring, 60),
            class: "krea2-v2-lt-ring" + (ring === 4 ? " is-outer" : ""),
          }));
        }
        for (let i = 0; i < 12; i += 1) {
          const a = (i * Math.PI) / 6;
          const p1 = project({ x: Math.sin(a) * 3.72, y: 0, z: Math.cos(a) * 3.72 });
          const p2 = project({ x: Math.sin(a) * 4.1, y: 0, z: Math.cos(a) * 4.1 });
          svg.appendChild(svgEl("line", {
            x1: r2(p1.x), y1: r2(p1.y), x2: r2(p2.x), y2: r2(p2.y),
            class: "krea2-v2-lt-tick",
          }));
        }
      }
      for (const [label, x, z] of [["Subject right", -2.7, 0], ["Subject left", 2.7, 0], ["Back", 0, -2.7], ["Front", 0, 2.7]]) {
        const p = project({ x, y: .02, z });
        svg.appendChild(svgText(r2(p.x), r2(p.y), label, "krea2-v2-lt-dir"));
      }

      /* --- Lights: bulbs + beams sorted around the figure's depth ------ */
      const target = { x: 0, y: 1.12, z: 0 };
      const figDepth = project({ x: 0, y: 1.05, z: 0 }).z;
      const iconsets = [];
      lights.forEach(function (light, index) {
        const world = lightWorldPos(light);
        iconsets.push({
          light: light,
          index: index,
          world: world,
          p: project(world),
          depth: project(world).z,
          on: light.enabled !== false && Number(light.strength) !== 0,
          hex: lightHex(light.color),
          strength: Number.isFinite(Number(light.strength)) ? Number(light.strength) : 1.5,
        });
      });
      iconsets.sort(function (a, b) { return a.depth - b.depth; });

      const bulbRegistry = [];
      const drawLight = function (entry) {
        const p = entry.p;
        const g = svgEl("g", { class: "krea2-v2-lt-light" });
        if (entry.on) {
          /* Screen-space beam quad from the bulb to the torso. Widths
           * scale with the projected figure so the beam looks anchored. */
          const tp = project(target);
          const dx = tp.x - p.x;
          const dy = tp.y - p.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const wP = Math.max(2, figure.pxPerM * 0.05);
          const wT = Math.max(9, figure.pxPerM * 0.3);
          const alpha = Math.min(0.55, 0.16 + entry.strength * 0.1);
          g.appendChild(svgEl("path", {
            d: "M" + r2(p.x + nx * wP) + " " + r2(p.y + ny * wP)
              + " L" + r2(tp.x + nx * wT) + " " + r2(tp.y + ny * wT)
              + " L" + r2(tp.x - nx * wT) + " " + r2(tp.y - ny * wT)
              + " L" + r2(p.x - nx * wP) + " " + r2(p.y - ny * wP) + " Z",
            class: "krea2-v2-lt-beam",
            style: "fill: " + entry.hex + "; opacity: " + alpha.toFixed(3) + ";",
          }));
          g.appendChild(svgEl("ellipse", {
            cx: r2(p.x), cy: r2(p.y),
            rx: r2(figure.pxPerM * 0.42), ry: r2(figure.pxPerM * 0.19),
            class: "krea2-v2-lt-glow",
            filter: "url(#" + lightingSvgPrefix + "bloom)",
            style: "fill: " + entry.hex + "; opacity: " + Math.min(0.75, 0.16 + entry.strength * 0.15) + ";",
          }));
          /* Azimuth marker: ground point straight beneath the bulb. */
          const gp = project({ x: entry.world.x, y: 0.01, z: entry.world.z });
          g.appendChild(svgEl("line", {
            x1: r2(gp.x), y1: r2(gp.y), x2: r2(p.x), y2: r2(p.y),
            class: "krea2-v2-lt-centerline",
            style: "stroke: " + entry.hex + "; opacity: 0.28;",
          }));
        }
        /* Lightbulb: coloured when on; inert grey when off (no beam). */
        const bulb = svgEl("g", { class: "krea2-v2-lt-bulb", "data-light-index": String(entry.index) });
        const bulbColour = entry.on ? entry.hex : "#525a63";
        const r = Math.max(4.2, figure.pxPerM * 0.14);
        bulb.appendChild(svgEl("circle", { cx: r2(p.x), cy: r2(p.y), r: r2(r), class: "krea2-v2-lt-bulb-glass", style: "fill: " + bulbColour + ";" }));
        bulb.appendChild(svgEl("rect", { x: r2(p.x - r * 0.45), y: r2(p.y + r * 0.85), width: r2(r * 0.9), height: r2(r * 0.72), rx: r2(r * 0.2), class: "krea2-v2-lt-bulb-base", style: "fill: " + bulbColour + ";" }));
        bulb.appendChild(svgEl("line", { x1: r2(p.x - r * 0.3), y1: r2(p.y + r * 1.62), x2: r2(p.x + r * 0.3), y2: r2(p.y + r * 1.62), stroke: "#c3cad4", "stroke-width": "1.4", "stroke-linecap": "round" }));
        if (entry.on) {
          bulb.appendChild(svgEl("circle", { cx: r2(p.x), cy: r2(p.y - r * 0.15), r: r2(r * 0.52), class: "krea2-v2-lt-bulb-filament", fill: "#eef2f7", style: "filter: url(#" + lightingSvgPrefix + "soft);" }));
        }
        g.appendChild(bulb);
        bulbRegistry.push({ node: bulb, entry: entry });
        const badge = svgEl("g", { class: "krea2-v2-lt-num" });
        badge.appendChild(svgEl("circle", { cx: r2(p.x + r + 9), cy: r2(p.y - r - 9), r: "8", class: "krea2-v2-lt-num-ring" }));
        g.appendChild(badge);
        g.appendChild(svgText(r2(p.x + r + 9), r2(p.y - r - 5.5), String(entry.index + 1), "krea2-v2-lt-num-text"));
        return g;
      };

      const behind = iconsets.filter(function (e) { return e.depth >= figDepth; });
      const inFront = iconsets.filter(function (e) { return e.depth < figDepth; });
      behind.forEach(function (entry) { svg.appendChild(drawLight(entry)); });

      /* --- The mannequin (turns with the camera) ------------------------ */
      const figureEl = svgEl("g", { class: "krea2-v2-lt-figure", "aria-label": "Shaded three dimensional portrait bust facing Front" });
      for (const triangle of lightingScene.shadedBust(project, lights, lightHex)) {
        figureEl.appendChild(svgEl("polygon", {
          points: triangle.points.map(point => r2(point.x) + "," + r2(point.y)).join(" "),
          fill: triangle.fill, stroke: triangle.fill, "stroke-width": ".25",
          "pointer-events": "none",
        }));
      }
      svg.appendChild(figureEl);

      inFront.forEach(function (entry) { svg.appendChild(drawLight(entry)); });

      /* --- Stage context: live camera + repaint-only-refresh ------------ */
      stageDrag = {
        svg: svg,
        camera: camera,
        host: (stageDrag && stageDrag.host) || null,
        viewLabel: (stageDrag && stageDrag.viewLabel) || null,
        refresh: function () {
          if (!stageDrag || !stageDrag.camera) return;
          const host = stageDrag.host;
          if (!host) return;
          host.innerHTML = "";
          host.appendChild(renderLightStage());
          const label = stageDrag.viewLabel;
          if (label) {
            label.textContent = "Azimuth " + Math.round(((stageDrag.camera.azim % 360) + 360) % 360)
              + "\u00b0 \u00b7 Elevation " + Math.round(stageDrag.camera.elev) + "\u00b0 \u2014 drag to orbit \u00b7 Alt+wheel to zoom \u00b7 double-click to reset";
          }
        },
      };

      const commitCamera = function () {
        if (!stageDrag || !stageDrag.camera) return;
        state.scene_sections = state.scene_sections || {};
        state.scene_sections.stage_camera = {
          azim: ((Math.round(stageDrag.camera.azim) % 360) + 360) % 360,
          elev: Math.round(stageDrag.camera.elev),
          radius: Math.round(stageDrag.camera.radius * 10) / 10,
        };
        persist();
        render();
      };

      /* Background drag: orbit the camera. */
      const orbitStart = function (event) {
        if (event.button !== 0) return;
        const classes = (typeof event.target.getAttribute === "function")
          ? String(event.target.getAttribute("class") || "")
          : String(event.target.className || "");
        if (classes.indexOf("krea2-v2-lt-bulb") !== -1) return;
        event.preventDefault();
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        const onMove = function (moveEvent) {
          stageDrag.camera.azim -= ((moveEvent.movementX || 0) / 0.44) * 0.22;
          stageDrag.camera.elev = Math.max(8, Math.min(85, stageDrag.camera.elev + ((moveEvent.movementY || 0) / 0.44) * 0.15));
          stageDrag.refresh();
        };
        const onUp = function () {
          stopDrag();
          commitCamera();
        };
        const stopDrag = trackDocumentDrag(onMove, onUp);
      };
      svg.addEventListener("mousedown", orbitStart);
      svg.addEventListener("dblclick", function (event) {
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        state.scene_sections = state.scene_sections || {};
        state.scene_sections.stage_camera = { azim: 0, elev: 25, radius: 6.4 };
        stageDrag = null;
        persist();
        render();
      });
      svg.addEventListener("wheel", function (event) {
        if (!event.altKey) return;
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        stageDrag.camera.radius = Math.max(3.2, Math.min(11, stageDrag.camera.radius * (1 + (event.deltaY || 0) * 0.0012)));
        state.scene_sections.stage_camera = cloneJson(stageDrag.camera);
        persist();
        stageDrag.refresh();
      }, { passive: false });

      /* Bulb dragging: un-project the pointer back to the ground plane. */
      /* Bulb dragging: un-project the pointer back to the ground plane and
       * move the light's azimuth/distance. */
      const dragBulb = function (event, entry) {
        const bounds = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
        const sx = bounds && bounds.width ? STAGE.w / bounds.width : 1;
        const sy = bounds && bounds.height ? STAGE.h / bounds.height : 1;
        const mx = (event.clientX - (bounds ? bounds.left : 0)) * sx;
        const my = (event.clientY - (bounds ? bounds.top : 0)) * sy;
        const pz = 6;
        const focal = (STAGE.h / 2) / Math.tan((46 * Math.PI) / 360);
        const px = ((mx - STAGE.w / 2) * pz) / focal;
        const py = ((STAGE.h / 2 - my) * pz) / focal;
        const phi = stageDrag.camera.azim * Math.PI / 180;
        const lambda = stageDrag.camera.elev * Math.PI / 180;
        const R = stageDrag.camera.radius;
        const tgt = { x: 0, y: 1.02, z: 0 };
        const eye = {
          x: R * Math.cos(lambda) * Math.sin(phi),
          y: R * Math.sin(lambda) + tgt.y,
          z: R * Math.cos(lambda) * Math.cos(phi),
        };
        const fwd = normalize3(sub3(tgt, eye));
        const right = normalize3(cross3(fwd, { x: 0, y: 1, z: 0 }));
        const up = cross3(right, fwd);
        const dir = normalize3({
          x: fwd.x * pz + right.x * px + up.x * py,
          y: fwd.y * pz + right.y * px + up.y * py,
          z: fwd.z * pz + right.z * px + up.z * py,
        });
        if (dir.y >= -0.001) return;
        const height = lightingScene.physicalCoordinates(entry.light).heightM;
        const t = (height - eye.y) / dir.y;
        if (t <= 0) return;
        const gx = eye.x + t * dir.x;
        const gz = eye.z + t * dir.z;
        const horiz = Math.sqrt(gx * gx + gz * gz);
        if (horiz < 0.05) return;
        entry.light.angleDeg = ((Math.round(Math.atan2(gx, gz) * 180 / Math.PI) % 360) + 360) % 360;
        entry.light.groundDistanceM = horiz;
        entry.light.heightM = height;
        entry.light.coordinatesEdited = true;
        stageDrag.refresh();
      };

      for (const entry of bulbRegistry) {
        entry.node.addEventListener("mousedown", function (event) {
          if (event.button !== 0) return;
          event.preventDefault();
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          highlightLightCard(entry.entry.index, true);
          dragBulb(event, entry.entry);
          const onMove = function (moveEvent) { dragBulb(moveEvent, entry.entry); };
          const onUp = function () {
            stopDrag();
            syncLightRows();
            markDirty();
            render();
          };
          const stopDrag = trackDocumentDrag(onMove, onUp);
        });
        entry.node.addEventListener("mouseenter", function () {
          highlightLightCard(entry.entry.index, true);
        });
        entry.node.addEventListener("mouseleave", function () {
          highlightLightCard(entry.entry.index, false);
        });
      }
      return svg;
    }
    /* Cross-highlight: hovering a light in one spot highlights it in the
     * other (stage bulb <-> control card). */
    function highlightLightCard(index, on) {
      const wrap = document.querySelector(".krea2-v2-lighting-wrap");
      if (!wrap) return;
      const cards = wrap.querySelectorAll('.krea2-v2-lt-card[data-light-index="' + index + '"]');
      for (const card of cards) card.classList.toggle("is-highlighted", on);
      const bulbs = wrap.querySelectorAll('.krea2-v2-lt-bulb[data-light-index="' + index + '"]');
      for (const bulb of bulbs) bulb.classList.toggle("is-highlighted", on);
    }
    function highlightLightRow(index, on) { highlightLightCard(index, on); }
    function highlightLightDot(index, on) { highlightLightCard(index, on); }

    /* Dial: a small circle with a needle pointing at the light's azimuth
     * (0° up, 90° right, 180° down, 270° left). Dragging rotates it. */
    function renderAngleDial(light) {
      const wrapOuter = el("div", { class: "krea2-v2-lt-dial", title: "Drag around the dial to aim the light" });
      const R = 17;
      const svg = svgEl("svg", {
        viewBox: "0 0 40 40",
        width: "40", height: "40",
        class: "krea2-v2-lt-dial-svg",
        "aria-label": "Light angle dial",
      });
      svg.appendChild(svgEl("circle", { cx: "20", cy: "20", r: "16", class: "krea2-v2-lt-dial-ring" }));
      const needle = svgEl("line", { x1: "20", y1: "20", x2: "20", y2: "7", class: "krea2-v2-lt-dial-needle" });
      const dot = svgEl("circle", { cx: "20", cy: "20", r: "1.6", class: "krea2-v2-lt-dial-pivot" });
      svg.appendChild(needle);
      svg.appendChild(dot);
      wrapOuter.appendChild(svg);

      function paint() {
        const theta = (Number(light.angleDeg) || 0) * Math.PI / 180;
        const nx = 20 + Math.sin(theta) * 11;
        const ny = 20 - Math.cos(theta) * 11;
        needle.setAttribute("x2", String(nx));
        needle.setAttribute("y2", String(ny));
      }
      paint();

      const doDrag = function (event) {
        const bounds = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
        const cx = bounds ? bounds.left + bounds.width / 2 : 20;
        const cy = bounds ? bounds.top + bounds.height / 2 : 20;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        if (Math.sqrt(dx * dx + dy * dy) < 3) return;
        const theta = Math.atan2(dx, -dy);
        light.angleDeg = ((Math.round(theta * 180 / Math.PI) % 360) + 360) % 360;
        paint();
      };
      svg.addEventListener("mousedown", function (event) {
        event.preventDefault();
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        doDrag(event);
        const onMove = function (moveEvent) { doDrag(moveEvent); };
        const onUp = function () {
          stopDrag();
          setLightState(light, { angleDeg: light.angleDeg });
        };
        const stopDrag = trackDocumentDrag(onMove, onUp);
      });
      return wrapOuter;
    }

    function renderLightControlRow(iconName, labelText, controlEl, valueEl) {
      return el("div", { class: "krea2-v2-lt-row" }, [
        el("span", { class: "krea2-v2-lt-row-icon" }, icon(iconName, { width: "12", height: "12" })),
        el("span", { class: "krea2-v2-lt-row-label" }, labelText),
        controlEl,
        valueEl || "",
      ]);
    }

    /* Light-card numeric pill: [− | value | +] sharing the concept pill
     * stepper (hold-to-repeat, vertical drag, click to type). Steps are
     * physical (0.1 m / 0.1 intensity / 15°); typing stays exact. */
    function makeLightPill(opts) {
      const stepper = makePresetStepper(Object.assign({ snapTyped: false }, opts));
      return el("div", { class: "krea2-pill krea2-pill-light" }, [stepper.minus, stepper.valueEl, stepper.plus]);
    }

    function lightNumberFormat(value) {
      return String(Math.round(Number(value) * 100) / 100);
    }

    function renderLightCards() {
      const cards = el("div", { class: "krea2-v2-lt-cards" });
      sceneLights().forEach(function (light, index) {
        const card = el("div", {
          class: "krea2-v2-lt-card" + (light.enabled === false ? " is-disabled" : ""),
          dataset: { lightIndex: String(index) },
        });
        card.addEventListener("mouseenter", function () { highlightLightCard(index, true); });
        card.addEventListener("mouseleave", function () { highlightLightCard(index, false); });

        const switchBtn = el("button", {
          type: "button",
          class: "krea2-v2-lt-switch" + (light.enabled !== false ? " is-on" : ""),
          role: "switch",
          "aria-checked": light.enabled === false ? "false" : "true",
          title: light.enabled === false ? "Enable this light" : "Disable this light",
          "aria-label": "Toggle " + light.label,
          onClick: function () { setLightState(light, { enabled: light.enabled === false }); },
        }, icon("power", { width: "11", height: "11" }));
        const copyBtn = el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn",
          title: "Duplicate this light",
          "aria-label": "Duplicate " + light.label,
          onClick: function () { duplicateLight(light); },
        }, icon("copy", { width: "11", height: "11" }));
        const trashBtn = el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-danger",
          title: "Remove this light",
          "aria-label": "Remove " + light.label,
          onClick: function () { removeLight(light); },
        }, icon("trash", { width: "11", height: "11" }));

        const nameInput = el("input", {
          type: "text",
          class: "krea2-compact-input krea2-v2-lt-name",
          value: light.label,
          "aria-label": "Light " + (index + 1) + " name",
          onInput: function (event) {
            if (card.classList.contains("is-typing")) card.classList.remove("is-typing");
          },
          onChange: function (event) {
            const label = String(event.target.value || "").trim() || ("Light " + (index + 1));
            event.target.value = label;
            setLightState(light, { label: label });
          },
        });
        const head = el("div", { class: "krea2-v2-lt-card-head" }, [
          el("span", {
            class: "krea2-v2-lt-dot",
            style: { backgroundColor: lightHex(light.color) },
          }),
          nameInput,
          switchBtn,
          copyBtn,
          trashBtn,
        ]);
        card.appendChild(head);

        const units = state.ui_preferences.measurement_unit === "ft" ? "ft" : "m";
        const coordinates = lightingScene.physicalCoordinates(light);
        const distance = lightingScene.displayDistance(coordinates.groundDistanceM, units);
        const height = lightingScene.displayDistance(coordinates.heightM, units);
        /* Numeric entry accepts any distance; the stage clamps to its own
         * bounds. Units only affect display. */
        const distancePill = makeLightPill({
          value: distance,
          step: 0.1, min: 0, max: 100, typedMin: 0, typedMax: 100,
          format: lightNumberFormat,
          label: "Light " + (index + 1) + " horizontal distance in " + units,
          onCommit: function (value) {
            setLightState(light, { groundDistanceM: lightingScene.metresFromDisplay(value, units) });
          },
        });
        card.appendChild(renderLightControlRow("ruler", "Ground distance (" + units + ")", distancePill));

        /* Angle: dial plus degree pill. */
        const anglePill = makeLightPill({
          value: Math.round(light.angleDeg),
          step: 15, min: -360, max: 360, typedMin: -360, typedMax: 360,
          format: value => String(Math.round(value)) + "\u00b0",
          label: "Light " + (index + 1) + " azimuth in degrees",
          onCommit: value => setLightState(light, { angleDeg: Number(value) }),
        });
        card.appendChild(renderLightControlRow("dial", "Azimuth (degrees)", renderAngleDial(light), anglePill));

        const heightPill = makeLightPill({
          value: height,
          step: 0.1, min: 0, max: 100, typedMin: 0, typedMax: 100,
          format: lightNumberFormat,
          label: "Light " + (index + 1) + " height above ground in " + units,
          onCommit: value => setLightState(light, { heightM: lightingScene.metresFromDisplay(value, units) }),
        });
        card.appendChild(renderLightControlRow("height", "Height above ground (" + units + ")", heightPill));

        /* Colour: swatch button + hex readout. */
        const colourBtn = el("button", {
          type: "button",
          class: "krea2-v2-color-btn krea2-v2-lt-colour-btn has-color",
          style: { backgroundColor: lightHex(light.color) },
          title: String(light.color || "white") + " light \u2014 click to pick a colour",
          "aria-label": "Light " + (index + 1) + " colour",
          onClick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            openColorPopup(colourBtn, LIGHT_PALETTE, String(light.color || ""), "Light " + (index + 1) + " colour", function (name) {
              setLightState(light, { color: name });
            });
          },
        }, icon("dot", { width: "13", height: "13", color: "rgba(0,0,0,0.4)" }));
        const hexText = el("span", { class: "krea2-v2-lt-hex" }, lightHex(light.color).toUpperCase());
        card.appendChild(renderLightControlRow("palette", "Colour", colourBtn, hexText));

        /* Intensity. */
        const intensityPill = makeLightPill({
          value: light.strength,
          step: 0.1, min: 0, max: 3, typedMin: 0, typedMax: 3,
          format: lightNumberFormat,
          label: "Light " + (index + 1) + " intensity",
          onCommit: function (value) {
            setLightState(light, { strength: Math.round(value * 100) / 100 });
          },
        });
        card.appendChild(renderLightControlRow("sun", "Intensity", intensityPill));

        cards.appendChild(card);
      });
      return cards;
    }

    /* Lighting setup rail: pills for the first setups + a More button that
     * opens the gallery popup with live-rendered preview thumbs. */
    function renderLightingSetupRail() {
      const rail = el("div", { class: "krea2-v2-lt-rail" });
      const activeSetupId = (state.rows || []).filter(function (row) {
        return row.category === "lighting_setup" && row.enabled !== false;
      }).map(function (row) { return row.preset_id; })[0] || "";
      for (const setup of LIGHTING_PILLS) {
        rail.appendChild(el("button", {
          type: "button",
          class: "krea2-v2-lt-pill" + (setup.id === activeSetupId ? " is-active" : ""),
          title: setup.description,
          onClick: function () { applyLightingSetup(setup.id); },
        }, [icon("bulb", { width: "11", height: "11" }), el("span", null, setup.label)]));
      }
      rail.appendChild(el("button", {
        type: "button",
        class: "krea2-v2-lt-pill krea2-v2-lt-more",
        title: "Browse every lighting preset",
        onClick: function () { openLightingPresetGallery(); },
      }, [icon("image", { width: "11", height: "11" }), el("span", null, "More")]));
      return rail;
    }

    /* Gallery thumbnail: a tiny bust rendered from the setup's lights so
     * each preset shows what its result will look like. */
    function renderLightingThumb(setup) {
      const w = 120, h = 76;
      const svg = svgEl("svg", {
        viewBox: "0 0 " + w + " " + h,
        width: String(w), height: String(h),
        class: "krea2-v2-lt-thumb",
        "aria-label": setup.label + " lighting preview",
      });
      svg.appendChild(svgEl("rect", { x: "0", y: "0", width: String(w), height: String(h), rx: "6", fill: "#232b34" }));
      const cx = w / 2, headX = cx, headY = 34;
      svg.appendChild(svgEl("circle", { cx: headX, cy: headY, r: "12", fill: "#3c4650" }));
      svg.appendChild(svgEl("path", {
        d: "M" + (headX - 22) + " " + h + " C" + (headX - 20) + " " + (headY + 22) + " " + (headX + 20) + " " + (headY + 22) + " " + (headX + 22) + " " + h + " Z",
        fill: "#3c4650",
      }));
      const lights = setup.lights || [];
      const maxD = Math.max(1, (LIGHT_METERS_MAX));
      const r2 = function (value) {
        return Math.round(Number(value) * 100) / 100;
      };
      lights.forEach(function (entry, index) {
        const theta = (Number(entry.angleDeg) || 0) * Math.PI / 180;
        const frac = (Number(entry.distanceM) || 1.5) / maxD;
        const len = 18 + frac * 22;
        const x1 = headX + Math.sin(theta) * len;
        const y1 = headY + Math.cos(theta) * len * 0.8 - (Number(entry.heightDeg) || 20) / 90 * 16;
        const hex = lightHex(entry.color);
        const alpha = Math.min(0.55, 0.2 + (Number(entry.strength) || 1.2) * 0.12);
        svg.appendChild(svgEl("path", {
          d: "M" + r2(x1) + " " + r2(y1) + " C" + r2(x1 * 0.6 + headX * 0.4) + " " + r2(y1 * 0.6 + headY * 0.4) + " "
            + r2(headX - 8) + " " + r2(headY + 8) + " " + r2(headX - 8) + " " + r2(headY + 8)
            + " L" + r2(headX + 8) + " " + r2(headY + 8)
            + " C" + r2(headX * 0.6 + x1 * 0.4) + " " + r2(headY * 0.6 + y1 * 0.4)
            + " " + r2(headX * 0.78 + x1 * 0.22) + " " + r2(headY * 0.78 + y1 * 0.22)
            + " " + r2(x1) + " " + r2(y1) + " Z",
          style: "fill: " + hex + "; opacity: " + alpha.toFixed(3) + ";",
        }));
        svg.appendChild(svgEl("circle", { cx: r2(x1), cy: r2(y1), r: "4", fill: hex }));
      });
      return svg;
    }

    function openLightingPresetGallery() {
      const existing = document.querySelector(".krea2-v2-lt-gallery");
      if (existing) existing.remove();
      const overlay = el("div", { class: "krea2-v2-lt-gallery" });
      const box = el("div", { class: "krea2-v2-lt-gallery-box" });

      const searchInput = el("input", {
        type: "text",
        class: "krea2-compact-input krea2-v2-lt-gallery-search",
        placeholder: "Search presets...",
        "aria-label": "Search lighting presets",
        onInput: function () { paint(category || "All", searchInput.value.trim()); },
      });
      const saveBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-v2-lt-gallery-save",
        title: "Store the current stage as a reusable lighting preset",
        onClick: function () {
          saveLightingSetup();
          overlay.remove();
        },
      }, [icon("download", { width: "11", height: "11" }), el("span", null, "Save Current Setup as Preset")]);
      const closeBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn",
        title: "Close",
        "aria-label": "Close",
        onClick: function () { overlay.remove(); },
      }, icon("close", { width: "12", height: "12" }));
      box.appendChild(el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "Choose a Lighting Preset"),
        el("span", { class: "krea2-structured-spacer" }),
        saveBtn,
        closeBtn,
      ]));
      box.appendChild(el("div", { class: "krea2-v2-lt-gallery-tools" }, [searchInput]));

      const allSetups = LIGHTING_PRESETS;
      const savedSetups = savedPresets.filter(function (preset) {
        return preset.scope === "lighting" && Array.isArray(preset.lights);
      });
      let category = "All";
      let currentSelection = null;

      const categoriesHost = el("div", { class: "krea2-v2-lt-gallery-cats" });
      const cardsHost = el("div", { class: "krea2-v2-lt-gallery-cards" });
      box.appendChild(categoriesHost);
      box.appendChild(cardsHost);
      const applyRow = el("div", { class: "krea2-v2-lt-gallery-foot" }, [
        el("span", { class: "krea2-v2-lt-gallery-tip" },
          "Tip: You can fine-tune any preset after applying it."),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn",
          onClick: function () { overlay.remove(); },
        }, "Cancel"),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-v2-lt-gallery-apply",
          onClick: function () {
            if (!currentSelection) return;
            if (currentSelection.scope === "lighting") {
              state.scene_sections = state.scene_sections || {};
              state.scene_sections.lights = currentSelection.lights.map(normalizeLight);
              state.rows = state.rows.filter(function (row) { return row.category !== "lighting_setup"; });
              syncLightRows();
              markDirty();
              render();
            } else {
              applyLightingSetup(currentSelection.id);
            }
            overlay.remove();
            showToast("\u201c" + currentSelection.label + "\u201d lighting applied", "info");
          },
        }, "Apply Preset"),
      ]);
      box.appendChild(applyRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) overlay.remove();
      });

      function paint(cat, query) {
        category = cat;
        categoriesHost.innerHTML = "";
        for (const name of LIGHTING_GALLERY_CATEGORIES) {
          categoriesHost.appendChild(el("button", {
            type: "button",
            class: "krea2-v2-lt-gallery-cat" + (name === cat ? " is-active" : ""),
            onClick: function () { paint(name, searchInput.value.trim()); },
          }, name));
        }
        cardsHost.innerHTML = "";
        const needle = String(query || "").toLowerCase();
        const items = allSetups.concat(savedSetups.map(function (preset) {
          return {
            id: preset.id,
            label: preset.label,
            category: "Saved",
            description: "Your saved lighting setup",
            scope: "lighting",
            lights: preset.lights,
            saved: true,
          };
        }));
        for (const setup of items) {
          if (cat !== "All" && setup.category !== cat) continue;
          if (needle && String(setup.label + " " + setup.description).toLowerCase().indexOf(needle) < 0) continue;
          const card = el("button", {
            type: "button",
            class: "krea2-v2-lt-gallery-card",
            onClick: function () {
              currentSelection = setup;
              cardsHost.querySelectorAll(".krea2-v2-lt-gallery-card").forEach(function (el) {
                if (el !== card) el.classList.remove("is-selected");
              });
              card.classList.add("is-selected");
            },
          }, [
            renderLightingThumb(setup),
            el("div", { class: "krea2-v2-lt-gallery-card-meta" }, [
              el("strong", null, setup.label),
              el("span", null, setup.description || ""),
            ]),
            el("span", { class: "krea2-v2-lt-gallery-check" }, currentSelection === setup ? icon("check", { width: "12", height: "12" }) : ""),
          ]);
          cardsHost.appendChild(card);
        }
      }
      paint("All", "");
    }

    /* Save the current stage as a lighting preset (scope "lighting"). */
    function saveLightingSetup() { createWorkspacePreset("lighting"); }

    /* Lighting colour palette button (used inside the light cards). */
    function renderLightColorButton(light, index) {
      const current = String(light.color || "");
      const btn = el("button", {
        type: "button",
        class: "krea2-v2-color-btn" + (current ? " has-color" : ""),
        style: current ? { background: colourHexFor(current, LIGHT_PALETTE) } : {},
        title: (current || "white") + " light \u2014 click to pick a colour",
        "aria-label": "Light " + (index + 1) + " colour: " + (current || "white"),
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          openColorPopup(btn, LIGHT_PALETTE, current, "Light " + (index + 1) + " colour", function (name) {
            setLightState(light, { color: name });
          });
        },
      }, current ? "" : icon("dot", { width: "11", height: "11", color: "#8a8f98" }));
      return btn;
    }

    /* ------------------------------------------------------------------
     * Camera subsection: shot-distance slider (wide <-> tight), angle,
     * lens focal length, aperture. The old Close-up / Medium / Wide /
     * Establishing chips are gone — the shot-distance slider replaces
     * them with a single concept that moves the camera toward or away
     * from the subject.
     * ------------------------------------------------------------------ */
    const SHOT_DISTANCE_ID = "custom.shot_distance";

    function shotDistanceValue() {
      if (!state.scene_sections || state.scene_sections.shot_distance === undefined) return 0;
      const v = Number(state.scene_sections.shot_distance);
      return Number.isFinite(v) ? Math.max(-100, Math.min(100, Math.round(v))) : 0;
    }

    function shotDistanceBand(value) {
      if (value <= -75) return "Very wide";
      if (value <= -25) return "Wide";
      if (value < 25) return "Standard";
      if (value < 75) return "Close-up";
      return "Very close-up";
    }

    function syncShotDistanceRow() {
      state.rows = state.rows.filter(function (row) {
        return row.preset_id !== SHOT_DISTANCE_ID;
      });
      const value = shotDistanceValue();
      if (!value) return;
      const tight = value > 0;
      const strength = Math.round((value / 100) * 3 * 4) / 4;
      state.rows.push({
        id: uniqueRowId(state),
        category: "perspective",
        preset_id: SHOT_DISTANCE_ID,
        label: "Shot distance \u2014 " + shotDistanceBand(value),
        phrase: tight
          ? "face close to the lens"
          : "distant subject framed deep within the environment",
        positive_phrase: "face close to the lens",
        negative_phrase: "distant subject framed deep within the environment",
        neutral_phrase: "",
        control_mode: "bipolar",
        intensity: value,
        strength: strength,
        enabled: true,
        aliases: [],
        verification: "general visual vocabulary",
        source: "custom",
      });
    }

    function renderShotDistanceRow() {
      const value = shotDistanceValue();
      const bandValue = el("span", { class: "krea2-v2-lens-value krea2-v2-shot-distance-value" },
        shotDistanceBand(value) + (value ? "" : "\u00b7 default"));
      const slider = el("input", {
        type: "range",
        class: "krea2-v2-shot-distance-slider",
        min: "-100",
        max: "100",
        step: "5",
        value: String(value),
        "aria-label": "Shot distance: wide on the left, tight on the right",
        onInput: function (event) {
          bandValue.textContent = shotDistanceBand(Math.round(Number(event.target.value)));
        },
        onChange: function (event) {
          const next = Math.round(Number(event.target.value));
          state.scene_sections = state.scene_sections || {};
          state.scene_sections.shot_distance = next;
          syncShotDistanceRow();
          markDirty();
          render();
        },
      });
      const wide = el("span", { class: "krea2-v2-shot-distance-end" }, "Wide");
      const tight = el("span", { class: "krea2-v2-shot-distance-end" }, "Tight");
      const clearBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-field-clear",
        title: "Reset the shot distance (no shot-distance concept)",
        "aria-label": "Reset the shot distance",
        onClick: function () {
          state.scene_sections = state.scene_sections || {};
          state.scene_sections.shot_distance = 0;
          syncShotDistanceRow();
          markDirty();
          render();
        },
      }, icon("close", { width: "12", height: "12" }));
      const row = el("div", { class: "krea2-v2-chip-row krea2-v2-shot-distance-row" });
      row.append(
        el("span", { class: "krea2-v2-field-label" }, "Shot distance"),
        el("span", { class: "krea2-v2-shot-distance-scale" }, [wide, slider, tight]),
        bandValue,
        clearBtn,
      );
      return row;
    }

    function renderCameraContent() {
      const wrap = el("div", { class: "krea2-v2-subsection-content" });
      wrap.appendChild(renderShotDistanceRow());
      wrap.appendChild(renderChipRow("Angle", "angle", SCENE_CHIPS.angle));
      wrap.appendChild(renderLensRow());
      wrap.appendChild(renderChipRow("Aperture", "aperture", SCENE_CHIPS.aperture));
      return wrap;
    }

    function renderLightingContent() {
      const wrap = el("div", { class: "krea2-v2-subsection-content krea2-v2-lighting-wrap" });
      /* Panel header: bulb + title + subtitle + Save Lighting Setup. */
      const head = el("div", { class: "krea2-v2-lt-head" }, [
        el("span", { class: "krea2-v2-lt-head-icon" }, icon("bulb", { width: "16", height: "16" })),
        el("div", { class: "krea2-v2-lt-head-text" }, [
          el("strong", null, "Lighting"),
          el("span", null, "Position and control lights to shape your scene."),
        ]),
        el("span", { class: "krea2-structured-spacer" }),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-v2-lt-save",
          title: "Save the current lighting setup as a reusable preset",
          "aria-label": "Save the current lighting setup as a reusable preset",
          onClick: function () { saveLightingSetup(); },
        }, icon("save", { width: "11", height: "11" })),
      ]);
      wrap.appendChild(head);
      /* Preset rail. */
      wrap.appendChild(renderLightingSetupRail());
      /* Stage + cards. */
      const row = el("div", { class: "krea2-v2-lt-main" });
      const stageCol = el("div", { class: "krea2-v2-lt-stage-col" });
      stageCol.appendChild(renderLightStage());
      if (stageDrag) stageDrag.host = stageCol;
      row.appendChild(stageCol);
      row.appendChild(renderLightCards());
      wrap.appendChild(row);
      const stageFoot = el("div", { class: "krea2-v2-lt-stage-foot" });
      const ground = el("select", {
        class: "krea2-compact-select",
        "aria-label": "Ground plane",
        onChange: function (event) {
          state.scene_sections = state.scene_sections || {};
          state.scene_sections.stage_ground = event.target.value;
          markDirty();
          render();
        },
      });
      ground.appendChild(el("option", { value: "ground" }, "Ground"));
      ground.appendChild(el("option", { value: "hidden" }, "Hidden"));
      ground.value = "hidden" === (state.scene_sections || {}).stage_ground ? "hidden" : "ground";
      const units = el("select", { class: "krea2-compact-select", "aria-label": "Light distance units",
        onChange: event => { state.ui_preferences.measurement_unit = event.target.value; markDirty(); render(); } });
      units.appendChild(el("option", { value: "m" }, "Metres"));
      units.appendChild(el("option", { value: "ft" }, "Feet"));
      units.value = state.ui_preferences.measurement_unit === "ft" ? "ft" : "m";
      const cam = stageCamera();
      const view = el("span", {
        class: "krea2-v2-lt-view-label",
        title: "Drag the background to orbit the camera; drag a bulb to move a light; Alt+wheel to zoom; scroll to move through the workspace; double-click to reset.",
      }, "Azimuth " + cam.azim + "\u00b0 \u00b7 Elevation " + cam.elev + "\u00b0 \u2014 drag to orbit \u00b7 Alt+wheel to zoom");
      if (stageDrag) stageDrag.viewLabel = view;
      stageFoot.append(ground, units, view);
      wrap.appendChild(stageFoot);
      wrap.appendChild(el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-v2-add-light",
        title: "Add a light",
        "aria-label": "Add a light",
        onClick: addLight,
      }, icon("plus", { width: "13", height: "13" })));
      if ((state.scene_sections && state.scene_sections.lights || []).length) {
        wrap.appendChild(el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-danger krea2-v2-clear-lights",
          title: "Remove every light from the prompt",
          "aria-label": "Remove every light from the prompt",
          onClick: function () {
            state.scene_sections = state.scene_sections || {};
            state.scene_sections.lights = [];
            delete state.scene_sections.light_angle;
            syncLightRows();
            markDirty();
            render();
          },
        }, icon("trash", { width: "12", height: "12" })));
      }
      wrap.appendChild(el("div", { class: "krea2-v2-lt-tip" }, [
        icon("bulb", { width: "10", height: "10" }),
        el("span", null, "Drag bulbs to move lights; orbit changes only the view. Left/right refer to the subject. Shading illustrates direction and relative strength; it is not a physical lighting simulation."),
      ]));
      return wrap;
    }

    /* Environment behaves exactly like the CAST concept groups: adding via
     * the picker, presets, save, dice, each-job shuffle and drag-reorder —
     * with atmosphere and environmental movement as the pool. */
    function renderEnvironmentContent() {
      const wrap = el("div", { class: "krea2-v2-subsection-content krea2-v2-env-group" });
      renderGroupSections(wrap, ["environment"]);
      return wrap;
    }

    /* Scene subsections: header IS the toggle, each with its own tint. */
    function renderSceneSubsection(id, title, iconName, contentFn) {
      const open = (state.scene_sections || {})[id] !== false;
      const section = el("section", {
        class: "krea2-v2-subsection krea2-v2-subsection-" + id + (open ? " is-open" : ""),
      });
      const header = el("div", { class: "krea2-v2-block-head krea2-clickable-head" }, [
        icon(iconName, { width: "13", height: "13" }),
        el("strong", null, title),
        el("span", { class: "krea2-structured-spacer" }),
        el("span", { class: "krea2-v2-chevron", "aria-hidden": "true" },
          icon(open ? "chevron_down" : "chevron_right", { width: "12", height: "12" })),
      ]);
      header.addEventListener("click", function () {
        state.scene_sections = state.scene_sections || {};
        state.scene_sections[id] = state.scene_sections[id] === false ? true : false;
        markDirty();
        render();
      });
      const body = el("div", { class: "krea2-v2-block-body" });
      if (open) {
        const content = contentFn();
        if (content) body.appendChild(content);
      }
      section.appendChild(header);
      section.appendChild(body);
      return section;
    }

    /* Type / Setting / Style on ONE horizontal row. "Style" is the shot
     * preset: it replaces camera, lighting and environment together, so
     * picking one warns first when those sections have content. */
    function sceneSettingSelect() {
      const setting = state.setting && typeof state.setting === "object"
        ? state.setting
        : (state.setting = { enabled: false, name: "", description: "" });
      const select = el("select", {
        class: "krea2-compact-select krea2-scene-select",
        "aria-label": "Scene setting",
        title: "Pick a scene — it fills the description below",
        onChange: function (event) {
          const preset = SETTING_PRESETS[Number(event.target.value)];
          if (!preset) return;
          setting.enabled = true;
          setting.name = preset[0];
          setting.description = preset[1];
          // The preset text lands in the editable description field.
          state.base_prompt = preset[1];
          markDirty();
          render();
        },
      });
      select.appendChild(el("option", { value: "" },
        "Selected scene: " + (setting.enabled && setting.name ? setting.name : "— choose one —")));
      SETTING_PRESETS.slice().sort(function (a, b) {
        return String(a[0]).toLowerCase().localeCompare(String(b[0]).toLowerCase());
      }).forEach(function (preset, index) {
        select.appendChild(el("option", { value: String(SETTING_PRESETS.indexOf(preset)) }, preset[0]));
      });
      return select;
    }

    /* Setting section at the top of the SCENE tab, split into two clearly
     * separated cards:
     *  1. Setting — the scene DESCRIPTION only. Scene presets, saved
     *     scenes, dice, shuffle, Save scene: nothing else. It never
     *     touches camera or lighting.
     *  2. Shot preset (the old "Style") — a whole-scene preset that
     *     REPLACES camera, lighting and environment concepts below it.
     */
    function renderSceneSettingSection() {
      const section = el("section", { class: "krea2-v2-setting-section krea2-v2-setting-stack" });
      const setting = state.setting && typeof state.setting === "object"
        ? state.setting
        : (state.setting = { enabled: false, name: "", description: "" });
      const settingEachJob = !!(state.randomize_on_job || {}).setting;

      const clearSetting = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-icon-btn krea2-scene-clear",
        title: "Clear the scene description (removes it from the prompt)",
        "aria-label": "Clear the scene description",
        onClick: function () {
          const current = state.setting;
          current.enabled = false;
          current.name = "";
          current.description = "";
          state.base_prompt = "";
          markDirty();
          render();
        },
      }, icon("close", { width: "12", height: "12" }));

      /* --- Card 1: Setting (description only) --------------------------- */
      const settingHead = el("div", { class: "krea2-v2-block-head krea2-v2-setting-head" }, [
        icon("globe", { width: "13", height: "13" }),
        el("strong", null, "Setting"),
        el("span", { class: "krea2-v2-block-hint" }, "scene description only"),
        el("span", { class: "krea2-structured-spacer" }),
        el("label", { class: "krea2-inline-check" }, [
          el("input", {
            type: "checkbox",
            checked: !!setting.enabled,
            onChange: function (event) {
              state.setting.enabled = !!event.target.checked;
              markDirty();
              render();
            },
          }),
          el("span", null, "Include"),
        ]),
        diceButton("Randomize the scene", function () {
          const preset = randomChoice(SETTING_PRESETS);
          const current = state.setting;
          current.enabled = true;
          current.name = preset[0];
          current.description = preset[1];
          state.base_prompt = preset[1];
          markDirty();
          render();
        }, "krea2-icon-btn"),
        el("button", {
          type: "button",
          class: "krea2-wizard-btn krea2-icon-btn krea2-shuffle" + (settingEachJob ? " is-active" : ""),
          title: settingEachJob
            ? "Shuffle on: a fresh scene is chosen for every queued job. Click to stop."
            : "Shuffle off: randomize the scene every queued job.",
          "aria-label": "Randomize the scene every queued job",
          "aria-pressed": settingEachJob ? "true" : "false",
          onClick: function () { toggleSceneShuffle(settingEachJob); },
        }, icon("shuffle", { width: "12", height: "12" })),
        clearSetting,
      ]);

      /* Saved scene presets: description only (scope "setting"). */
      const savedSceneSelect = el("select", {
        class: "krea2-compact-select krea2-scene-select",
        "aria-label": "Saved scene presets",
        title: "Load a saved scene description",
        onChange: function (event) {
          const preset = savedSettings[Number(event.target.value)];
          if (!preset) return;
          state.setting = cloneJson(preset.setting);
          state.base_prompt = String(state.setting.description || "");
          markDirty();
          render();
        },
      });
      savedSceneSelect.appendChild(el("option", { value: "" }, "Saved scenes..."));
      const savedSettings = savedPresets.filter(function (preset) {
        return preset.scope === "setting";
      }).concat(state.setting_presets || []);
      savedSettings.forEach(function (preset, index) {
        savedSceneSelect.appendChild(el("option", { value: String(index) }, preset.label || "Scene"));
      });

      const saveSceneBtn = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        title: "Save the scene description as a reusable preset (camera & lighting are not included)",
        onClick: function () {
          const current = state.setting;
          const label = String(current.name || "Scene").trim();
          if (!label) { showToast("Choose or name the scene first", "warning"); return; }
          const existing = findExistingSavedPreset("setting", label);
          if (existing && !window.confirm(
            "A scene preset named \u201c" + label + "\u201d already exists. Overwrite it?",
          )) return;
          const payload = { scope: "setting", setting: cloneJson(current) };
          if (existing) {
            Object.assign(existing, payload, { label: label });
          } else {
            savedPresets.push(Object.assign({ id: makeSavedPresetId("setting", ""), label: label }, payload));
          }
          persistSavedPresets(existing ? "Scene preset overwritten" : "Scene preset saved");
        },
      }, "Save scene");

      const description = el("textarea", {
        class: "krea2-compact-textarea krea2-wizard-base",
        rows: "2",
        "aria-label": "Scene description",
        placeholder: "Describe the scene, mood, atmosphere... (camera and lighting live below)",
        onInput: function (event) {
          state.base_prompt = event.target.value;
          state.setting.description = event.target.value;
          autoExpandTextarea(event);
          markDirty();
        },
      }, state.base_prompt || "");
      autoExpandTextarea({ target: description });

      const settingCard = el("div", { class: "krea2-v2-card-block krea2-v2-setting-card" }, [
        settingHead,
        el("div", { class: "krea2-v2-setting-body" }, [
          el("div", { class: "krea2-v2-setting-top" }, [
            el("span", { class: "krea2-v2-field-label" }, "Scene preset"),
            sceneSettingSelect(),
            savedSceneSelect,
            saveSceneBtn,
          ]),
          el("div", { class: "krea2-v2-setting-top krea2-v2-setting-type-row" }, [
            el("span", { class: "krea2-v2-field-label" }, "Type"),
            creativeModeControl,
          ]),
          el("div", { class: "krea2-v2-setting-desc" }, [
            el("span", { class: "krea2-v2-field-label" }, "Description"),
            description,
          ]),
          el("div", { class: "krea2-v2-setting-note" },
            "Scene presets only store and restore the description \u2014 the camera and lighting sections below keep their own settings."),
        ]),
      ]);
      section.appendChild(settingCard);

      /* --- Card 2: Shot preset (replaces camera/lighting/environment) --- */
      const shotHead = el("div", { class: "krea2-v2-block-head krea2-v2-setting-head" }, [
        icon("clapper", { width: "13", height: "13" }),
        el("strong", null, "Shot preset"),
        el("span", { class: "krea2-v2-block-hint" }, "replaces camera, lighting & environment below"),
        el("span", { class: "krea2-structured-spacer" }),
      ]);
      const clearShot = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-danger",
        title: "Remove every scene concept (camera, lighting, environment, shot distance, lights) from the prompt",
        onClick: function () {
          if (!window.confirm("Clear every scene concept (camera, lighting, environment) from the prompt?")) return;
          state.rows = [];
          state.scene_sections = state.scene_sections || {};
          state.scene_sections.lights = [];
          state.scene_sections.shot_distance = 0;
          state.master_preset_id = null;
          state.master_preset_label = null;
          delete state.scene_sections.light_angle;
          markDirty();
          render();
        },
      }, "Clear scene concepts");
      const shotCard = el("div", { class: "krea2-v2-card-block krea2-v2-shot-card" }, [
        shotHead,
        el("div", { class: "krea2-v2-setting-top krea2-v2-shot-row" }, [
          masterPresetSelect,
          clearShot,
        ]),
        el("div", { class: "krea2-v2-setting-note" },
          "A shot preset fills camera, lighting and environment concepts together. It warns before replacing hands-tuned setups."),
      ]);
      section.appendChild(shotCard);
      return section;
    }

    /* Final Prompt Preview: header bar (click = collapse) above a fully
     * desaturated gray monospace code area. Shared by both tabs. */
    function renderMotionSection() {
      const section = el("section", { class: "krea2-motion-section" });
      const enabled = !!state.motion_prompt_enabled;
      const draft = compilePreview(state).motion_prompt_draft || "";
      const draftButton = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        title: "Replace the override below with the current cast draft",
        onClick: function () {
          state.motion_prompt = draft;
          state.motion_prompt_enabled = true;
          markDirty();
          render();
        },
      }, "Draft from cast");
      const clearButton = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-quiet-btn",
        title: "Clear the motion prompt override",
        onClick: function () {
          state.motion_prompt = "";
          state.motion_prompt_enabled = false;
          markDirty();
          render();
        },
      }, "Clear");
      section.appendChild(el("div", { class: "krea2-structured-heading" }, [
        el("strong", null, "Video Motion Prompt (LTX-2.3)"),
        el("span", { class: "krea2-structured-spacer" }),
        draftButton,
        clearButton,
        el("label", { class: "krea2-inline-check", title: "Emit this prompt from the Video Motion Prompt output" }, [
          el("input", {
            type: "checkbox",
            checked: enabled,
            onChange: function (event) {
              state.motion_prompt_enabled = !!event.target.checked;
              markDirty();
              render();
            },
          }),
          el("span", null, "Enable output"),
        ]),
      ]));
      section.appendChild(el("div", { class: "krea2-settings-copy" },
        "One line per character. Feed this to your video model (e.g. LTX-2.3) alongside the generated still."));
      section.appendChild(el("textarea", {
        class: "krea2-compact-textarea krea2-motion-prompt",
        rows: Math.max(2, (state.motion_prompt || draft).split(/\r?\n/).length + 1),
        "aria-label": "Video motion prompt",
        placeholder: draft || "Draft from cast…",
        onInput: function (event) {
          state.motion_prompt = event.target.value;
          markDirty();
        },
      }, state.motion_prompt || ""));
      if (draft) {
        section.appendChild(el("div", { class: "krea2-motion-draft" }, [
          el("span", { class: "krea2-direction-label" }, "Current draft"),
          el("code", null, draft),
        ]));
      }
      return section;
    }

    function render() {
      try {
        renderUnsafe();
      } catch (error) {
        console.error("[Krea2PromptWizard] render failed", error);
        castHost.innerHTML = "";
        sceneHost.innerHTML = "";
        conceptsHost.innerHTML = "";
        const fatal = el("div", { class: "krea2-wizard-fatal" }, [
          el("strong", null, "The wizard hit an error while rendering."),
          el("code", null, String(error && error.message ? error.message : error)),
        ]);
        editorBody.innerHTML = "";
        editorBody.appendChild(fatal);
      }
    }

    const PERFORMANCE_CATEGORIES = ["emotion", "emotion_trigger", "face", "face_trigger", "gaze", "mouth", "body", "subject_movement"];

    function selectedCharacter() {
      return state.characters.find(character => character.id === state.selected_character_id) || state.characters[0];
    }
    function rowDisplayLabel(row) {
      return row.label && row.label !== row.preset_id ? row.label : library.find(preset => preset.id === row.preset_id)?.label || row.label || row.phrase || row.category;
    }
    function ownedDerivedRow(row) {
      const lightId = String(row.preset_id || "").startsWith("custom.light_") ? String(row.preset_id).slice("custom.light_".length) : "";
      if (lightId && (state.scene_sections.lights || []).some(light => String(light.id) === lightId)) return true;
      return row.preset_id === "custom.shot_distance" && state.scene_sections.shot_distance !== undefined;
    }

    function identityFingerprint(character) {
      const snapshot = cloneJson(character);
      for (const key of Object.keys(snapshot)) if (key.startsWith("loaded_") || ["id", "rows", "position", "interaction", "face_guidance", "expanded", "additional_open", "concepts_open", "quick_open", "loras_open", "collapsed_direction", "randomize_direction_groups"].includes(key)) delete snapshot[key];
      return JSON.stringify(snapshot);
    }
    function identityStatus(character) {
      if (!character.loaded_identity_preset_id) return "Unsaved identity";
      const label = savedPresets.find(preset => preset.id === character.loaded_identity_preset_id)?.label || "Loaded identity";
      return label + (character.loaded_identity_snapshot !== identityFingerprint(character) ? " · Modified" : "");
    }

    function workspaceSection(id, title, summary, content, defaultOpen) {
      const key = "workspace_" + id;
      const open = state.collapsed[key] === undefined ? !!defaultOpen : !state.collapsed[key];
      const section = W.section(id, title, summary, open, () => { state.collapsed[key] = open; persist(); render(); }, content);
      section.id = "krea2-section-" + id;
      return section;
    }

    function workspaceRows(rows, owner) {
      const host = el("div", { class: "krea2-workspace-rows" });
      for (const row of rows.filter(row => !ownedDerivedRow(row))) {
        const item = el("div", { class: "krea2-workspace-row", dataset: { rowId: row.id } });
        item.appendChild(renderRow(row, {
          presets: library, conceptColors: state.concept_colors, markDirty, refresh: render,
          removeRow: id => { owner.rows = owner.rows.filter(entry => entry.id !== id); markDirty(); render(); },
          editRow: () => editWorkspaceRow(row, owner), onHover: setRowHover,
          persistConceptColors: () => saveConceptColors(state.concept_colors || {}).catch(() => {}),
        }));
        host.appendChild(item);
      }
      if (!rows.length) host.appendChild(el("p", { class: "krea2-workspace-empty" }, "No concepts applied."));
      return host;
    }

    /* Concept pills show only the label and strength. Rows that do not come
     * from the library (recovered or imported concepts) keep their stored
     * phrase editable through a dialog on the label. */
    function editWorkspaceRow(row, owner) {
      const libraryMatch = library.some(preset => preset.id === row.preset_id);
      if (libraryMatch) {
        showSearchableSelector({ presets: compatibleLibrary(), title: "Replace concept", multiSelect: false,
          onPick: preset => { const id = row.id; const strength = row.strength; const replacement = presetToRow(preset, state); Object.assign(row, replacement, { id, strength }); markDirty(); render(); },
          onClose: render,
        });
        return;
      }
      W.textDialog({
        title: "Edit phrase",
        label: "Phrase",
        note: "This concept has no library preset (recovered or imported), so its exact phrase is edited here.",
        value: row.phrase || "",
        multiline: true,
        onSave: value => { row.phrase = value; markDirty(); render(); },
      });
    }

    function workspaceAdd(owner, categories) {
      return W.iconButton("plus", "Add concepts", () => showSearchableSelector({
        presets: compatibleLibrary(), title: "Add concepts", categories, multiSelect: true,
        selectedIds: owner.rows.map(row => row.preset_id),
        onToggle: (preset, selected) => {
          if (selected && !owner.rows.some(row => row.preset_id === preset.id)) owner.rows.push(presetToRow(preset, state));
          else if (!selected) owner.rows = owner.rows.filter(row => row.preset_id !== preset.id);
          markDirty();
        }, onClose: render,
      }));
    }

    function workspaceCharacterPicker() {
      const picker = el("select", { class: "krea2-compact-select", "aria-label": "Selected character", onChange: event => { state.selected_character_id = event.target.value; persist(); render(); } });
      state.characters.forEach((character, index) => picker.appendChild(el("option", { value: character.id }, (character.name || "Character " + (index + 1)) + (character.enabled === false ? " · excluded" : ""))));
      picker.value = selectedCharacter()?.id || "";
      return el("div", { class: "krea2-workspace-actions krea2-workspace-cast-picker" }, [picker,
        W.iconButton("plus", "Add character", () => { const character = newCharacter(); state.characters.push(character); state.selected_character_id = character.id; markDirty(); render(); }),
        W.iconButton("users", "Load a saved identity onto the selected character", () => openWorkspaceChooser("character")),
      ]);
    }

    function performanceContent() {
      const character = selectedCharacter();
      if (!character) return el("p", null, "Add a character to direct their performance.");
      const flags = character.randomize_direction_groups || {};
      const currentPreset = savedPresets.find(preset => preset.id === character.loaded_performance_preset_id);
      const modified = performanceModified(character);
      const host = el("div", null, [el("p", { class: "krea2-performance-preset-summary" }, currentPreset ? currentPreset.label + (modified ? " · Modified" : "") : "Direct " + (character.name || "selected character")),
        el("div", { class: "krea2-workspace-actions" }, [workspaceAdd(character, PERFORMANCE_CATEGORIES),
          W.iconButton("folder", "Performance presets", () => openWorkspaceChooser("performance")),
          W.iconButton("save", "Save performance as preset", () => createWorkspacePreset("performance")),
          W.iconButton("dice", "Randomize performance", () => resolveRandom({ kind: "performance", character_id: character.id })),
          W.iconToggle("shuffle", "New performance picks on every job", ["emotion", "face", "body"].every(key => flags[key]), checked => { character.randomize_direction_groups = Object.assign({}, flags, { emotion: checked, face: checked, body: checked }); markDirty(); render(); }),
          lockControl("characters", character.id),
        ]),
      ]);
      if (currentPreset && !currentPreset.builtin) host.appendChild(W.iconButton("save", "Update saved performance from current controls", () => updateWorkspacePreset(currentPreset)));
      const rows = character.rows.filter(row => PERFORMANCE_CATEGORIES.includes(row.category));
      if (rows.length) host.appendChild(workspaceRows(rows, character));
      else host.appendChild(el("p", { class: "krea2-workspace-empty" }, "Choose a performance preset or add concepts."));
      const fine = el("details", null, [el("summary", null, "Fine tuning and subgroup presets")]);
      for (const group of DIRECTION_GROUPS) fine.appendChild(renderCharacterDirectionBlock(character, group.id));
      fine.appendChild(W.field("Interaction", character.interaction, value => { character.interaction = value; markDirty(); }));
      fine.appendChild(W.field("Face guidance", character.face_guidance, value => { character.face_guidance = value; markDirty(); }, true));
      host.appendChild(fine);
      return host;
    }

    function environmentContent() {
      const setting = state.setting;
      const host = el("div", null, [
        W.check("Include environment description", setting.enabled, checked => { setting.enabled = checked; markDirty(); }),
        W.field("Environment name", setting.name, value => { setting.name = value; markDirty(); }),
        W.field("Environment description", setting.description, value => { setting.description = value; setting.enabled = true; markDirty(); }, true),
        W.field("Additional scene notes", state.base_prompt, value => { state.base_prompt = value; markDirty(); }, true),
        el("div", { class: "krea2-workspace-actions" }, [W.iconButton("folder", "Environment presets", () => openWorkspaceChooser("setting")), W.iconButton("save", "Save environment as preset", () => createWorkspacePreset("setting")), W.iconButton("dice", "Randomize setting", () => randomizeSceneOnce()), W.iconToggle("shuffle", "New setting on every job", !!state.randomize_on_job.setting, checked => { state.randomize_on_job.setting = checked; markDirty(); render(); })]),
      ]);
      const base = String(state.base_prompt || "").trim();
      if (base && base === String(setting.description || "").trim()) host.appendChild(el("div", { class: "krea2-workspace-warning" }, [el("p", null, "This legacy description exists in both scene notes and environment. Keep both until you choose to consolidate."), W.button("Keep environment copy only", () => { state.base_prompt = ""; markDirty(); render(); })]));
      renderGroupSections(host, ["environment"]);
      return host;
    }

    function lockControl(kind, id) {
      const locks = state.randomization.locks;
      const values = locks[kind] || [];
      return W.iconToggle("lock", "Lock randomization", values.includes(id), checked => { locks[kind] = checked ? Array.from(new Set(values.concat(id))) : values.filter(value => value !== id); markDirty(); render(); });
    }

    function randomControls() {
      const settings = state.randomization;
      const seedMode = el("select", { class: "krea2-compact-select", "aria-label": "Random seed mode", onChange: event => { settings.seed_mode = event.target.value; markDirty(); } }, [el("option", { value: "new_per_job" }, "New seed each job"), el("option", { value: "fixed" }, "Fixed seed")]);
      seedMode.value = settings.seed_mode;
      const host = el("div", null, [el("div", { class: "krea2-workspace-actions" }, [seedMode,
        el("input", { type: "number", step: "1", class: "krea2-compact-input", "aria-label": "Random seed", value: settings.seed, onChange: event => { settings.seed = Math.max(0, Math.trunc(Number(event.target.value) || 0)); markDirty(); } }),
        W.iconButton("dice", "Randomize all unlocked scopes now", () => resolveRandom({ kind: "all" })),
      ]), el("p", null, "Locks protect selected scopes. Fixed seeds repeat the same choices; each-job flags apply only to their own field or section.")]);
      for (const group of GROUPS) host.appendChild(el("div", { class: "krea2-workspace-actions" }, [el("span", null, GROUP_LABELS[group]), lockControl("sections", group)]));
      const character = selectedCharacter();
      if (character) {
        const fields = settings.locks.fields[character.id] || [];
        const choices = el("div", { class: "krea2-workspace-lock-fields" });
        CHARACTER_APPEARANCE.forEach(field => choices.appendChild(W.check("Lock " + field.label, fields.includes(field.key), checked => { settings.locks.fields[character.id] = checked ? Array.from(new Set(fields.concat(field.key))) : fields.filter(key => key !== field.key); markDirty(); render(); })));
        host.appendChild(el("details", null, [el("summary", null, "Field locks for " + (character.name || "selected character")), choices]));
      }
      host.appendChild(W.field("Random weight minimum", state.random_strength_min, value => { state.random_strength_min = Math.max(-3, Math.min(3, Number(value) || 0)); markDirty(); }));
      host.appendChild(W.field("Random weight maximum", state.random_strength_max, value => { state.random_strength_max = Math.max(state.random_strength_min, Math.min(3, Number(value) || 0)); markDirty(); }));
      return host;
    }

    async function resolveRandom(scope) {
      const request = ++randomRequest;
      const expected = state.document_revision;
      try {
        const result = await fetchCompiledPreview(cloneJson(state), { expert: expertMode(), randomize: true, scope, seed: state.randomization.seed_mode === "fixed" ? state.randomization.seed : undefined });
        if (disposed || request !== randomRequest || state.document_revision !== expected) return;
        if (!result.resolved_state) throw new Error("The backend did not return resolved random choices.");
        state = coerceState(result.resolved_state); markDirty(); render();
      } catch (error) { showToast(error.message || "Randomization failed", "error"); }
    }

    function presetEntries(scope, group) {
      const entries = savedPresets.concat(state.character_presets || [], state.setting_presets || []);
      if (!scope || scope === "character") entries.push(...CHARACTER_PRESETS.map((entry,index) => Object.assign({ id: "builtin_character_" + index, scope: "character", builtin: true }, entry)));
      if (!scope || scope === "setting") entries.push(...SETTING_PRESETS.map((entry,index) => ({ id: "builtin_setting_" + index, scope: "setting", builtin: true, label: entry[0], setting: { enabled: true, name: entry[0], description: entry[1] } })));
      if (!scope || scope === "lighting") entries.push(...LIGHTING_PRESETS.map(entry => ({ id: entry.id, scope: "lighting", builtin: true, label: entry.label, lights: cloneJson(entry.lights) })));
      if (!scope) entries.push(...compatibleLibrary().map(entry => ({ id: entry.id, scope: "group", group: groupForCategory(entry.category), builtin: true, label: entry.label, rows: [presetToRow(entry, state)], single_concept: true })));
      const deduped = new Map(entries.map(entry => [entry.id, entry]));
      return Array.from(deduped.values()).filter(entry => (!scope || entry.scope === scope || (scope === "performance" && entry.scope === "character_direction")) && (!group || entry.group === group));
    }

    function snapshotPreset(scope, group) {
      const character = selectedCharacter();
      if (scope === "full") return { scope, state: cloneJson(state), rows: cloneJson(state.rows), base_prompt: state.base_prompt };
      if (scope === "character") return { scope, character: cloneJson(character || newCharacter()) };
      if (scope === "setting") return { scope, setting: cloneJson(state.setting) };
      if (scope === "performance") return { scope, rows: cloneJson((character?.rows || []).filter(row => PERFORMANCE_CATEGORIES.includes(row.category))) };
      if (scope === "lighting") return { scope, lights: cloneJson(sceneLights()) };
      if (scope === "group" && String(group).startsWith("direction_")) {
        const categories = DIRECTION_GROUPS.find(entry => "direction_" + entry.id === group)?.categories || [];
        return { scope, group, rows: cloneJson((character?.rows || []).filter(row => categories.includes(row.category))) };
      }
      return { scope: "group", group, rows: cloneJson(state.rows.filter(row => groupForCategory(row.category) === group)) };
    }

    function performanceFingerprint(character) {
      return canonicalPerformanceSnapshot(character.rows.filter(row => PERFORMANCE_CATEGORIES.includes(row.category)));
    }
    function canonicalPerformanceSnapshot(rows) {
      return JSON.stringify(rows.map(row => ({ category: row.category, preset_id: row.preset_id, phrase: row.phrase || library.find(preset => preset.id === row.preset_id)?.phrase || "", strength: K.helpers.defaultWeightForRow(row, expertMode()), enabled: row.enabled !== false })));
    }
    function performanceModified(character) {
      let snapshot = character.loaded_performance_snapshot;
      try { snapshot = canonicalPerformanceSnapshot(JSON.parse(snapshot)); } catch (_) {}
      return snapshot !== performanceFingerprint(character);
    }
    function updateWorkspacePreset(preset, label) {
      const index = savedPresets.findIndex(entry => entry.id === preset.id && !entry.builtin);
      if (index < 0) return;
      savedPresets[index] = Object.assign({}, preset, snapshotPreset(preset.scope, preset.group), { id: preset.id, label: label || preset.label });
      const character = selectedCharacter();
      const performanceSnapshot = character && preset.scope === "performance" ? performanceFingerprint(character) : null;
      const identitySnapshot = character && preset.scope === "character" ? identityFingerprint(character) : null;
      return persistSavedPresets("Saved preset updated").then(accepted => {
        if (!accepted || !character) return accepted;
        if (performanceSnapshot !== null) character.loaded_performance_snapshot = performanceSnapshot;
        if (identitySnapshot !== null) character.loaded_identity_snapshot = identitySnapshot;
        persist();
        if (!disposed) render();
        return accepted;
      });
    }

    async function createWorkspacePreset(scope, group) {
      const label = await askPresetName("Save " + scope + " preset");
      if (!label) return;
      savedPresets.push(Object.assign(snapshotPreset(scope, group), { id: makeSavedPresetId(scope, group), label }));
      return persistSavedPresets("Preset saved");
    }

    function applyWorkspacePreset(preset, options) {
      const before = cloneJson(state);
      const character = selectedCharacter();
      const copiedRows = rows => cloneRowsWithFreshIds(rows || []).map(row => Object.assign(row, { origin: "preset", origin_action: preset.id || "apply_preset" }));
      try {
        if (preset.scope === "full") {
          state = coerceState(cloneJson(preset.state || Object.assign({}, state, preset)));
          state.rows = copiedRows(state.rows);
          for (const storedCharacter of state.characters) storedCharacter.rows = copiedRows(storedCharacter.rows);
        } else if (preset.scope === "character" && character) {
          const stored = cloneJson(preset.character || {});
          const identity = Object.assign(newCharacter(), stored, { id: character.id, position: character.position, interaction: character.interaction, face_guidance: character.face_guidance, rows: options?.includePerformance ? copiedRows(stored.rows) : cloneJson(character.rows) });
          if (!options?.includePerformance) {
            for (const key of ["loaded_performance_preset_id", "loaded_performance_snapshot"]) {
              delete identity[key];
              if (key in character) identity[key] = cloneJson(character[key]);
            }
          }
          identity.loaded_identity_preset_id = preset.id;
          identity.loaded_identity_snapshot = identityFingerprint(identity);
          state.characters[state.characters.indexOf(character)] = identity;
        } else if (preset.scope === "performance" || preset.scope === "character_direction") {
          if (!character) throw new Error("Select a character first.");
          const incoming = copiedRows(preset.rows).filter(row => PERFORMANCE_CATEGORIES.includes(row.category));
          if (options?.combine) {
            for (const row of incoming) { const match = character.rows.find(current => current.preset_id === row.preset_id && current.category === row.category); if (match) Object.assign(match, row, { id: match.id }); else character.rows.push(row); }
          } else character.rows = character.rows.filter(row => !PERFORMANCE_CATEGORIES.includes(row.category)).concat(incoming);
          character.loaded_performance_preset_id = preset.id;
          character.loaded_performance_snapshot = performanceFingerprint(character);
        } else if (preset.scope === "setting") state.setting = cloneJson(preset.setting);
        else if (preset.scope === "lighting") { state.scene_sections.lights = cloneJson(preset.lights || []); syncLightRows(); }
        else if (preset.scope === "group") {
          const incoming = copiedRows(preset.rows);
          if (preset.single_concept) state.rows = state.rows.filter(row => row.preset_id !== incoming[0]?.preset_id).concat(incoming);
          else if (String(preset.group).startsWith("direction_") && character) {
            const categories = DIRECTION_GROUPS.find(group => "direction_" + group.id === preset.group)?.categories || [];
            character.rows = character.rows.filter(row => !categories.includes(row.category)).concat(incoming);
          } else state.rows = state.rows.filter(row => groupForCategory(row.category) !== preset.group).concat(incoming);
        }
        state.ui_preferences.recents = [preset.id].concat((state.ui_preferences.recents || []).filter(id => id !== preset.id)).slice(0, 20);
        markDirty(); render();
      } catch (error) { state = before; showToast(error.message, "error"); }
    }

    function openWorkspaceChooser(scope, group) {
      activeChooser?.close();
      const options = { includePerformance: false, combine: false };
      const controls = el("div", { class: "krea2-workspace-actions" });
      if (scope === "character") controls.appendChild(W.check("Include saved performance", false, checked => { options.includePerformance = checked; }));
      if (scope === "performance") controls.appendChild(W.check("Combine with current performance", false, checked => { options.combine = checked; }));
      activeChooser = W.chooser({ title: scope ? "Choose " + scope + " preset" : "All saved presets", controls,
        entries: () => presetEntries(scope, group), preferences: () => state.ui_preferences,
        favorite: id => { const items = state.ui_preferences.favorites || []; state.ui_preferences.favorites = items.includes(id) ? items.filter(value => value !== id) : items.concat(id); persist(); },
        apply: preset => applyWorkspacePreset(preset, options), create: () => createWorkspacePreset(scope || "full", group),
        edit: preset => {
          applyWorkspacePreset(preset, options);
          const id = preset.scope === "performance" || preset.scope === "character_direction" ? "performance" : preset.scope === "character" ? "character" : preset.scope === "setting" ? "environment" : preset.scope === "lighting" ? "lighting" : "advanced";
          state.collapsed["workspace_" + id] = false;
          if (id === "character" && selectedCharacter()) selectedCharacter().expanded = true;
          persist(); render();
        },
        update: updateWorkspacePreset,
        save: (preset, duplicate) => { const payload = cloneJson(preset); if (duplicate || payload.builtin) { payload.id = makeSavedPresetId(payload.scope, payload.group); delete payload.builtin; savedPresets.push(payload); } else { const index = savedPresets.findIndex(entry => entry.id === payload.id); if (index >= 0) savedPresets[index] = payload; } persistSavedPresets("Preset saved"); },
        remove: preset => { savedPresets = savedPresets.filter(entry => entry.id !== preset.id); state.character_presets = state.character_presets.filter(entry => entry.id !== preset.id); state.setting_presets = state.setting_presets.filter(entry => entry.id !== preset.id); markDirty(); persistSavedPresets("Preset deleted"); },
        error: message => showToast(message, "error"), onClose: () => { activeChooser = null; },
      });
    }

    function focusEditor() {
      if (focusOverlay) { closeFocusedEditor(); return; }
      focusedHome = root.parentNode;
      focusOverlay = el("div", { class: "krea2-workspace-focus-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Focused Prompt Wizard" });
      focusOverlay.appendChild(root); document.body.appendChild(focusOverlay);
      root.classList.add("is-focused"); render();
    }
    function closeFocusedEditor() {
      if (!focusOverlay) return;
      if (focusedHome) focusedHome.appendChild(root);
      root.classList.remove("is-focused"); focusOverlay.remove(); focusOverlay = null; focusedHome = null;
      render();
    }

    function inspectorContent() {
      const host = el("div", null, [el("strong", null, "Current document preview"), W.check("Show compile trace", state.show_work, checked => { state.show_work = checked; persist(); render(); }), livePreview.root, showWork]);
      const warnings = (latestPreview?.result?.warnings || []).concat(lastRun?.warnings || []);
      if (warnings.length) host.appendChild(el("div", { class: "krea2-workspace-warning" }, warnings.map(warning => el("p", null, typeof warning === "string" ? warning : warning.message || JSON.stringify(warning)))));
      if (lastRun) {
        host.appendChild(el("strong", null, "Actual last run · revision " + lastRun.revision));
        if (lastRun.revision !== state.document_revision) host.appendChild(el("p", { class: "krea2-workspace-warning" }, "The current document has changed since this run. Its result has not replaced your edits."));
        host.appendChild(el("div", { class: "krea2-workspace-actual-prompt" }, lastRun.prompt));
        const nativeWeighting = lastRun.trace?.native_weighting;
        if (nativeWeighting) {
          const assignments = Array.isArray(nativeWeighting.token_weights) ? nativeWeighting.token_weights : [];
          const positions = new Set(assignments.map(pair => pair[0]));
          host.appendChild(el("p", { class: "krea2-workspace-native-summary" }, nativeWeighting.enabled
            ? "Native weighting enabled · strength " + (nativeWeighting.strength ?? 1) + " · " + positions.size + " matched token positions."
            : nativeWeighting.conditioning === "plain"
              ? "Native weighting disabled · Positive Conditioning carries the plain encoded prompt."
              : "Native weighting disabled · no CLIP connected, so Positive Conditioning is empty."));
          if (nativeWeighting.enabled) {
            if (nativeWeighting.strength === 0) host.appendChild(el("p", null, "Strength zero encodes the clean text without changing token weights."));
            host.appendChild(el("strong", null, "Text actually encoded"));
            host.appendChild(el("div", { class: "krea2-workspace-actual-prompt" }, String(nativeWeighting.encoded_text ?? "")));
            if (!assignments.length) host.appendChild(el("p", null, "No weighted phrases matched visible tokens; the model passed through unchanged."));
            if (assignments.length) {
              const details = el("details", null, [el("summary", null, "Matched token weights")]);
              const groups = new Map();
              assignments.forEach(([position, multiplier, bias]) => {
                const key = multiplier + ":" + bias;
                if (!groups.has(key)) groups.set(key, { multiplier, bias, positions: [] });
                groups.get(key).positions.push(position);
              });
              for (const group of groups.values()) {
                details.appendChild(el("p", null, "Token positions " + group.positions.join(", ")
                  + " · value multiplier " + group.multiplier + " · attention boost " + group.bias));
              }
              host.appendChild(details);
            }
          }
        }
      host.appendChild(W.iconButton("copy", "Copy the actual last-run prompt", () => copy(lastRun.prompt)));
      if (lastRun.snapshot) host.appendChild(W.iconButton("history", "Restore the exact last-run snapshot", () => {
          const preferences = state.ui_preferences;
          state = coerceState(cloneJson(lastRun.snapshot));
          state.ui_preferences = preferences;
          markDirty();
          state.randomization.replay = true;
          persistedState = JSON.stringify(state); persist(); render();
        }));
      } else host.appendChild(el("p", null, "No workflow has run yet."));
      return host;
    }

    function renderWorkspace() {
      for (const stop of Array.from(activeDrags)) stop();
      K.helpers.cleanupDOM(topBar);
      K.helpers.cleanupDOM(editorBody);
      K.helpers.cleanupDOM(footerHost);
      topBar.innerHTML = "";
      topBar.appendChild(el("strong", { class: "krea2-workspace-title" }, "Prompt Wizard"));
      topBar.appendChild(el("span", { class: "krea2-workspace-build" }, WIZARD_VERSION));
      topBar.appendChild(W.iconButton("book", "Presets", () => openWorkspaceChooser()));
      topBar.appendChild(W.iconButton("save", "Save workspace as preset", () => createWorkspacePreset("full")));
      topBar.appendChild(undoBtn); topBar.appendChild(redoBtn);
      topBar.appendChild(W.iconButton("expand", focusOverlay ? "Close the focused editor" : "Open the focused editor", focusEditor));
      const textSize = el("select", { class: "krea2-compact-select", "aria-label": "Editor text size", onChange: event => { state.ui_preferences.text_size = Number(event.target.value); persist(); render(); } });
      [13,14,16,18,20].forEach(size => textSize.appendChild(el("option", { value: String(size) }, size + " px")));
      textSize.value = String(state.ui_preferences.text_size); topBar.appendChild(textSize);
      root.style.fontSize = state.ui_preferences.text_size + "px";
      root.dataset.documentRevision = String(state.document_revision);
      editorBody.innerHTML = ""; editorBody.appendChild(workspaceCharacterPicker());
      const character = selectedCharacter();
      editorBody.appendChild(workspaceSection("character", "Character", character ? characterSummary(character) || "Identity and appearance" : "No cast", () => character ? renderCharacterCard(character, state.characters.indexOf(character)) : el("p", null, "Add a character or load an identity."), false));
      const perfRows = (character?.rows || []).filter(row => PERFORMANCE_CATEGORIES.includes(row.category));
      const each = Object.values(character?.randomize_direction_groups || {}).some(Boolean);
      editorBody.appendChild(workspaceSection("performance", "Performance", perfRows.length + " concepts" + (each ? " · each job" : "") + " · " + (character?.name || "selected character"), performanceContent, true));
      editorBody.appendChild(workspaceSection("lighting", "Lighting", ((state.scene_sections?.lights || []).length) + " lights · " + state.rows.filter(row => groupForCategory(row.category) === "lighting").length + " concepts" + (state.randomize_on_job.lighting ? " · each job" : ""), () => { const host = renderLightingContent(); renderGroupSections(host, ["lighting"]); return host; }, true));
      editorBody.appendChild(workspaceSection("environment", "Environment", state.setting.name || "Description, atmosphere and movement", environmentContent, true));
      editorBody.appendChild(workspaceSection("camera", "Camera", state.rows.filter(row => groupForCategory(row.category) === "camera_film").length + " concepts" + (state.randomize_on_job.camera_film ? " · each job" : ""), () => { const host = renderCameraContent(); renderGroupSections(host, ["camera_film"]); return host; }, false));
      editorBody.appendChild(workspaceSection("style", "Style & Finish", state.rows.filter(row => groupForCategory(row.category) === "style_finish").length + " concepts" + (state.randomize_on_job.style_finish ? " · each job" : ""), () => { const host = el("div"); renderGroupSections(host, ["style_finish"]); return host; }, false));
      editorBody.appendChild(workspaceSection("random", "Randomization", state.randomization.seed_mode === "fixed" ? "Fixed seed " + state.randomization.seed : "New seed each job", randomControls, false));
      editorBody.appendChild(workspaceSection("advanced", "Advanced & Recovered concepts", state.rows.length + " global concepts · strength pills · recovered phrases stay editable", () => {
        const host = el("div", null, [workspaceAdd(state), W.iconButton("book", "Concept library", openLibrary), W.iconButton("gear", "Output settings", () => { state.settings_open = !state.settings_open; persist(); render(); }), W.iconButton("download", "Materialize: write the compiled prompt back as an editable snapshot", materialize), W.iconButton("workflow", "Create a subgraph from the current workspace", createSubgraph), W.iconButton("trash", "Reset the workspace to defaults", resetAll, { class: "krea2-wizard-btn krea2-icon-btn krea2-danger" })]);
        host.appendChild(W.check("Native conditioning weighting", state.native_weighting_enabled, checked => { state.native_weighting_enabled = checked; markDirty(); render(); }));
        host.appendChild(el("label", { class: "krea2-workspace-field" }, [
          el("span", null, "Native weighting strength"),
          el("input", { type: "number", min: "0", max: "4", step: "0.05",
            class: "krea2-compact-input", "aria-label": "Native weighting strength",
            value: String(state.native_weighting_strength ?? 1),
            onInput: event => {
              if (event.target.value === "" || !Number.isFinite(Number(event.target.value))) return;
              state.native_weighting_strength = Math.max(0, Math.min(4, Number(event.target.value)));
              markDirty();
            },
            onChange: event => { event.target.value = String(state.native_weighting_strength); },
          }),
        ]));
        host.appendChild(el("p", null, "Connect CLIP and use Positive Conditioning for native weighting. The original prompt and first three outputs stay available."));
        host.appendChild(workspaceRows(state.rows, state));
        if (character) {
          host.appendChild(W.field("Placement", character.position, value => { character.position = value; markDirty(); }));
          ["identity", "subject", "expression", "clothing", "adult_description", "lora_triggers"].forEach(key => { host.appendChild(W.field("Character " + key.replace(/_/g, " "), character[key], value => { character[key] = value; markDirty(); }, true)); });
          const appearance = el("details", null, [el("summary", null, "All appearance fields")]);
          CHARACTER_APPEARANCE.forEach(field => appearance.appendChild(W.field(field.label, character[field.key], value => { character[field.key] = value; markDirty(); })));
          host.appendChild(appearance);
          host.appendChild(workspaceRows(character.rows, character));
        }
        if (state.recovery_rows.length) { host.appendChild(el("strong", null, "Recovered concepts")); host.appendChild(workspaceRows(state.recovery_rows, { get rows() { return state.recovery_rows; }, set rows(value) { state.recovery_rows = value; } })); }
        if (state.migration_report.length) host.appendChild(el("details", null, [el("summary", null, "Migration notes"), el("p", null, state.migration_report.map(item => typeof item === "string" ? item : item.message || JSON.stringify(item)).join(" · "))]));
        host.appendChild(renderMotionSection());
        renderNodeSettings(); host.appendChild(settingsHost);
        return host;
      }, false));
      editorBody.appendChild(workspaceSection("inspector", "Prompt inspector", lastRun ? "Current preview and actual run" : "Current preview · no run yet", inspectorContent, false));
      footerHost.innerHTML = "";
      footerHost.appendChild(el("span", { class: "krea2-workspace-status" }, "Revision " + state.document_revision + (dirty ? " · Modified" : " · Saved document")));
      footerHost.appendChild(W.button("Prompt inspector", () => { state.collapsed.workspace_inspector = false; render(); root.querySelector('[data-section-id="inspector"]')?.scrollIntoView?.({ block: "start", behavior: "smooth" }); }));
      footerHost.appendChild(W.button("Queue workflow", async event => {
        const button = event?.currentTarget;
        if (button) button.disabled = true;
        try { if (typeof window.app?.queuePrompt !== "function") throw new Error("ComfyUI queue is unavailable."); await window.app.queuePrompt(0, 1); }
        catch (error) { showToast(error.message || "The workflow could not be queued.", "error"); }
        finally { if (button) button.disabled = false; }
      }, { class: "krea2-wizard-btn krea2-workspace-queue" }));
      autoHeight();
    }

    function autoHeight() {
      for (const input of root.querySelectorAll("textarea")) { input.style.height = "auto"; input.style.height = Math.max(48, input.scrollHeight || 0) + "px"; input.style.overflow = "hidden"; input.style.resize = "none"; }
    }

    function renderUnsafe() {
      if (disposed) return;
      root.classList.add("krea2-workspace", "krea2-wizard-expanded");
      renderWorkspace();
      updateHistoryControls();
      renderLivePreview(true);
      applyPreviewMode();
    }

    /* Pretty Prompt Preview is default OFF: the Final Prompt Preview shows
     * plain monospace code unless the settings toggle turns the grouped
     * concept-card view back on. */
    function applyPreviewMode() {
      const pretty = !!state.pretty_preview;
      if (livePreview.prettyBody) livePreview.prettyBody.style.display = pretty ? "" : "none";
      if (livePreview.codeText) livePreview.codeText.style.display = pretty ? "none" : "";
      if (livePreview.codeLabel) livePreview.codeLabel.style.display = pretty ? "none" : "";
    }

    function sizeBasePrompt() {
      const input = basePromptControl && basePromptControl.input;
      if (!input) return;
      input.style.height = "auto";
      input.style.height = Math.max(52, input.scrollHeight || 0) + "px";
    }

    /* Pretty Prompt Preview is default OFF: the Final Prompt Preview shows
     * plain monospace code unless the settings toggle turns the grouped
     * concept-card view back on. */
    function copy(text) {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text || "").then(function () { showToast("Copied", "info"); }, function () {});
      }
    }

    function openLibrary() {
      openLibraryEditor({
        library: library,
        markDirty: function () { markDirty(); render(); },
        close: function () { render(); },
        saveUser: saveUserLibrary,
      });
    }

    function saveUserLibrary() {
      const userOnly = library.filter(function (p) { return p.origin === "user"; });
      const api = window.app && window.app.api;
      const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/library"))
        || "/krea2_prompt_wizard/library";
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets: userOnly }),
      }).then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok) {
            const issue = payload.issues && payload.issues[0];
            throw new Error(issue ? issue.message : "Could not save the library.");
          }
          showToast("Library saved", "info");
          return payload;
        });
      });
    }

    async function materialize() {
      try {
        const snapshot = cloneJson(state);
        const compiled = await fetchCompiledPreview(snapshot, { expert: expertMode(), randomize: false });
        materializeToNodes(snapshot, { compiledPrompt: compiled.final_prompt });
      } catch (error) { showToast(error.message || "Could not export prompt snapshot.", "error"); }
    }

    async function createSubgraph() {
      try {
        const snapshot = cloneJson(state);
        const compiled = await fetchCompiledPreview(snapshot, { expert: expertMode(), randomize: false });
        createSubgraphFromWizard(snapshot, { compiledPrompt: compiled.final_prompt });
      } catch (error) { showToast(error.message || "Could not export prompt snapshot.", "error"); }
    }

    function resetAll() {
      if (!window.confirm("Reset all wizard state?")) return;
      state = emptyState();
      state.collapsed = {};
      markDirty();
      render();
      applyModeSize(true);
    }

    function onWorkspaceInput(event) { inputTransaction = event.target; autoHeight(); }
    function onWorkspaceChange() { inputTransaction = null; lastTransaction = null; }
    function onWorkspaceWheel(event) { event.stopPropagation(); }
    function onWorkspaceKey(event) {
      if (event.key === "Escape" && focusOverlay) closeFocusedEditor();
      if (!(event.ctrlKey || event.metaKey) || !root.contains(event.target)) return;
      if (event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if (event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    }
    root.addEventListener("input", onWorkspaceInput, true);
    root.addEventListener("change", onWorkspaceChange, true);
    root.addEventListener("wheel", onWorkspaceWheel, { passive: true });
    document.addEventListener("keydown", onWorkspaceKey);
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => autoHeight()) : null;
    resizeObserver?.observe(root);

    render();
    fetchLibrary().then(function (presets) {
      library.splice(0, library.length, ...presets);
      enrichSeedRows();
      conflictPairsCache = null;
      render();
    }).catch(function () {});
    fetchConflicts().then(function (list) {
      conflictList = Array.isArray(list) ? list : [];
      conflictPairsCache = null;
    });
    fetchConceptColors().then(function (colors) {
      state.concept_colors = Object.assign({}, colors, state.concept_colors || {});
      markDirty();
      render();
    }).catch(function () {});
    fetchMasterPresets().then(function (presets) {
      masterPresets = presets;
      refreshMasterPresetSelect();
    });
    fetchLoras().then(function (names) {
      loras = names;
      render();
    });
    return {
      root: root,
      state: state,
      markDirty: markDirty,
      render: render,
      setState: setState,
      setTab: function (tabId) {
        state.active_tab = tabId;
        persist();
        render();
      },
      /* Merge a backend-resolved state (post-randomization) into the editor
       * WITHOUT disturbing what the user is looking at: the active tab, the
       * prompt footer, collapse flags, and per-character expand states are
       * UI state that must survive job executions. */
      applyResolvedState: function (resolved, rawRevision) {
        const executionRevision = Number(Array.isArray(rawRevision) ? rawRevision[0] : rawRevision ?? resolved?.document_revision ?? state.document_revision);
        if (executionRevision !== state.document_revision) { render(); return false; }
        const previous = JSON.stringify(state);
        const merged = coerceState(resolved || {});
        const uiKeys = [
          "active_tab", "footer_open", "settings_open", "collapsed",
          "selected_character_id", "show_work",
          "show_motion_prompt", "show_face_guidance", "show_concepts_tab",
          "scene_collapsed", "wizard_expanded",
          "ui_preferences", "final_preview_open", "pretty_preview",
          "character_creator",
        ];
        for (const key of uiKeys) {
          if (key in state) merged[key] = state[key];
        }
        if (Array.isArray(state.characters) && Array.isArray(merged.characters)) {
          for (let index = 0; index < merged.characters.length; index += 1) {
            const oldChar = state.characters[index];
            const newChar = merged.characters[index];
            if (oldChar && newChar) {
              newChar.expanded = oldChar.expanded !== false;
              newChar.additional_open = oldChar.additional_open === true;
              newChar.concepts_open = oldChar.concepts_open !== false;
              newChar.quick_open = oldChar.quick_open !== false;
              newChar.loras_open = oldChar.loras_open !== false;
              if (Array.isArray(oldChar.loras)) newChar.loras = oldChar.loras;
            }
          }
        }
        state = merged;
        persistedState = JSON.stringify(state);
        persist();
        render();
        return true;
      },
      resize: function () { autoHeight(); },
      dispose: function () {
        disposed = true; ++previewSequence; ++randomRequest;
        schedulePreview.cancel?.();
        scheduleAppearanceRender.cancel?.();
        for (const stop of Array.from(activeDrags)) stop();
        K.helpers.cleanupDOM(root);
        activeChooser?.close();
        activeNameDialog?.close();
        if (focusOverlay) { if (focusedHome) focusedHome.appendChild(root); focusOverlay.remove(); focusOverlay = null; }
        resizeObserver?.disconnect();
        root.removeEventListener("input", onWorkspaceInput, true);
        root.removeEventListener("change", onWorkspaceChange, true);
        root.removeEventListener("wheel", onWorkspaceWheel);
        document.removeEventListener("keydown", onWorkspaceKey);
      },
      getState: function () { return cloneJson(state); },
      applyPreset: applyWorkspacePreset,
      randomize: resolveRandom,
      focusEditor: focusEditor,
      recordExecution: recordExecution,
      getExecutionHistory: function () { return executionHistory.slice(); },
      getExecutionRecords: function () { return cloneJson(executionRecords); },
    };
  }

  K.createWizardWidget = createWizardWidget;
})();
