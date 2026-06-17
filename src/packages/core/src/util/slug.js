/** @file Generates random human-friendly two-word slugs (adjective-noun). */
export let Slug;
(function (_Slug) {
  const ADJECTIVES = ["brave", "calm", "clever", "cosmic", "crisp", "curious", "eager", "gentle", "glowing", "happy", "hidden", "jolly", "kind", "lucky", "mighty", "misty", "neon", "nimble", "playful", "proud", "quick", "quiet", "shiny", "silent", "stellar", "sunny", "swift", "tidy", "witty"];
  const NOUNS = ["cabin", "cactus", "canyon", "circuit", "comet", "eagle", "engine", "falcon", "forest", "garden", "harbor", "island", "knight", "lagoon", "meadow", "moon", "mountain", "nebula", "orchid", "otter", "panda", "pixel", "planet", "river", "rocket", "sailor", "squid", "star", "tiger", "wizard", "wolf"];
  /**
   * Builds a random slug by joining a random adjective and noun with a hyphen.
   * @returns {string} A slug of the form "adjective-noun".
   */
  function create() {
    return [ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)], NOUNS[Math.floor(Math.random() * NOUNS.length)]].join("-");
  }
  _Slug.create = create;
})(Slug || (Slug = {}));