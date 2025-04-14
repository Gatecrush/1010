// src/modules/buildLogic.js
import { getValue } from './deck'; // Assuming getValue handles Ace=1 for builds

// Helper to get the build value of a card (Ace=1)
const getBuildValue = (card) => {
    if (!card) return 0;
    if (card.rank === 'A') return 1;
    if (["J", "Q", "K"].includes(card.rank)) return 0; // Face cards have no build value
    const numRank = parseInt(card.rank);
    return isNaN(numRank) ? 0 : numRank;
};


// Helper to get the value of a table item for building/matching (card or simple build)
const getItemValue = (item) => {
  if (!item) return 0;
  if (!item.type) { console.error("Item missing type:", item); return 0; }
  if (item.type === 'card') {
    if (!item.rank) { console.error("Card item missing rank:", item); return 0; }
    return getBuildValue(item); // Use Ace=1, JQK=0
  }
  if (item.type === 'build') {
     if (item.isCompound) return 0; // Compound builds have no value here
     if (typeof item.value !== 'number') { console.error("Build item missing value:", item); return 0; }
     return item.value;
  }
  return 0; // Pairs or other types have no value here
};

// Helper to check if a card is a face card
const isFaceCard = (card) => {
    if (!card || !card.rank) return false;
    return ['J', 'Q', 'K'].includes(card.rank);
}

/**
 * Validates if a build action is possible, handling both initiation methods (adding/matching)
 * and modification with complex selections.
 */
export const validateBuild = (playedCard, selectedItems, playerHand, tableItems, currentPlayer) => {
  // --- Initial Checks ---
  if (!playedCard || !selectedItems || selectedItems.length === 0) {
    return { isValid: false, message: "Select a card from hand and items from table." };
  }
  if (!selectedItems.every(item => item && item.id)) {
      return { isValid: false, message: "Internal error: Invalid items selected." };
  }
  if (isFaceCard(playedCard) || selectedItems.some(item => item.type === 'card' && isFaceCard(item))) {
      return { isValid: false, message: "Face cards cannot be used in builds." };
  }
  if (selectedItems.some(item => item.type === 'pair' || (item.type === 'build' && item.isCompound))) {
      return { isValid: false, message: "Cannot select pairs or compound builds for building." };
  }
  const playedCardValue = getBuildValue(playedCard);
  if (playedCardValue === 0 && !isFaceCard(playedCard)) { // Allow face cards if rules change, but value 0 is invalid for build
      return { isValid: false, message: "Played card has no build value." };
  }

  // --- Determine Case: Initiation vs Modification ---
  let targetBuild = null;
  const selectedBuilds = selectedItems.filter(item => item.type === 'build');

  if (selectedBuilds.length > 1) {
      return { isValid: false, message: "Cannot select more than one existing build." };
  } else if (selectedBuilds.length === 1) {
      targetBuild = selectedBuilds[0];
      if (!targetBuild || !targetBuild.id) {
           return { isValid: false, message: "Internal error: Invalid target build." };
      }
  }
  const isModification = !!targetBuild;

  // --- Validate Based on Case ---
  if (!isModification) {
      // --- INITIATION Case ---
      const summingItems = selectedItems; // All selected items must be cards
      if (summingItems.some(item => item.type !== 'card')) {
           return { isValid: false, message: "To start a build, select only cards from the table." };
      }
      if (summingItems.length === 0) {
           return { isValid: false, message: "Select cards from the table to build with." }; // Cannot initiate with only played card
      }

      const sumOfSelected = summingItems.reduce((sum, item) => sum + getItemValue(item), 0);

      // --- Try Path 1: Played Card ADDS to Selected Cards ---
      const targetValueAdding = playedCardValue + sumOfSelected;
      if (targetValueAdding > 0) {
          const holdingAdding = playerHand.some(handCard =>
              handCard && handCard.suitRank !== playedCard.suitRank &&
              getBuildValue(handCard) === targetValueAdding
          );
          const duplicateAdding = tableItems.some(item =>
              item && item.id && item.type === 'build' &&
              item.value === targetValueAdding && item.controller === currentPlayer
          );

          if (holdingAdding && !duplicateAdding) {
              // Valid "Adding" Initiation
              return {
                  isValid: true,
                  buildValue: targetValueAdding,
                  isModification: false,
                  targetBuild: null,
                  summingItems: summingItems, // The selected cards
                  cascadingItems: [],
                  message: `Build ${targetValueAdding} is valid.`
              };
          }
      }

      // --- Try Path 2: Played Card MATCHES Selected Cards Sum ---
      const targetValueMatching = sumOfSelected;
      if (targetValueMatching > 0 && playedCardValue === targetValueMatching) {
           const holdingMatching = playerHand.some(handCard =>
              handCard && handCard.suitRank !== playedCard.suitRank &&
              getBuildValue(handCard) === targetValueMatching
          );
          const duplicateMatching = tableItems.some(item =>
              item && item.id && item.type === 'build' &&
              item.value === targetValueMatching && item.controller === currentPlayer
          );

           if (holdingMatching && !duplicateMatching) {
               // Valid "Matching" Initiation
               return {
                  isValid: true,
                  buildValue: targetValueMatching,
                  isModification: false,
                  targetBuild: null,
                  summingItems: summingItems, // The selected cards
                  cascadingItems: [],
                  message: `Build ${targetValueMatching} is valid.`
              };
           }
      }

      // If neither path worked
      if (targetValueAdding > 0 && !playerHand.some(c => getBuildValue(c) === targetValueAdding)) {
           return { isValid: false, message: `Invalid build. You might need a ${targetValueAdding} in hand.` };
      } else {
           return { isValid: false, message: "Invalid build initiation." };
      }

  } else {
      // --- MODIFICATION Case ---
      // (Using the complex subset logic from previous steps)
      const otherSelectedItems = selectedItems.filter(item => item.id !== targetBuild.id);
      if (otherSelectedItems.some(item => !item || !item.id || (item.type !== 'card' && !(item.type === 'build' && !item.isCompound)))) {
           return { isValid: false, message: "Invalid item selected for modifying build." };
      }

      const n = otherSelectedItems.length;
      for (let i = 0; i < (1 << n); i++) { // i=0 means only played card adds value
          const currentSummingGroup = [];
          const currentRemainingIds = new Set(otherSelectedItems.map(item => item.id));
          let summingGroupValue = 0;

          for (let j = 0; j < n; j++) {
              if ((i >> j) & 1) {
                  const item = otherSelectedItems[j];
                  if (!item || !item.id) continue;
                  currentSummingGroup.push(item);
                  summingGroupValue += getItemValue(item);
                  currentRemainingIds.delete(item.id);
              }
          }

          const currentBuildValue = playedCardValue + summingGroupValue + getItemValue(targetBuild);
          if (currentBuildValue <= 0) continue;

          const currentRemainingItems = otherSelectedItems.filter(item => currentRemainingIds.has(item.id));

          // Check 1: Matching Group
          if (currentRemainingItems.some(item => getItemValue(item) !== currentBuildValue)) {
              continue;
          }
          // Check 2: Holding Card
          const hasHoldingCard = playerHand.some(handCard =>
              handCard && handCard.suitRank !== playedCard.suitRank &&
              getBuildValue(handCard) === currentBuildValue
          );
          if (!hasHoldingCard) {
              continue;
          }
          // Check 3: Duplicate Build
          const existingPlayerBuildOfValue = tableItems.find(item =>
              item && item.id && item.type === 'build' &&
              item.value === currentBuildValue &&
              item.controller === currentPlayer &&
              item.id !== targetBuild.id
          );
          if (existingPlayerBuildOfValue) {
              continue;
          }

          // If all checks passed for this subset
          return {
              isValid: true,
              buildValue: currentBuildValue,
              isModification: true,
              targetBuild: targetBuild,
              summingItems: currentSummingGroup,
              cascadingItems: currentRemainingItems,
              message: `Build ${currentBuildValue} is valid.`
          };
      } // End subset loop for modification

      // If no valid modification combination found
      const fullSumValue = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
      const potentialFullTarget = playedCardValue + fullSumValue + getItemValue(targetBuild);
      const needsHoldingCardCheck = playerHand.some(handCard =>
            handCard && handCard.suitRank !== playedCard.suitRank &&
            getBuildValue(handCard) === potentialFullTarget
        );

      if (potentialFullTarget > 0 && !needsHoldingCardCheck) {
           return { isValid: false, message: `Invalid combination. You might need a ${potentialFullTarget} in hand.` };
      } else {
           return { isValid: false, message: "Invalid build modification selected." };
      }
  }
};
