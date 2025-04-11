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
     * Helper to find all possible groups of numbers that sum to target
     */
    function findSumGroups(numbers, target, start = 0, current = [], result = []) {
      if (current.reduce((sum, num) => sum + num, 0) === target) {
        result.push([...current]);
        return;
      }

      for (let i = start; i < numbers.length; i++) {
        if (current.reduce((sum, num) => sum + num, 0) + numbers[i] > target) {
          continue;
        }
        current.push(numbers[i]);
        findSumGroups(numbers, target, i + 1, current, result);
        current.pop();
      }

      return result;
    }

    /**
     * Validates a complex multi-group build
     */
    export const validateComplexBuild = (playedCard, selectedItems, playerHand, targetValue) => {
      // Filter out any invalid items first
      const validItems = selectedItems.filter(item =>
        item.type === 'card' && !isFaceCard(item)
      );

      // Include the played card in our items to analyze
      const allItems = [...validItems, { type: 'card', ...playedCard }];
      const itemValues = allItems.map(item => getBuildValue(item));

      // Find all possible groups that sum to targetValue
      const validGroups = findSumGroups(itemValues, targetValue);

      if (validGroups.length === 0) {
        return { isValid: false, message: "No valid card combinations for target value" };
      }

      // Check if player has card to capture this build
      const hasCaptureCard = playerHand.some(
        card => card !== playedCard && getBuildValue(card) === targetValue
      );

      if (!hasCaptureCard) {
        return { isValid: false, message: `You need a ${targetValue} in hand to capture this build` };
      }

      return {
        isValid: true,
        targetValue,
        validGroups,
        message: `Valid multi-group build for ${targetValue}`
      };
    };

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

      // 1. Check if increasing an existing build
      let targetBuild = null;
      if (selectedItems.length === 1 && selectedItems[0].type === 'build' && selectedItems[0].controller === currentPlayer) {
        targetBuild = selectedItems[0];
        const buildValue = playedCardValue + targetBuild.value;

        // Enforce maximum build value of 10
        if (buildValue > 10) {
          return { isValid: false, message: `Build value cannot exceed 10 (tried to build ${buildValue})` };
        }

        // Verify player has capturing card (must be in hand, not counting the played card)
        if (!playerHand.some(card => card !== playedCard && getBuildValue(card) === buildValue)) {
          return { isValid: false, message: `You need a ${buildValue} in hand to capture this build.` };
        }

        return { isValid: true, buildValue: buildValue, targetBuild: targetBuild, message: `Valid build for ${buildValue}` };
      }

      // 2. Check if it's a complex build (multiple cards selected)
      if (selectedItems.length > 1) {
        // Calculate the target value (the value of the card in hand)
        const targetValue = playedCardValue + selectedItems.reduce((sum, item) => sum + getItemValue(item), 0);

        // Enforce maximum build value of 10
        if (targetValue > 10) {
          return { isValid: false, message: `Build value cannot exceed 10 (tried to build ${targetValue})` };
        }

        // Call validateComplexBuild to handle the complex validation
        return validateComplexBuild(playedCard, selectedItems, playerHand, targetValue, tableItems, currentPlayer);
      }

      // 3. Creating a new build with a single table card
      else {
        let totalValue = playedCardValue;
        for (const item of selectedItems) {
          if (item.type === 'card') {
            totalValue += getBuildValue(item);
          }
        }

        // Enforce maximum build value of 10
        if (totalValue > 10) {
          return { isValid: false, message: `Build value cannot exceed 10 (tried to build ${totalValue})` };
        }

        // Verify player has capturing card (must be in hand, not counting the played card)
        if (!playerHand.some(card => card !== playedCard && getBuildValue(card) === totalValue)) {
          return { isValid: false, message: `You need a ${totalValue} in hand to capture this build.` };
        }

        return { isValid: true, buildValue: totalValue, targetBuild: null, message: `Valid build for ${totalValue}` };
      }
    };
