// dealing.js
    export const dealInitialCards = (deck) => {
      const p1Hand = [];
      const p2Hand = [];
      const table = [];
      const dealtCards = new Set();

      const dealCard = (target) => {
        if (deck.length > 0) {
          let card;
          do {
            card = deck.pop();
          } while (dealtCards.has(card.suitRank) && deck.length > 0); // Ensure no duplicates

          if (!dealtCards.has(card.suitRank)) {
            dealtCards.add(card.suitRank);
            target.push(card);
          } else {
            // If duplicate found and no cards left, return null
            console.warn("No unique cards left in deck!");
            return null;
          }
        }
      };

      for (let i = 0; i < 4; i++) {
        dealCard(p1Hand);
        dealCard(p2Hand);
        dealCard(table);
      }

      return {
        p1Hand,
        p2Hand,
        table,
        updatedDeck: [...deck],
      };
    };
