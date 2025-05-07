// src/modules/captureLogic.js
  import { getValue, captureValues, combinationValue } from './deck';

  export class CaptureValidator {

      /**
       * Finds all valid sets of table items that can be captured by the played card.
       * Includes rank matches, value matches (A=14), combination sums (A=1),
       * and direct build value matches (A=1).
       * Ensures items have IDs.
       * @param {object} playedCard - The card played from the hand.
       * @param {array} tableItems - Current items on the table (cards, builds, pairs).
       * @returns {array<array<object>>} - An array of valid capture sets. Each set is an array of table items.
       */
      static getValidCaptures(playedCard, tableItems) {
          if (!playedCard || !tableItems || !Array.isArray(tableItems)) return [];

          const validCaptureSets = [];
          const playedRank = playedCard.rank;
          const playedCaptureValue = captureValues[playedRank]; // Value for build capture (A=14, J=11...)
          const playedCombinationValue = combinationValue(playedRank); // Value for sum/direct match (A=1, 2=2...)
          const isPlayedCardNumeric = !['J', 'Q', 'K'].includes(playedRank); // Ace is numeric here

          // Filter out invalid items early
          const validTableItems = tableItems.filter(item => item && item.id && item.type);

          // --- 1. Capture by Rank (Cards and Pairs) ---
          const rankMatchItems = validTableItems.filter(
              item =>
                  ((item.type === 'card' && item.rank === playedRank) ||
                   (item.type === 'pair' && item.rank === playedRank))
          );
          if (rankMatchItems.length > 0) {
              // Rank capture takes ALL matching rank items (cards and pairs) together
              validCaptureSets.push([...rankMatchItems]);
          }

          // --- 2. Capture by Value (Only for Numeric Cards: 2-10, A) ---
          if (isPlayedCardNumeric) {
              // --- 2a. Capture Builds by Capture Value (A=14, etc.) ---
              // Note: Standard Casino usually uses combination value (A=1) for build capture too.
              // Let's align with that common rule. If A=14 is needed, adjust here.
              // Using playedCombinationValue (A=1) for build capture:
              const buildValueMatches = validTableItems.filter(
                  item =>
                      item.type === 'build' &&
                      item.value === playedCombinationValue // Match build value (A=1)
              );
              // Each matching build is an independent capture option
              buildValueMatches.forEach(build => {
                  validCaptureSets.push([build]);
              });

              // --- 2b. Capture Combinations Summing to Combination Value (A=1) ---
              // Items eligible for combinations: individual numeric cards (Ace=1) and *all* Builds (using their value)
              // PAIRS CANNOT BE USED IN VALUE COMBINATIONS
              const combinableItems = validTableItems.filter(
                  item =>
                      (item.type === 'card' && !['J', 'Q', 'K'].includes(item.rank)) || // Numeric cards (A=1)
                      (item.type === 'build') // All builds (single or compound)
              );

              if (combinableItems.length > 0) {
                  const n = combinableItems.length;
                  // Iterate through all possible subsets of combinable items
                  for (let i = 1; i < (1 << n); i++) { // Start from 1 to exclude empty set
                      const subset = [];
                      let currentSum = 0;
                      let containsBuild = false; // Flag to check if subset contains a build

                      for (let j = 0; j < n; j++) {
                          if ((i >> j) & 1) { // If the j-th item is in the subset
                              const item = combinableItems[j];
                              subset.push(item);
                              // Use combination value (Ace=1 for cards, build.value for builds)
                              currentSum += (item.type === 'card' ? combinationValue(item.rank) : item.value);
                              if (item.type === 'build') {
                                  containsBuild = true;
                              }
                          }
                      }

                      // Add the subset if it sums correctly AND it's not just a single build
                      // (single builds are handled separately in 2a)
                      if (currentSum === playedCombinationValue && subset.length > 0) {
                          if (subset.length > 1 || (subset.length === 1 && subset[0].type === 'card')) {
                             validCaptureSets.push(subset);
                          }
                          // If subset is just a single build, it was already added in 2a, so we don't add it again here.
                      }
                  }
              }
          }

          // --- 3. Remove duplicate sets ---
          // (Using IDs ensures object reference differences don't create duplicates)
          const uniqueSets = [];
          const seenSetSignatures = new Set();

          validCaptureSets.forEach(set => {
              // Ensure set is valid and items have IDs before creating signature
              if (set && Array.isArray(set) && set.length > 0 && set.every(item => item && item.id)) {
                  const signature = set.map(item => item.id).sort().join(',');
                  if (!seenSetSignatures.has(signature)) {
                      seenSetSignatures.add(signature);
                      uniqueSets.push(set);
                  }
              } else if (set && Array.isArray(set) && set.length > 0) {
                  // Log error if items are missing IDs but the set structure is otherwise okay
                  console.error("Capture set generation error: item missing ID in potential set:", set);
              }
          });

          return uniqueSets;
      }
  }

  // Helper function to compare if two arrays of items are the same set (order-independent)
  export const areItemSetsEqual = (set1, set2) => {
      if (!set1 || !set2 || !Array.isArray(set1) || !Array.isArray(set2) || set1.length !== set2.length) {
          return false;
      }
      // Ensure items have IDs before comparing
      if (!set1.every(item => item && item.id) || !set2.every(item => item && item.id)) {
          console.error("areItemSetsEqual Error: Attempted to compare sets with missing IDs");
          return false; // Cannot compare reliably
      }
      const ids1 = set1.map(item => item.id).sort();
      const ids2 = set2.map(item => item.id).sort();
      return ids1.every((id, index) => id === ids2[index]);
  };
