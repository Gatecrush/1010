// src/modules/turns.js
    import { validateBuild } from './buildLogic';
    import { validatePair } from './pairLogic';
    import { getValue, captureValues, combinationValue } from './deck';
    import { CaptureValidator, areItemSetsEqual } from './captureLogic';

    // Simple ID generator
    let nextBuildId = 0;
    const generateBuildId = () => `build-${nextBuildId++}`;
    let nextPairId = 0;
    const generatePairId = () => `pair-${nextPairId++}`;

    /**
     * Creates a new build or modifies an existing one.
     * @param {object} validationResult - The result of validateBuild function.
     * @param {object} playedCard - The card played from the hand.
     * @param {number} currentPlayer - The ID of the current player.
     * @returns {object} - The new or modified build object.
     * @throws {Error} - If the validationResult is not valid.
     */
    const createBuild = (validationResult, playedCard, currentPlayer) => {
      if (!validationResult.isValid) {
        throw new Error("Cannot create invalid build");
      }

      const { buildValue, targetBuild, summingItems } = validationResult;

      if (targetBuild) {
        // 1. Increasing an Existing Build
        return {
          ...targetBuild,
          value: buildValue,
          cards: [...targetBuild.cards, playedCard], // Use 'cards' for consistency
          modified: true
        };
      } else {
        // 2. Creating a New Multiple Build
        const selectedCards = summingItems.filter(item => item.type === 'card'); // Extract cards only
        return {
          type: 'build',
          id: generateBuildId(), // Ensure ID generation
          isCompound: summingItems.some(item => item.type === 'build'), // True if incorporating other builds
          value: buildValue,
          controller: currentPlayer,
          cards: [playedCard, ...selectedCards], // Use 'cards' for consistency
          modified: false
        };
      }
    };

    /**
     * Creates a complex multi-group build
     */
    const createComplexBuild = (validationResult, playedCard, currentPlayer) => {
      const { buildValue, validGroups, selectedItems } = validationResult;

      const allSelectedCards = selectedItems.filter(item => item.type === 'card');

      return {
        type: 'build',
        id: generateBuildId(),
        isCompound: true,
        value: buildValue,
        controller: currentPlayer,
        cards: [playedCard, ...allSelectedCards], // Add played card and selected cards
        groups: validGroups, // Store the grouping information
        modified: false
      };
    };

    /**
     * Validates if a player can capture a build.
     * @param {object} playedCard - The card played from the hand.
     * @param {object} targetBuild - The build object to capture.
     * @param {number} currentPlayer - The ID of the current player.
     * @returns {object} - An object containing the validation result.
     */
    const validateBuildCapture = (playedCard, targetBuild, currentPlayer) => {
      if (!playedCard || !targetBuild) {
        return { isValid: false, message: "Select a card from hand and a build from table." };
      }

      if (targetBuild.type !== 'build') {
        return { isValid: false, message: "Selected item is not a build." };
      }

      if (targetBuild.controller !== currentPlayer) {
        return { isValid: false, message: "Cannot capture opponent's builds." };
      }

      if (getValue(playedCard.rank) !== targetBuild.value) {
        return { isValid: false, message: "Card value must match build value." };
      }

      return { isValid: true, message: "Valid build capture." };
    };

    /**
     * Removes items from the table and returns the updated table items and captured cards.
     * @param {array} tableItems - The current items on the table.
     * @param {array} itemsToRemove - An array of items to remove from the table.
     * @returns {object} - An object containing the updated table items and the captured cards.
     */
    const removeItemsFromTable = (tableItems, itemsToRemove) => {
      const capturedCards = [];
      const itemsToRemoveIds = itemsToRemove.map(item => item.id);

      // Extract cards from items to remove
      itemsToRemove.forEach(item => {
        if (item.type === 'card') {
          capturedCards.push(item);
        } else if (item.type === 'build' || item.type === 'pair') {
          capturedCards.push(...item.cards);
        }
      });

      // Filter out removed items from the table
      const updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));

      return { updatedTableItems, capturedCards };
    };

    /**
     * Handles cascading captures after an initial capture.
     * @param {object} playedCard - The card played from the hand that initiated the capture.
     * @param {array} tableItems - The current items on the table (cards, builds, pairs).
     * @returns {object} - An object containing the remaining table items and the captured items.
     */
    const handleCascadingCaptures = (playedCard, tableItems) => {
      let currentTable = [...tableItems];
      let allCaptured = [];

      // 1. Find all valid capture options based on the played card and the remaining table items
      const validCaptureOptions = CaptureValidator.getValidCaptures(playedCard, currentTable);

      if (validCaptureOptions.length === 0) {
        // No more captures possible, return the current state
        return {
          remainingTable: currentTable,
          capturedItems: allCaptured,
        };
      }

      // 2. Process the captures
      validCaptureOptions.forEach(captureSet => {
        // Remove the captured items from the current table
        const { updatedTableItems, capturedCards } = removeItemsFromTable(currentTable, captureSet);
        currentTable = updatedTableItems;

        // Add the captured items to the list of all captured items
        allCaptured = [...allCaptured, ...capturedCards];
      });

      // 3. Recursively call handleCascadingCaptures with the updated table and captured items
      return handleCascadingCaptures(playedCard, currentTable, allCaptured);
    };

    /**
     * Handles the capture action, allowing for multiple independent captures and cascading captures.
     */
    export const handleCapture = (playedCard, selectedItems, currentPlayer,
      player1Score, player2Score, tableItems, lastCapturer) => {

      // 1. If capturing a build, validate the build capture
      if (selectedItems.length === 1 && selectedItems[0].type === 'build') {
        const validationResult = validateBuildCapture(playedCard, selectedItems[0], currentPlayer);
        if (!validationResult.isValid) {
          return {
            success: false,
            newP1Score: player1Score, newP2Score: player2Score,
            newTableItems: tableItems, newLastCapturer: lastCapturer,
            message: validationResult.message, capturedCards: []
          };
        }
      }

      // 2. Validate initial capture selection
      const allValidOptions = CaptureValidator.getValidCaptures(playedCard, tableItems);
      const isSelectionValid = isValidMultiCaptureSelection(selectedItems, allValidOptions);

      if (!isSelectionValid) {
        return {
          success: false,
          newP1Score: player1Score, newP2Score: player2Score,
          newTableItems: tableItems, newLastCapturer: lastCapturer,
          message: "Invalid capture selection.", capturedCards: []
        };
      }

      // 3. Perform initial capture and remove items from table
      const { updatedTableItems: initialTable, capturedCards: initialCaptured } = removeItemsFromTable(tableItems, selectedItems);

      // 4. Handle cascading captures
      const cascadingResult = handleCascadingCaptures(playedCard, initialTable);

      // 5. Combine initial and cascading captures
      const allCapturedCards = [playedCard, ...initialCaptured, ...cascadingResult.capturedItems];
      const newTableItems = cascadingResult.remainingTable;

      // 6. Calculate score
      let currentP1Score = player1Score;
      let currentP2Score = player2Score;
      const pointsEarned = allCapturedCards.length - 1;
      if (currentPlayer === 1) { currentP1Score += pointsEarned; }
      else { currentP2Score += pointsEarned; }

      // 7. Update last capturer
      const newLastCapturer = currentPlayer;

      return {
        success: true,
        newP1Score: currentP1Score,
        newP2Score: currentP2Score,
        newTableItems: newTableItems,
        newLastCapturer: newLastCapturer,
        message: `Player ${currentPlayer} captured ${allCapturedCards.length - 1} item(s).`,
        capturedCards: allCapturedCards
      };
    };

    /**
     * Handles the build action.
     */
    export const handleBuild = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
      // Pass all necessary context to validateBuild
      const validation = validateBuild(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
      if (!validation.isValid) {
        return { success: false, newTableItems: tableItems, message: validation.message };
      }

      const { buildValue, targetBuild, validGroups } = validation;

      let newBuildObject;

      if (targetBuild) {
        // Increasing existing build
        newBuildObject = {
          ...targetBuild,
          value: buildValue,
          cards: [...targetBuild.cards, playedCard],
        };
      } else {
        // Check if it's a complex build (multiple groups)
        if (validGroups) {
          newBuildObject = createComplexBuild(validation, currentPlayer);
        }
        else {
          newBuildObject = {
            type: 'build',
            id: generateBuildId(),
            value: buildValue,
            controller: currentPlayer,
            cards: selectedItems.filter(item => item.type === 'card'), // Ensure only cards are added
          };
        }
      }

      let updatedTableItems = [...tableItems];
      // Remove selected items from the table
      updatedTableItems = tableItems.filter(item => selectedItems.map(si => si.id).includes(item.id));
      // Add the new build object to the table
      updatedTableItems.push(newBuildObject);

      return {
        success: true,
        newTableItems: updatedTableItems,
        message: `Player ${currentPlayer} created a build of ${newBuildObject.value}.`
      };
    };

    /**
     * Handles the pairing action.
     */
    export const handlePair = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
      const validation = validatePair(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
      if (!validation.isValid) {
        return { success: false, newTableItems: tableItems, message: validation.message };
      }

      const { rank } = validation;
      let updatedTableItems = [...tableItems];
      let newPairObject;

      // Check if we're adding to an existing pair
      const existingPair = selectedItems.length === 1 && selectedItems[0].type === 'pair' ? selectedItems[0] : null;

      if (existingPair) {
        // Add the played card to the existing pair
        newPairObject = { ...existingPair, cards: [...existingPair.cards, playedCard], controller: currentPlayer };
        updatedTableItems = tableItems.map(item => (item.id === existingPair.id ? newPairObject : item));
      } else {
        // Create a new pair
        const itemsToRemoveIds = selectedItems.map(item => item.id);
        const combinedCards = [playedCard, ...selectedItems];
        newPairObject = { type: 'pair', id: generatePairId(), rank: rank, cards: combinedCards, controller: currentPlayer };
        updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));
        updatedTableItems.push(newPairObject);
      }

      return {
        success: true,
        newTableItems: updatedTableItems,
        message: `Player ${currentPlayer} paired ${rank}s.`,
      };
    };

    /**
     * Checks if the user's selected items can be perfectly partitioned into
     * one or more valid capture sets.
     * [isValidMultiCaptureSelection function remains unchanged]
     */
    const isValidMultiCaptureSelection = (selectedItems, validCaptureOptions) => {
      // ... (previous multi-capture validation logic) ...
      if (!selectedItems || selectedItems.length === 0 || !validCaptureOptions || validCaptureOptions.length === 0) { return false; }
      if (!selectedItems.every(item => item && item.id)) { console.error("Some selected items are missing IDs"); return false; }
      let remainingSelectedItemIds = new Set(selectedItems.map(item => item.id));
      let currentOptions = [...validCaptureOptions];
      let progressMade = true;
      while (progressMade && remainingSelectedItemIds.size > 0) {
        progressMade = false;
        let optionUsedIndex = -1;
        for (let i = 0; i < currentOptions.length; i++) {
          const validSet = currentOptions[i];
          if (!validSet.every(item => item && item.id)) { console.error("Valid capture option contains item(s) without ID:", validSet); continue; }
          const validSetIds = validSet.map(item => item.id);
          const canUseSet = validSetIds.every(id => remainingSelectedItemIds.has(id));
          if (canUseSet) {
            validSetIds.forEach(id => remainingSelectedItemIds.delete(id));
            progressMade = true; optionUsedIndex = i; break;
          }
        }
        if (optionUsedIndex !== -1) { currentOptions.splice(optionUsedIndex, 1); }
      }
      return remainingSelectedItemIds.size === 0;
    };
