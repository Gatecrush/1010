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
     * Handles the build action.
     */
    export const handleBuild = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
      // Pass all necessary context to validateBuild
      const validation = validateBuild(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
      if (!validation.isValid) {
        return { success: false, newTableItems: tableItems, message: validation.message };
      }
      // Get detailed results from validation
      const { targetValue, isModification, targetBuild, summingItems, cascadingItems } = validation;

      let newBuildObject;
      // All selected items need to be removed
      let itemsToRemoveIds = selectedItems.map(item => item.id);
      // Cards that form the final build
      let finalBuildCards = [playedCard];

      // Add cards from the items that summed up to the value
      summingItems.forEach(item => {
        if (item.type === 'card') {
          finalBuildCards.push(item);
        } else if (item.type === 'build') { // This is the targetBuild being modified
          finalBuildCards.push(...item.cards);
        }
      });
      // Add cards that were cascaded (already matched the target value)
      cascadingItems.forEach(item => { // These should only be cards based on validation
        finalBuildCards.push(item);
      });

      // Determine if compound
      // It's compound if modifying, cascading, or if initial build had multiple components
      let isCompound = isModification || cascadingItems.length > 0;
      if (!isCompound) {
        const playedCardBuildValue = combinationValue(playedCard.rank);
        isCompound = playedCardBuildValue === targetValue || summingItems.some(item => combinationValue(item.rank) === targetValue);
      }

      // Create or update the build object
      if (isModification && targetBuild) {
        // Update existing build
        newBuildObject = {
          ...targetBuild,
          cards: finalBuildCards,
          controller: currentPlayer,
          isCompound: isCompound // Update compound status
        };
      } else {
        // Create new build
        newBuildObject = {
          type: 'build',
          id: generateBuildId(),
          value: targetValue,
          cards: finalBuildCards,
          controller: currentPlayer,
          isCompound: isCompound,
        };
      }

      // Filter out ALL selected items that were used
      let updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));

      // Add the new/updated build object
      // If modifying, the filter already removed the old one via itemsToRemoveIds
      updatedTableItems.push(newBuildObject);


      return {
        success: true,
        newTableItems: updatedTableItems,
        message: `Player ${currentPlayer} built ${targetValue}. ${isCompound ? '(Compound)' : '(Simple)'}`
      };
    };

    /**
     * Handles the pairing action.
     * [Previous handlePair code remains unchanged]
     */
    export const handlePair = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
      // ... (previous pair logic) ...
      const validation = validatePair(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
      if (!validation.isValid) {
        return { success: false, newTableItems: tableItems, message: validation.message };
      }
      const { rank } = validation;
      let updatedTableItems = [...tableItems];
      let newPairObject;
      const existingPair = selectedItems.length === 1 && selectedItems[0].type === 'pair' ? selectedItems[0] : null;
      if (existingPair) {
        newPairObject = { ...existingPair, cards: [...existingPair.cards, playedCard], controller: currentPlayer };
        updatedTableItems = tableItems.map(item => (item.id === existingPair.id ? newPairObject : item));
      } else {
        const itemsToRemoveIds = selectedItems.map(item => item.id);
        const combinedCards = [playedCard, ...selectedItems];
        newPairObject = { type: 'pair', id: generatePairId(), rank: rank, cards: combinedCards, controller: currentPlayer };
        updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));
        updatedTableItems.push(newPairObject);
      }
      return { success: true, newTableItems: updatedTableItems, message: `Player ${currentPlayer} paired ${rank}s.` };
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

    /**
     * Handles the capture action, allowing for multiple independent captures.
     * Sweep bonus logic removed from here.
     */
    export const handleCapture = (playedCard, selectedItems, currentPlayer,
      player1Score, player2Score, tableItems, lastCapturer) => {

      let capturedCards = [playedCard];
      let currentP1Score = player1Score;
      let currentP2Score = player2Score;
      let newTableItems = [...tableItems];
      let newLastCapturer = lastCapturer;
      let cascading = true;
      let initialMessage = `Player ${currentPlayer} captured ${selectedItems.length} item(s).`;

      // Function to perform a single capture and return updated state
      const performCapture = (card, selection, p1Score, p2Score, tableItems) => {
        // 1. Find all theoretically valid individual captures
        const allValidOptions = CaptureValidator.getValidCaptures(card, tableItems);

        // 2. Check if the user's selection is a valid combination of one or more options
        const isSelectionValid = isValidMultiCaptureSelection(selection, allValidOptions);

        if (!isSelectionValid) {
          return {
            success: false,
            newP1Score: p1Score, newP2Score: p2Score,
            newTableItems: tableItems, newLastCapturer: newLastCapturer,
            message: "Invalid capture selection.", capturedCards: []
          };
        }

        // 3. Process the valid capture
        let localCapturedCards = [card];

        // Add cards from the selected items
        selection.forEach(item => {
          if (item.type === 'card') { localCapturedCards.push(item); }
          else if (item.type === 'build' || item.type === 'pair') { localCapturedCards.push(...item.cards); }
        });

        // 4. TODO: Calculate points based on capturedCards (Aces, 10D, 2S etc.)
        // Placeholder: just add 1 point per card captured for now
        const pointsEarned = localCapturedCards.length - 1;
        if (currentPlayer === 1) { p1Score += pointsEarned; }
        else { p2Score += pointsEarned; }

        // 5. Remove captured items from the table
        if (!selection.every(item => item && item.id)) {
          console.error("Cannot remove items - selection contains items without IDs");
          return { success: false, message: "Internal error: Selected items missing IDs.", /* ... other state ... */ };
        }
        const selectedItemIds = selection.map(item => item.id);
        const newTableItems = tableItems.filter(item => !selectedItemIds.includes(item.id));

        newLastCapturer = currentPlayer;

        return {
          success: true,
          newP1Score: p1Score,
          newP2Score: p2Score,
          newTableItems: newTableItems,
          newLastCapturer: newLastCapturer,
          capturedCards: localCapturedCards
        };
      };

      // Initial capture
      let captureResult = performCapture(playedCard, selectedItems, currentP1Score, currentP2Score, newTableItems);

      if (!captureResult.success) {
        return {
          success: false,
          newP1Score: player1Score, newP2Score: player2Score,
          newTableItems: tableItems, newLastCapturer: lastCapturer,
          message: "Invalid capture selection.", capturedCards: []
        };
      }

      capturedCards.push(...captureResult.capturedCards);
      currentP1Score = captureResult.newP1Score;
      currentP2Score = captureResult.newP2Score;
      newTableItems = captureResult.newTableItems;
      newLastCapturer = captureResult.newLastCapturer;

      // Cascading captures
      while (cascading) {
        // Find new capture opportunities with the played card
        const newValidOptions = CaptureValidator.getValidCaptures(playedCard, newTableItems);

        if (newValidOptions.length === 0) {
          cascading = false;
          break;
        }

        // For simplicity, capture the first valid option
        const cascadingSelection = newValidOptions[0];

        // Perform the cascading capture
        captureResult = performCapture(playedCard, cascadingSelection, currentP1Score, currentP2Score, newTableItems);

        if (!captureResult.success) {
          cascading = false;
          break;
        }

        capturedCards.push(...captureResult.capturedCards);
        currentP1Score = captureResult.newP1Score;
        currentP2Score = captureResult.newP2Score;
        newTableItems = captureResult.newTableItems;
        newLastCapturer = captureResult.newLastCapturer;
      }

      return {
        success: true,
        newP1Score: currentP1Score,
        newP2Score: currentP2Score,
        newTableItems: newTableItems,
        newLastCapturer: newLastCapturer,
        message: initialMessage,
        capturedCards: capturedCards
      };
    };
