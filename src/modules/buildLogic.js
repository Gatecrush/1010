// src/modules/buildLogic.js
    import { getValue } from './deck';

    // Helper to get the build value of a card (Ace=1)
    const getBuildValue = (card) => {
      if (!card) return 0;
      return card.rank === 'A' ? 1 : getValue(card.rank);
    };

    // Helper to get the value of a table item for building (card or simple build)
    const getItemValue = (item) => {
      if (!item) return 0;
      if (item.type === 'card') {
        return getBuildValue(item);
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
     * Validates if a build action is possible, including increasing existing builds.
     */
    export const validateBuild = (playedCard, selectedItems, playerHand, tableItems, currentPlayer) => {
      if (!playedCard || selectedItems.length === 0) {
        return { isValid: false, message: "Select a card from hand and items from table." };
      }

      // Rule: Cannot use face cards
      if (isFaceCard(playedCard) || selectedItems.some(item => item.type === 'card' && isFaceCard(item))) {
        return { isValid: false, message: "Face cards cannot be used in builds." };
      }
      // Rule: Cannot build *on* or *select* compound builds or pairs for building
      if (selectedItems.some(item => (item.type === 'build' && item.isCompound) || item.type === 'pair')) {
        return { isValid: false, message: "Cannot use compound builds or pairs in building." };
      }

      const playedCardValue = getBuildValue(playedCard);
      let totalSelectedValue = selectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
      let buildValue = playedCardValue + totalSelectedValue;

      // Check if increasing an existing build
      let targetBuild = null;
      if (selectedItems.length === 1 && selectedItems[0].type === 'build' && selectedItems[0].controller === currentPlayer) {
        targetBuild = selectedItems[0];
        buildValue = playedCardValue + targetBuild.value;
        totalSelectedValue = targetBuild.value; // Adjust totalSelectedValue for message
      }

      // Verify player has at least one card that can capture this build
      if (!playerHand.some(card => getBuildValue(card) === buildValue)) {
        return { isValid: false, message: "You must have a card in hand that can capture this build." };
      }

      // Check if the build value is valid (not exceeding 10)
      if (buildValue > 10) {
        return { isValid: false, message: "Build value cannot exceed 10." };
      }

      // If all checks pass
      return { isValid: true, buildValue: buildValue, targetBuild: targetBuild, message: `Build ${buildValue} is valid.` };
    };
