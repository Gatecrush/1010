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

      // Calculate build value differently based on what's selected
      let buildValue;
      let isCombiningWithExistingBuild = false;

      // Case 1: Adding to an existing build you control (increasing build)
      if (selectedItems.length === 1 &&
        selectedItems[0].type === 'build' &&
        selectedItems[0].controller === currentPlayer) {
        buildValue = getBuildValue(playedCard) + selectedItems[0].value;
        isCombiningWithExistingBuild = true;
      }
      // Case 2: Creating new build with table cards (ignore other builds in selection)
      else {
        // Filter out any builds from the value calculation
        const nonBuildItems = selectedItems.filter(item => item.type !== 'build');
        buildValue = getBuildValue(playedCard) +
          nonBuildItems.reduce((sum, item) => sum + getItemValue(item), 0);
      }

      // Enforce maximum build value of 10
      if (buildValue > 10) {
        return {
          isValid: false,
          message: `Build value cannot exceed 10 (tried to build ${buildValue})`
        };
      }

      // Verify player has capturing card (must be in hand, not counting the played card)
      // For builds, we look for exact value match
      const hasCaptureCard = playerHand.some(
        card => card !== playedCard && getBuildValue(card) === buildValue
      );

      if (!hasCaptureCard) {
        return {
          isValid: false,
          message: `You need a ${buildValue} in hand to capture this build.`
        };
      }

      return {
        isValid: true,
        buildValue,
        isCombiningWithExistingBuild,
        selectedItems,
        message: `Valid build for ${buildValue}`
      };
    };
