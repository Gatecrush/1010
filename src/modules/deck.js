// src/modules/deck.js

// Default value (Ace=1, J/Q/K=10) - Used for combinations/scoring
export const getValue = (rank) => {
  if (["J", "Q", "K"].includes(rank)) return 10;
  if (rank === "A") return 1;
  // Ensure rank is treated as a string for parseInt, handle potential non-numeric ranks gracefully
  const parsedValue = parseInt(String(rank), 10);
  return isNaN(parsedValue) ? 0 : parsedValue; // Return 0 if not a number
};

// Value map for captures (Ace=14, J=11, Q=12, K=13)
export const captureValues = {
    'A': 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
};

// Value for combinations/building (Ace=1)
export const combinationValue = (rank) => rank === 'A' ? 1 : getValue(rank);


export const createDeck = () => {
  const suits = ["C", "D", "H", "S"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck = [];

  for (let suit of suits) {
    for (let rank of ranks) {
      // Store default value (Ace=1) and capture value (Ace=14) if needed, or calculate on the fly
      deck.push({
          suit,
          rank,
          value: getValue(rank), // Default value (Ace=1)
          // captureValue: captureValues[rank], // Optional: store capture value directly
          suitRank: suit + rank
        });
    }
  }
  return deck;
};

export const shuffleDeck = (deck) => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
};
