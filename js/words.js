/* Mafia Party — word packs
 * 5 topics × 60+ curated words each. Plain script + CommonJS export so the
 * server can reuse the same data (see server/server.js).
 */
(function (global) {
  'use strict';

  const PACKS = {
    movies: {
      name: 'Movies',
      emoji: '🎬',
      words: [
        'Titanic', 'Inception', 'Shrek', 'Dune', 'Frozen',
        'The Lion King', 'Jurassic Park', 'Star Wars', 'The Avengers', 'Spider-Man',
        'Batman', 'Superman', 'Iron Man', 'Thor', 'Harry Potter',
        'Lord of the Rings', 'The Dark Knight', 'Interstellar', 'Gladiator', 'Braveheart',
        'Rocky', 'The Terminator', 'Alien', 'Predator', 'Jaws',
        'E.T.', 'Home Alone', 'Mrs. Doubtfire', 'The Mask', 'Dumb and Dumber',
        'Mean Girls', 'The Notebook', 'La La Land', 'Grease', 'Mamma Mia',
        'Forrest Gump', 'Cast Away', 'The Shawshank Redemption', 'Pulp Fiction', 'Fight Club',
        'The Departed', 'Goodfellas', 'Casino', 'Scarface', 'The Wolf of Wall Street',
        'Django Unchained', 'Kill Bill', 'Deadpool', 'Wolverine', 'X-Men',
        'Guardians of the Galaxy', 'Black Panther', 'Toy Story', 'Finding Nemo', 'Up',
        'Coco', 'Ratatouille', 'The Godfather', 'Avatar', 'The Matrix',
        'Joker', 'Oppenheimer', 'Barbie'
      ]
    },
    space: {
      name: 'Space',
      emoji: '🚀',
      words: [
        'Comet', 'Black Hole', 'Astronaut', 'Saturn', 'Eclipse',
        'Mars', 'Jupiter', 'Neptune', 'Uranus', 'Mercury',
        'Venus', 'Pluto', 'The Moon', 'The Sun', 'Galaxy',
        'Milky Way', 'Nebula', 'Supernova', 'Meteor Shower', 'Asteroid',
        'Rocket', 'Satellite', 'Space Station', 'Telescope', 'Hubble',
        'James Webb', 'NASA', 'Cosmonaut', 'Alien', 'UFO',
        'Orbit', 'Gravity', 'Vacuum', 'The Universe', 'Big Bang',
        'Andromeda', 'Aurora', 'Northern Lights', 'Solar System', 'Planet',
        'Dwarf Planet', 'Asteroid Belt', 'Kuiper Belt', 'Halley\u2019s Comet', 'ISS',
        'Sputnik', 'Apollo', 'Artemis', 'SpaceX', 'Falcon 9',
        'Starship', 'Voyager', 'Curiosity', 'Perseverance', 'Mars Rover',
        'Lunar Eclipse', 'Solar Flare', 'Sunspot', 'Red Giant', 'White Dwarf',
        'Neutron Star', 'Pulsar', 'Quasar', 'Event Horizon', 'Wormhole',
        'Exoplanet', 'Dark Matter', 'Dark Energy', 'Space Suit', 'Zero Gravity',
        'Mission Control', 'Countdown', 'Landing', 'Spacewalk', 'Constellation'
      ]
    },
    sports: {
      name: 'Sports',
      emoji: '⚽',
      words: [
        'Football', 'Tennis', 'Karate', 'Olympics', 'Marathon',
        'Basketball', 'Baseball', 'Cricket', 'Hockey', 'Golf',
        'Rugby', 'Boxing', 'Wrestling', 'Judo', 'Taekwondo',
        'Fencing', 'Archery', 'Swimming', 'Diving', 'Surfing',
        'Skiing', 'Snowboarding', 'Ice Skating', 'Cycling', 'Sprinting',
        'Hurdles', 'Relay Race', 'Pole Vault', 'High Jump', 'Long Jump',
        'Shot Put', 'Javelin', 'Discus', 'Gymnastics', 'Volleyball',
        'Badminton', 'Table Tennis', 'Squash', 'Handball', 'Water Polo',
        'Rowing', 'Kayaking', 'Sailing', 'Triathlon', 'Decathlon',
        'Formula 1', 'MotoGP', 'Tour de France', 'World Cup', 'Super Bowl',
        'Wimbledon', 'Champions League', 'Premier League', 'NBA', 'Penalty Kick',
        'Home Run', 'Touchdown', 'Goalkeeper', 'Referee', 'Trophy',
        'Stadium', 'Cheerleader', 'Skateboarding', 'Climbing', 'Surf Lifesaving'
      ]
    },
    actors: {
      name: 'Actors',
      emoji: '🎭',
      words: [
        'Tom Hanks', 'Jackie Chan', 'Emma Watson', 'Shah Rukh Khan', 'Dwayne Johnson',
        'Leonardo DiCaprio', 'Brad Pitt', 'Angelina Jolie', 'Johnny Depp', 'Robert Downey Jr.',
        'Chris Evans', 'Chris Hemsworth', 'Scarlett Johansson', 'Will Smith', 'Morgan Freeman',
        'Samuel L. Jackson', 'Keanu Reeves', 'Matt Damon', 'Ben Affleck', 'Ryan Gosling',
        'Ryan Reynolds', 'Hugh Jackman', 'Anne Hathaway', 'Natalie Portman', 'Keira Knightley',
        'Nicole Kidman', 'Reese Witherspoon', 'Julia Roberts', 'Sandra Bullock', 'Jennifer Lawrence',
        'Margot Robbie', 'Zendaya', 'Tom Holland', 'Andrew Garfield', 'Timoth\u00e9e Chalamet',
        'Cillian Murphy', 'Christian Bale', 'Heath Ledger', 'Joaquin Phoenix', 'Denzel Washington',
        'Viola Davis', 'Meryl Streep', 'Kate Winslet', 'Al Pacino', 'Robert De Niro',
        'Anthony Hopkins', 'Daniel Day-Lewis', 'Russell Crowe', 'Mel Gibson', 'Arnold Schwarzenegger',
        'Sylvester Stallone', 'Bruce Lee', 'Jet Li', 'Donnie Yen', 'Michelle Yeoh',
        'Amitabh Bachchan', 'Salman Khan', 'Aamir Khan', 'Deepika Padukone', 'Priyanka Chopra',
        'Ranbir Kapoor', 'Kangana Ranaut', 'Vicky Kaushal', 'Rajinikanth', 'Allu Arjun'
      ]
    },
    anime: {
      name: 'Anime',
      emoji: '🐉',
      words: [
        'Naruto', 'Pikachu', 'Goku', 'One Piece', 'Attack on Titan',
        'Luffy', 'Zoro', 'Nami', 'Sasuke', 'Sakura',
        'Kakashi', 'Itachi', 'Vegeta', 'Gohan', 'Bulma',
        'Saitama', 'Genos', 'Tanjiro', 'Nezuko', 'Zenitsu',
        'Inosuke', 'Rengoku', 'Deku', 'Bakugo', 'All Might',
        'Todoroki', 'L', 'Light Yagami', 'Ryuk', 'Levi',
        'Eren', 'Mikasa', 'Armin', 'Spike Spiegel', 'Edward Elric',
        'Alphonse', 'Gon', 'Killua', 'Hisoka', 'Ichigo',
        'Rukia', 'Conan', 'Lupin', 'Astro Boy', 'Doraemon',
        'Shinchan', 'Nobita', 'Sailor Moon', 'Totoro', 'Howl',
        'Ponyo', 'No-Face', 'Haku', 'Chihiro', 'Yugi',
        'Jotaro', 'Dio', 'Mob', 'Anya', 'Gojo',
        'Itadori', 'Makima', 'Denji', 'Power', 'Rem',
        'Ram', 'Asuna', 'Kirito', 'Senku', 'Yusuke'
      ]
    }
  };

  const TOPIC_IDS = Object.keys(PACKS);

  global.Words = {
    PACKS: PACKS,
    TOPIC_IDS: TOPIC_IDS,
    /** Resolve a topic id; 'mix' returns a random concrete topic id. */
    resolve: function (topicId, rng) {
      if (topicId === 'mix') {
        const r = rng || Math.random;
        return TOPIC_IDS[Math.floor(r() * TOPIC_IDS.length)];
      }
      return topicId;
    },
    /** Pick a word for a topic, avoiding recently used words when possible. */
    pickWord: function (topicId, used, rng) {
      const r = rng || Math.random;
      const pack = PACKS[topicId];
      if (!pack) throw new Error('Unknown topic: ' + topicId);
      const pool = pack.words.filter(function (w) { return !used || !used.has(w); });
      const source = pool.length ? pool : pack.words;
      return source[Math.floor(r() * source.length)];
    },
    /** Pick the mafia's hint: a different word from the same topic. */
    pickHint: function (topicId, secretWord, rng) {
      const r = rng || Math.random;
      const pack = PACKS[topicId];
      const pool = pack.words.filter(function (w) { return w !== secretWord; });
      return pool[Math.floor(r() * pool.length)];
    },
    /** N distinct decoy words (never the secret word) for the final-guess screen. */
    pickDecoys: function (topicId, secretWord, n, rng) {
      const r = rng || Math.random;
      const pack = PACKS[topicId];
      const pool = pack.words.filter(function (w) { return w !== secretWord; });
      // partial Fisher-Yates
      for (let i = 0; i < Math.min(n, pool.length - 1); i++) {
        const j = i + Math.floor(r() * (pool.length - i));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      return pool.slice(0, n);
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.Words;
})(typeof window !== 'undefined' ? window : globalThis);
