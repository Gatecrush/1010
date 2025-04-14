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
  // Allow playedCardValue of 0 only if it's a face card (future proofing, though currently disallowed)
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
  let validationResult = { isValid: false, message: "Invalid build combination." }; // Default failure

  const potentialHoldingCards = playerHand.filter(card =>
      card && card.suitRank !== playedCard.suitRank && getBuildValue(card) > 0
  );

  for (const holdingCard of potentialHoldingCards) {
      const targetValue = getBuildValue(holdingCard);
      let currentSummingItems = []; // Items used to reach target in this iteration
      let isValidForThisTarget = false;

      // --- Check Duplicate Build (Common Check) ---
      const duplicateExists = tableItems.some(item =>
          item && item.id && item.type === 'build' &&
          item.value === targetValue && item.controller === currentPlayer &&
          (!targetBuild || item.id !== targetBuild.id) // Exclude the one being modified
      );
      if (duplicateExists) {
          // Store potential error message but continue checking other holding cards
          validationResult = { isValid: false, message: `Cannot build ${targetValue}, you already control a build of that value.` };
          continue; // Try next holding card
      }

      // --- Validate based on Case (Initiation vs Modification) ---
      if (!isModification) {
          // --- INITIATION Case ---
          const summingItems = selectedItems; // All selected items must be cards
          if (summingItems.some(item => item.type !== 'card')) continue; // Invalid selection for initiation

          const sumOfSelected = summingItems.reduce((sum, item) => sum + getItemValue(item), 0);

          // Path 1: Adding Path (Played card + selected = target)
          const neededFromTableAdding = targetValue - playedCardValue;
          if (neededFromTableAdding >= 0 && sumOfSelected === neededFromTableAdding) {
              isValidForThisTarget = true;
              currentSummingItems = summingItems;
          }

          // Path 2: Matching Path (Played card = target, selected = target)
          // This holding card must match the target, which is checked by the loop.
          // We need played card to match target, and selected to match target.
          if (!isValidForThisTarget && // Only check if adding path failed
              playedCardValue === targetValue &&
              sumOfSelected === targetValue) {
               isValidForThisTarget = true;
               currentSummingItems = summingItems;
          }

      } else {
          // --- MODIFICATION Case ---
          const otherSelectedItems = selectedItems.filter(item => item.id !== targetBuild.id);
          // Ensure other items are valid for modification (cards or simple builds)
          if (otherSelectedItems.some(item => !item || !item.id || (item.type !== 'card' && !(item.type === 'build' && !item.isCompound)))) {
              continue; // Invalid items selected with target build
          }

          const neededFromTable = targetValue - playedCardValue - getItemValue(targetBuild);

          if (neededFromTable >= 0) {
              const sumOfOthers = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
              if (sumOfOthers === neededFromTable) {
                  isValidForThisTarget = true;
                  currentSummingItems = otherSelectedItems; // These are the items summed *with* the played card and target build
              }
          }
          // Note: Complex subset/cascading logic for modification is removed in this approach for simplicity.
          // It assumes all 'otherSelectedItems' contribute to the sum needed.
      }

      // --- If Valid Combination Found for this Target ---
      if (isValidForThisTarget) {
          validBuildFound = true;
          validationResult = {
              isValid: true,
              buildValue: targetValue,
              isModification: isModification,
              targetBuild: targetBuild,
              // If modifying, summingItems are 'otherSelectedItems', otherwise they are 'selectedItems'
              summingItems: currentSummingItems,
              cascadingItems: [], // Cascading not handled in this simplified approach
              message: `Build ${targetValue} is valid.`
          };
          break; // Found a valid build, exit loop
      }
  } // End holding card loop

  // If loop finished and no valid build found, provide best guess error
  if (!validBuildFound && validationResult.isValid === false) {
      // If the default message is still there, try to provide a holding card hint
      if (validationResult.message === "Invalid build combination.") {
           // Calculate potential target based on adding everything, as a guess
           const potentialTarget = playedCardValue + selectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
           if (potentialTarget > 0) {
               validationResult.message = `Invalid build. Check if you hold a ${potentialTarget} or if the combination is valid.`;
           }
      }
  }

  return validationResult;
};
