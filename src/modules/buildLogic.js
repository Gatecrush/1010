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
 * Validates if a build action is possible using direct checks for initiation paths
 * and modification path, with refined error reporting.
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

  // --- Helper: Check for holding card ---
  const checkHolding = (value) => playerHand.some(card =>
        card && card.suitRank !== playedCard.suitRank && getBuildValue(card) === value
  );
  // --- Helper: Check for duplicate build ---
  const checkDuplicate = (value, excludeBuildId = null) => tableItems.some(item =>
        item && item.id && item.type === 'build' &&
        item.value === value && item.controller === currentPlayer &&
        item.id !== excludeBuildId
  );

  // --- Validate Based on Case ---
  if (!isModification) {
      // --- INITIATION Case ---
      const summingItems = selectedItems; // All selected items must be cards
      if (summingItems.some(item => item.type !== 'card')) {
           return { isValid: false, message: "To start a build, select only cards from the table." };
      }
      if (summingItems.length === 0) {
           return { isValid: false, message: "Select cards from the table to build with." };
      }
      const sumOfSelected = summingItems.reduce((sum, item) => sum + getItemValue(item), 0);

      let addPathValid = false;
      let matchPathValid = false;
      let addPathError = null;
      let matchPathError = null;

      // --- Evaluate Adding Path ---
      const targetAdding = playedCardValue + sumOfSelected;
      if (targetAdding > 0) {
          const holdingAdding = checkHolding(targetAdding);
          const duplicateAdding = checkDuplicate(targetAdding);
          if (holdingAdding && !duplicateAdding) {
              addPathValid = true;
          } else {
              // Store specific error for adding path
              if (duplicateAdding) addPathError = `Cannot build ${targetAdding}, you already control a build of that value.`;
              else if (!holdingAdding) addPathError = `Invalid build. You might need a ${targetAdding} in hand.`;
          }
      }

      // --- Evaluate Matching Path ---
      const targetMatching = sumOfSelected;
      if (targetMatching > 0 && playedCardValue === targetMatching) {
          const holdingMatching = checkHolding(targetMatching); // Need *another* card of this value
          const duplicateMatching = checkDuplicate(targetMatching);
          if (holdingMatching && !duplicateMatching) {
               matchPathValid = true;
          } else {
               // Store specific error for matching path
               if (duplicateMatching) matchPathError = `Cannot build ${targetMatching}, you already control a build of that value.`;
               else if (!holdingMatching) matchPathError = `Invalid build. You need another ${targetMatching} in hand.`;
          }
      }

      // --- Return Result ---
      if (addPathValid) {
           return {
              isValid: true, buildValue: targetAdding, isModification: false,
              targetBuild: null, summingItems: summingItems, cascadingItems: [],
              message: `Build ${targetAdding} is valid.`
          };
      }
      if (matchPathValid) {
           return {
              isValid: true, buildValue: targetMatching, isModification: false,
              targetBuild: null, summingItems: summingItems, cascadingItems: [],
              message: `Build ${targetMatching} is valid.`
          };
      }

      // If neither path valid, return the most relevant error
      // Prioritize duplicate errors, then missing holding card errors
      return { isValid: false, message: addPathError?.includes("already control") || matchPathError?.includes("already control")
                                        ? (addPathError?.includes("already control") ? addPathError : matchPathError)
                                        : (matchPathError?.includes("need another") ? matchPathError : addPathError)
                                        || "Invalid build initiation." };


  } else {
      // --- MODIFICATION Case ---
      const otherSelectedItems = selectedItems.filter(item => item.id !== targetBuild.id);
      // Modification currently assumes all other selected items contribute to the sum.
      if (otherSelectedItems.some(item => !item || !item.id || (item.type !== 'card' && !(item.type === 'build' && !item.isCompound)))) {
           return { isValid: false, message: "Invalid item selected for modifying build." };
      }

      const sumOfOthers = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
      const targetMod = playedCardValue + sumOfOthers + getItemValue(targetBuild);

      if (targetMod <= 0) {
          return { isValid: false, message: "Modification results in invalid build value." };
      }

      const holdingMod = checkHolding(targetMod);
      const duplicateMod = checkDuplicate(targetMod, targetBuild.id); // Exclude target build itself

      if (holdingMod && !duplicateMod) {
          return {
              isValid: true, buildValue: targetMod, isModification: true,
              targetBuild: targetBuild, summingItems: otherSelectedItems, cascadingItems: [], // Simplified: assumes others are summing
              message: `Build ${targetMod} is valid.`
          };
      } else {
          // Provide specific error for modification failure
          if (duplicateMod) {
               return { isValid: false, message: `Cannot modify build to ${targetMod}, you already control another build of that value.` };
          } else if (!holdingMod) {
              return { isValid: false, message: `Invalid modification. You need a ${targetMod} in hand.` };
          } else {
              return { isValid: false, message: "Invalid build modification." };
          }
      }
  }
};
