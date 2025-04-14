// src/modules/buildLogic.js
import { getValue } from './deck'; // Assuming getValue handles Ace=1 for builds

// Helper to get the build value of a card (Ace=1)
const getBuildValue = (card) => {
    if (!card || !card.rank) return 0; // Basic safety check
    if (card.rank === 'A') return 1;
    if (["J", "Q", "K"].includes(card.rank)) return 0; // Face cards have no build value
    const numRank = parseInt(card.rank);
    return isNaN(numRank) ? 0 : numRank;
};


// Helper to get the value of a table item for building/matching (card or simple build)
const getItemValue = (item) => {
  if (!item || !item.type) { console.error("Item missing type:", item); return 0; }
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
 * Validates if a build action is possible by checking against cards held in hand.
 * Correctly handles both Adding and Matching initiation paths.
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
  if (playedCardValue === 0 && !isFaceCard(playedCard)) {
      return { isValid: false, message: "Played card has no build value." };
  }

  // --- Identify Modification Target ---
  let targetBuild = null;
  const selectedBuilds = selectedItems.filter(item => item.type === 'build');

  if (selectedBuilds.length > 1) {
      return { isValid: false, message: "Cannot select more than one existing build." };
  } else if (selectedBuilds.length === 1) {
      targetBuild = selectedBuilds[0];
      if (!targetBuild || !targetBuild.id || typeof getItemValue(targetBuild) !== 'number') {
           return { isValid: false, message: "Internal error: Invalid target build." };
      }
  }
  const isModification = !!targetBuild;

  // --- Iterate through Holding Cards to find a valid Target Value ---
  let validBuildFound = false;
  // Store the most relevant error message if multiple checks fail
  let bestErrorMessage = "Invalid build combination.";

  const potentialHoldingCards = playerHand.filter(card =>
      card && card.suitRank !== playedCard.suitRank && getBuildValue(card) > 0
  );

  for (const holdingCard of potentialHoldingCards) {
      const targetValue = getBuildValue(holdingCard); // This is the target value we aim for
      let isValidForThisTarget = false;
      let currentSummingItems = []; // Reset for each holding card check

      // --- Check Duplicate Build (Common Check) ---
      const duplicateExists = tableItems.some(item =>
          item && item.id && item.type === 'build' &&
          item.value === targetValue && item.controller === currentPlayer &&
          (!targetBuild || item.id !== targetBuild.id) // Exclude the one being modified
      );
      if (duplicateExists) {
          bestErrorMessage = `Cannot build ${targetValue}, you already control a build of that value.`;
          continue; // Try next holding card, maybe another target value works
      }

      // --- Validate based on Case (Initiation vs Modification) ---
      if (!isModification) {
          // --- INITIATION Case ---
          const summingItems = selectedItems; // All selected items must be cards
          if (summingItems.some(item => item.type !== 'card')) {
              bestErrorMessage = "To start a build, select only cards from the table.";
              continue; // This selection is fundamentally wrong for initiation
          }
          if (summingItems.length === 0) {
               bestErrorMessage = "Select cards from the table to build with.";
               continue; // Cannot initiate with only played card
          }

          const sumOfSelected = summingItems.reduce((sum, item) => sum + getItemValue(item), 0);

          // Path 1: Adding Path (Played card + selected = target)
          const neededFromTableAdding = targetValue - playedCardValue;
          if (neededFromTableAdding >= 0 && sumOfSelected === neededFromTableAdding) {
              // Holding card check is implicit (targetValue comes from a holding card)
              // Duplicate check done above
              isValidForThisTarget = true;
              currentSummingItems = summingItems;
          }

          // Path 2: Matching Path (Played card = target, selected = target)
          if (!isValidForThisTarget && // Only check if adding path failed
              playedCardValue === targetValue && // Played card matches the target (derived from holding card)
              sumOfSelected === targetValue) { // Selected cards also sum to the target
               // Holding card check is implicit
               // Duplicate check done above
               isValidForThisTarget = true;
               currentSummingItems = summingItems;
          }

      } else {
          // --- MODIFICATION Case ---
          const otherSelectedItems = selectedItems.filter(item => item.id !== targetBuild.id);
          if (otherSelectedItems.some(item => !item || !item.id || (item.type !== 'card' && !(item.type === 'build' && !item.isCompound)))) {
              bestErrorMessage = "Invalid item selected for modifying build.";
              continue; // Invalid selection with target build
          }

          const neededFromTable = targetValue - playedCardValue - getItemValue(targetBuild);

          if (neededFromTable >= 0) {
              const sumOfOthers = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
              if (sumOfOthers === neededFromTable) {
                  // Holding card check is implicit
                  // Duplicate check done above
                  isValidForThisTarget = true;
                  currentSummingItems = otherSelectedItems;
              }
          }
      }

      // --- If Valid Combination Found for this Target ---
      if (isValidForThisTarget) {
          validBuildFound = true;
          // Return immediately with the successful validation
          return {
              isValid: true,
              buildValue: targetValue,
              isModification: isModification,
              targetBuild: targetBuild,
              summingItems: currentSummingItems,
              cascadingItems: [], // Cascading not handled here
              message: `Build ${targetValue} is valid.`
          };
          // No need for break, return exits the function
      } else {
          // If this holding card didn't work, update potential error message
          // Prioritize "duplicate" error, then maybe "holding card needed" based on adding path
          if (!duplicateExists) { // Don't overwrite duplicate message
             const potentialAddingTarget = playedCardValue + selectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
             // Check if the *reason* this holding card failed might be because the user *actually*
             // intended the 'adding' path which requires a different holding card.
             if (!isModification && potentialAddingTarget > 0 && potentialAddingTarget !== targetValue) {
                 const needsDifferentHolding = !playerHand.some(c => c && getBuildValue(c) === potentialAddingTarget);
                 if (needsDifferentHolding) {
                    bestErrorMessage = `Invalid build. You might need a ${potentialAddingTarget} in hand for that combination.`;
                 }
             } else if (isModification) {
                 // Similar check for modification
                 const potentialModTarget = playedCardValue + getItemValue(targetBuild) + selectedItems.filter(i => i.id !== targetBuild.id).reduce((s, i) => s + getItemValue(i), 0);
                  if (potentialModTarget > 0 && potentialModTarget !== targetValue) {
                     const needsDifferentHolding = !playerHand.some(c => c && getBuildValue(c) === potentialModTarget);
                     if (needsDifferentHolding) {
                        bestErrorMessage = `Invalid build. You might need a ${potentialModTarget} in hand for that combination.`;
                     }
                 }
             }
          }
      }
  } // End holding card loop

  // If loop finished and no valid build found
  return { isValid: false, message: bestErrorMessage };
};
