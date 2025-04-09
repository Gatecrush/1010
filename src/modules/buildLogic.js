// src/modules/buildLogic.js
import { getValue } from './deck';

// Helper to get the build value of a card (Ace=1)
const getBuildValue = (card) => {
    if (!card) return 0;
    // Ensure rank is treated as a number if possible, using getValue which handles J/Q/K/A correctly for building
    return getValue(card.rank); // getValue should return 1 for Ace here
};

// Helper to get the value of a table item for building (card or simple build)
const getItemValue = (item) => {
  if (!item) return 0;
  if (item.type === 'card') {
    // Face cards have no build value
    if (['J', 'Q', 'K'].includes(item.rank)) return 0;
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
export const validateBuild = (playedCard, selectedItems, playerHand) => {
  if (!playedCard || selectedItems.length === 0) {
    return { isValid: false, message: "Select a card from hand and items from table." };
  }

  // Rule: Cannot use face cards in builds (either played or selected)
  if (isFaceCard(playedCard) || selectedItems.some(item => item.type === 'card' && isFaceCard(item))) {
      return { isValid: false, message: "Face cards cannot be used in builds." };
  }
  // Rule: Cannot build *on* a compound build or a pair
  if (selectedItems.some(item => (item.type === 'build' && item.isCompound) || item.type === 'pair')) {
      return { isValid: false, message: "Cannot modify or add to compound builds or pairs." };
  }

  const playedCardValue = getBuildValue(playedCard);
  // Ensure selected items contribute valid values (getItemValue returns 0 for invalid types)
  const selectedItemsValue = selectedItems.reduce((sum, item) => sum + getItemValue(item), 0);

  // If any selected item had 0 value (was pair/compound build), the sum might be wrong, but the earlier check handles this.
  // However, if a selected card was a face card, getItemValue would return 0, leading to incorrect targetValue.
  // The face card check at the beginning prevents this specific issue.

  const targetValue = playedCardValue + selectedItemsValue;

  // Rule: Must hold a card matching the target build value IN HAND
  const hasCapturingCard = playerHand.some(handCard =>
      getBuildValue(handCard) === targetValue &&
      handCard.suitRank !== playedCard.suitRank
  );

  if (!hasCapturingCard) {
    return { isValid: false, targetValue, message: `You must hold a card matching the build value (${targetValue}) in your hand.` };
  }

  // Check if modifying an existing simple build
  const existingBuildIndex = selectedItems.findIndex(item => item.type === 'build' && !item.isCompound);
  const isModification = existingBuildIndex !== -1;
  const targetBuild = isModification ? selectedItems[existingBuildIndex] : null;

  if (isModification && selectedItems.filter(item => item.type === 'build').length > 1) {
      return { isValid: false, message: "Cannot modify multiple builds at once." };
  }

  return { isValid: true, targetValue, isModification, targetBuild, message: `Build ${targetValue} is valid.` };
};
