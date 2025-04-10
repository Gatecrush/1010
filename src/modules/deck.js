// src/modules/deck.js

// Value for scoring points (Ace=1, 10D=2, 2S=1, others=0 for point cards)
// Also used for general card counting value where Ace=1, faces=10
export const getScoringValue = (rank) => {
  if (["J", "Q", "K"].includes(rank)) return 10; // Used for card counting if needed, not direct points
  if (rank === "A") return 1;
  const parsedValue = parseInt(String(rank), 10);
  return isNaN(parsedValue) ? 0 : parsedValue;
};

// Value map for direct captures (Ace=14, J=11, Q=12, K=13) - Used ONLY for value combinations, NOT build capture
// NOTE: This might be confusing. Let's reconsider its use vs rank matching.
// For now, keep it for potential combination captures, but build capture logic will be separate.
export const captureCombinationValues = {
    'A': 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
};

// Value for summing cards in combinations or builds (Ace=1, 2-10 face value)
export const combinationValue = (rank) => {
    if (rank === 'A') return 1;
    if (["J", "Q", "K"].includes(rank)) return 0; // Face cards have no value in sums
    const parsedValue = parseInt(String(rank), 10);
    return isNaN(parsedValue) ? 0 : parsedValue;
};

// Helper to check if a card rank can capture a specific build sum value
export const canRankCaptureBuildValue = (cardRank, buildValue) => {
    if (buildValue < 1 || buildValue > 10) return false; // Invalid build value

    if (buildValue === 1) {
        return cardRank === 'A';
    } else if (buildValue >= 2 && buildValue <= 9) {
        // Check if cardRank is numerically equal to buildValue
        const cardValue = parseInt(String(cardRank), 10);
        return !isNaN(cardValue) && cardValue === buildValue;
    } else if (buildValue === 10) {
        return ['10', 'J', 'Q', 'K'].includes(cardRank);
    }
    return false;
};


export const createDeck = () => {
  const suits = ["C", "D", "H", "S"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck = [];

  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({
          suit,
          rank,
          // value: getScoringValue(rank), // Maybe remove this default 'value' to avoid confusion
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
