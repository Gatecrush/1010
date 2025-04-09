// src/modules/gameLogic.js
    export class CasinoGameEngine {
      constructor(players) {
        this.players = players;
        this.currentPlayerIndex = 0;
        this.tableCards = [];
        this.builds = [];
        this.deck = new Deck();
        this.scores = { [players[0].id]: 0, [players[1].id]: 0 };
      }

      // Enhanced card value mapping
      static cardValues = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
        '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 // Keep Ace high for captures
      };

      // Build-specific values (Ace = 1)
      static buildValues = {
        ...CasinoGameEngine.cardValues,
        'A': 1
      };
    }
