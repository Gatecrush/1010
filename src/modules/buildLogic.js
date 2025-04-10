// src/modules/buildLogic.js
import { getValue } from './deck';

// Helper to get the build value of a card (Ace=1)
const getBuildValue = (card) => {
    if (!card) return 0;
    // Ensure rank is treated as a number if possible, default Ace to 1
    if (card.rank === 'A') return 1;
    const numRank = parseInt(card.rank);
    return isNaN(numRank) ? 0 : numRank; // Return 0 for non-numeric ranks (J,Q,K)
};


// Helper to get the value of a table item for building (card or simple build)
const getItemValue = (item) => {
  if (!item) return 0;
  if (item.type === 'card') {
    return getBuildValue(item); // Use Ace=1
  }
  if (item.type === 'build' && !item.isCompound) {
    return item.value;
  }
  // Pairs and compound builds cannot be built upon
  return 0;
};

// Helper to check if a card is a face card
const isFaceCard = (card) => {
    return ['J', 'Q', 'K'].includes(card.rank);
}

/**
 * Validates if a build action is possible.
 */
export const validateBuild = (playedCard, selectedItems, playerHand, tableItems, currentPlayer) => {
  if (!playedCard || selectedItems.length === 0) {
    return { isValid: false, message: "Select a card from hand and items from table." };
  }

  // Rule: Cannot use face cards in builds
  if (isFaceCard(playedCard) || selectedItems.some(item => item.type === 'card' && isFaceCard(item))) {
      return { isValid: false, message: "Face cards cannot be used in builds." };
  }
  // Rule: Cannot build *on* a compound build or a pair
  if (selectedItems.some(item => (item.type === 'build' && item.isCompound) || item.type === 'pair')) {
      return { isValid: false, message: "Cannot modify or add to compound builds or pairs." };
  }
  // Rule: Cannot select multiple builds at once
  if (selectedItems.filter(item => item.type === 'build').length > 1) {
      return { isValid: false, message: "Cannot modify multiple builds at once." };
  }

  const playedCardValue = getBuildValue(playedCard);

  // Check if modifying an existing simple build (it must be the only build selected)
  const targetBuild = selectedItems.find(item => item.type === 'build' && !item.isCompound);
  const isModification = !!targetBuild; // True if targetBuild is found

  let targetValue;
  let isAddingSet = false;

  if (isModification) {
      // --- Scenario: Modifying/Adding to an Existing Build ---
      const otherSelectedCards = selectedItems.filter(item => item.type === 'card');
      const otherSelectedValue = otherSelectedCards.reduce((sum, item) => sum + getItemValue(item), 0);
      const newValueFromAddition = playedCardValue + otherSelectedValue;

      if (newValueFromAddition === targetBuild.value) {
          // Case 1: Adding a set of the same value to the existing build
          targetValue = targetBuild.value;
          isAddingSet = true;
          // Need to hold a card matching the build's value
          const hasCapturingCard = playerHand.some(handCard =>
              getBuildValue(handCard) === targetValue &&
              handCard.suitRank !== playedCard.suitRank
          );
          if (!hasCapturingCard) {
              return { isValid: false, targetValue, message: `You must hold a ${targetValue} in hand to add to this build.` };
          }
      } else {
          // Case 2: Changing the value of the existing build (Not explicitly supported by rules yet, treat as invalid for now or implement later)
          // For now, let's disallow changing the value directly this way.
          // targetValue = playedCardValue + otherSelectedValue + targetBuild.value; // This would be the new value
          // isAddingSet = false;
          // // Need to hold a card matching the *new* target value
          // const hasCapturingCard = playerHand.some(handCard => getBuildValue(handCard) === targetValue && handCard.suitRank !== playedCard.suitRank);
          // if (!hasCapturingCard) {
          //     return { isValid: false, targetValue, message: `You must hold a ${targetValue} in hand to change the build value.` };
          // }
          return { isValid: false, message: "Cannot change the value of an existing build this way. Add sets of the same value or capture." };
      }

  } else {
      // --- Scenario: Creating a New Build ---
      // All selected items must be cards in this case
      if (selectedItems.some(item => item.type !== 'card')) {
          return { isValid: false, message: "Can only select cards when creating a new build." };
      }
      const selectedItemsValue = selectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
      targetValue = playedCardValue + selectedItemsValue;
      isAddingSet = false;

      // Check if player already controls a build of this value
      const existingBuildOfValue = tableItems.find(item =>
          item.type === 'build' && item.value === targetValue && item.controller === currentPlayer
      );
      if (existingBuildOfValue) {
          return { isValid: false, message: `You already have a build of ${targetValue}. Select it to add to it.` };
      }

      // Check if player holds the capturing card
      const hasCapturingCard = playerHand.some(handCard =>
          getBuildValue(handCard) === targetValue &&
          handCard.suitRank !== playedCard.suitRank
      );
      if (!hasCapturingCard) {
          return { isValid: false, targetValue, message: `You must hold a ${targetValue} in hand to create this build.` };
      }
  }

  // If all checks pass
  return { isValid: true, targetValue, isModification, isAddingSet, targetBuild, message: `Build ${targetValue} is valid.` };
};
